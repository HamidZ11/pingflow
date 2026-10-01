import {
  type ContentType,
  contentBody,
  contentTypes,
} from "@/domain/channel/inbound";
import { phoneFromInternational } from "@/domain/contacts/phone";
import { reminderMessage } from "@/domain/messages/templates";
import { processInboundMessage } from "@/features/messages/pipeline";
import {
  type DispatchSummary,
  dispatchNext,
} from "@/features/whatsapp/dispatch";
import type { WhatsAppDeps } from "@/features/whatsapp/deps";
import type { Database } from "@/lib/supabase/database.types";

// The WhatsApp worker: everything that happens after a webhook has been
// stored, or after an owner's approval has queued a confirmation.
//
//   1. recover   sends that stopped mid-way are reported, never repeated
//   2. inbound   stored webhook events, oldest first per customer: messages
//                go through the same pipeline as the simulator; statuses
//                update the outbox
//   3. remind    due reminders become outbound messages
//   4. send      queued messages go out under the channel rules
//
// Safe to run many at once: every step claims its work in the database.
// Run by the webhook (after responding), after owner actions, by a
// scheduled call to /api/internal/whatsapp/work, or `pnpm whatsapp work`.

type Event = Database["public"]["Tables"]["whatsapp_events"]["Row"];

export type WorkSummary = {
  recovered: number;
  events: { done: number; ignored: number; retried: number; failed: number };
  reminders: number;
  sends: DispatchSummary;
};

const EVENT_RETRY_SECONDS = [30, 120, 600, 1800];
const MAX_EVENT_ATTEMPTS = 5;

export async function runWhatsAppWork(
  deps: WhatsAppDeps,
  limits: { events?: number; sends?: number; reminders?: number } = {},
): Promise<WorkSummary> {
  const summary: WorkSummary = {
    recovered: 0,
    events: { done: 0, ignored: 0, retried: 0, failed: 0 },
    reminders: 0,
    sends: { accepted: 0, retried: 0, failed: 0, blocked: 0, throttled: false },
  };

  const { data: recovered, error } = await deps.db.rpc(
    "recover_stale_deliveries",
    {},
  );
  if (error) throw error;
  summary.recovered = recovered ?? 0;

  for (let i = 0; i < (limits.events ?? 50); i++) {
    const { data, error: claimError } = await deps.db.rpc(
      "claim_whatsapp_event",
      {},
    );
    if (claimError) throw claimError;
    const event = (data as Event[] | null)?.[0];
    if (!event) break;
    await handleEvent(deps, event, summary);
  }

  summary.reminders = await queueDueReminders(deps, limits.reminders ?? 50);

  for (let i = 0; i < (limits.sends ?? 50); i++) {
    if (summary.sends.throttled) break;
    if (!(await dispatchNext(deps, summary.sends))) break;
  }

  deps.log?.("whatsapp.work", {
    recovered: summary.recovered,
    ...summary.events,
    reminders: summary.reminders,
    ...summary.sends,
  });
  return summary;
}

/** Only sends: for right after an owner's approval or reply. */
export async function sendQueued(deps: WhatsAppDeps, limit = 10) {
  const sends: DispatchSummary = {
    accepted: 0,
    retried: 0,
    failed: 0,
    blocked: 0,
    throttled: false,
  };
  for (let i = 0; i < limit && !sends.throttled; i++) {
    if (!(await dispatchNext(deps, sends))) break;
  }
  return sends;
}

async function finish(
  deps: WhatsAppDeps,
  event: Event,
  status: "done" | "ignored" | "failed" | "unroutable",
  extra: { messageId?: string; error?: string; retryAt?: Date } = {},
) {
  const { error } = await deps.db.rpc("finish_whatsapp_event", {
    p_event_id: event.id,
    p_attempt: event.attempts,
    p_status: status,
    p_message_id: extra.messageId,
    p_error_category: extra.error,
    p_retry_at: extra.retryAt?.toISOString(),
  });
  if (error) throw error;
}

async function handleEvent(
  deps: WhatsAppDeps,
  event: Event,
  summary: WorkSummary,
) {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  try {
    if (event.kind === "status") {
      await handleStatus(deps, event, payload);
    } else if (event.kind === "message") {
      await handleMessage(deps, event, payload);
    } else {
      await finish(deps, event, "ignored");
      summary.events.ignored++;
      return;
    }
    summary.events.done++;
  } catch (error) {
    const attempts = event.attempts;
    const retry = attempts < MAX_EVENT_ATTEMPTS;
    const delay = EVENT_RETRY_SECONDS[Math.min(attempts - 1, 3)];
    const now = deps.now?.() ?? new Date();
    deps.log?.("whatsapp.event_error", {
      eventId: event.id,
      kind: event.kind,
      attempts,
      // The last try: the event stays failed until someone retries it
      // (`pnpm whatsapp retry-failed`). Worth an alert.
      final: !retry,
      error: error instanceof Error ? error.message : String(error),
    });
    await finish(deps, event, "failed", {
      error: "processing_error",
      retryAt: retry ? new Date(now.getTime() + delay * 1000) : undefined,
    });
    if (retry) summary.events.retried++;
    else summary.events.failed++;
  }
}

async function handleMessage(
  deps: WhatsAppDeps,
  event: Event,
  payload: Record<string, unknown>,
) {
  if (!event.business_id || !event.connection_id || !event.wa_message_id) {
    await finish(deps, event, "unroutable", { error: "unknown_number" });
    return;
  }
  // The connection may have gone since the event arrived.
  const { data: connection } = await deps.db
    .from("whatsapp_connections")
    .select("status")
    .eq("id", event.connection_id)
    .maybeSingle();
  if (
    connection?.status !== "connected" &&
    connection?.status !== "needs_attention"
  ) {
    await finish(deps, event, "ignored", { error: "not_connected" });
    return;
  }

  const phone =
    typeof payload.sender_wa_id === "string"
      ? phoneFromInternational(payload.sender_wa_id)
      : null;
  if (!phone) {
    // A WhatsApp user with a username can message without sharing their
    // number. Pingflow identifies customers by number, so the owner
    // answers this one in WhatsApp.
    await deps.db.from("pending_actions").insert({
      business_id: event.business_id,
      kind: "failure",
      understood: {
        reason: "number_not_shared",
        summary:
          "Someone messaged on WhatsApp without sharing their number, so Pingflow can’t tell who it is. Reply in WhatsApp.",
      },
    });
    await finish(deps, event, "done", { error: "no_phone_number" });
    return;
  }

  const contentType: ContentType = contentTypes.includes(
    payload.content_type as ContentType,
  )
    ? (payload.content_type as ContentType)
    : "unknown";
  const text = typeof payload.text === "string" ? payload.text : null;
  const body =
    contentType === "text" && text?.trim()
      ? text
      : contentBody(contentType === "text" ? "unknown" : contentType, text);

  const report = await processInboundMessage(deps.pipeline, {
    businessId: event.business_id,
    from: phone,
    body,
    receivedAt: new Date(event.occurred_at),
    externalId: event.wa_message_id,
    source: "whatsapp",
    contentType:
      contentType === "text" && !text?.trim() ? "unknown" : contentType,
  });

  await deps.db
    .from("whatsapp_connections")
    .update({ last_inbound_at: event.occurred_at })
    .eq("id", event.connection_id)
    .or(`last_inbound_at.is.null,last_inbound_at.lt.${event.occurred_at}`);

  deps.log?.("whatsapp.message", {
    eventId: event.id,
    providerMessageId: event.wa_message_id,
    messageId: report.messageId,
    runId: report.runId,
    duplicate: report.duplicate,
    status: report.status,
  });
  await finish(deps, event, "done", { messageId: report.messageId });
}

async function handleStatus(
  deps: WhatsAppDeps,
  event: Event,
  payload: Record<string, unknown>,
) {
  if (!event.connection_id || !event.wa_message_id) {
    await finish(deps, event, "unroutable", { error: "unknown_number" });
    return;
  }
  const status = String(payload.status);
  const { data, error } = await deps.db.rpc("apply_whatsapp_status", {
    p_connection_id: event.connection_id,
    p_provider_message_id: event.wa_message_id,
    p_status: status,
    p_at: event.occurred_at,
    p_error_code:
      typeof payload.error_code === "number" ? payload.error_code : undefined,
  });
  if (error) throw error;
  const applied = data as {
    found: boolean;
    message_id?: string;
    delivery?: string;
  };
  if (!applied.found) {
    // Not something Pingflow sent (for example a message from the WhatsApp
    // Business app on a shared number).
    await finish(deps, event, "ignored", { error: "not_ours" });
    return;
  }

  const pricing = payload.pricing as {
    billable: boolean | null;
    category: string | null;
    type: string | null;
    model: string | null;
  } | null;
  if (pricing) await applyStatusPricing(deps, event.wa_message_id, pricing);

  deps.log?.("whatsapp.status", {
    providerMessageId: event.wa_message_id,
    messageId: applied.message_id,
    status,
    delivery: applied.delivery,
  });
  await finish(deps, event, "done", { messageId: applied.message_id });
}

/**
 * WhatsApp says in its status webhooks whether a message is billable and
 * in which pricing category (utility, service…). That goes on the usage row
 * for the send; the charge itself isn't estimated here.
 */
async function applyStatusPricing(
  deps: WhatsAppDeps,
  providerMessageId: string,
  pricing: {
    billable: boolean | null;
    category: string | null;
    type: string | null;
    model: string | null;
  },
) {
  const { data: rows } = await deps.db
    .from("usage_events")
    .select("id, metadata")
    .eq("provider", "meta")
    .eq("external_reference", providerMessageId);
  for (const row of rows ?? []) {
    await deps.db
      .from("usage_events")
      .update({
        billable: pricing.billable,
        message_category: pricing.category?.slice(0, 40) ?? null,
        metadata: {
          ...((row.metadata ?? {}) as Record<string, unknown>),
          pricing_type: pricing.type,
          pricing_model: pricing.model,
        },
      })
      .eq("id", row.id);
  }
}

/**
 * Reminders that are due, for businesses with a live WhatsApp connection.
 * Businesses without one keep their reminders scheduled, as before.
 */
async function queueDueReminders(deps: WhatsAppDeps, limit: number) {
  const now = deps.now?.() ?? new Date();
  const { data: connected, error } = await deps.db
    .from("whatsapp_connections")
    .select("business_id")
    .in("status", ["connected", "needs_attention"]);
  if (error) throw error;
  if (!connected.length) return 0;

  const { data: due, error: dueError } = await deps.db
    .from("reminders")
    .select(
      `id, business_id,
       booking:bookings ( starts_at, customer:customers ( full_name ), service:services ( name ) )`,
    )
    .in(
      "business_id",
      connected.map((c) => c.business_id),
    )
    .eq("status", "scheduled")
    .is("message_id", null)
    .lte("send_at", now.toISOString())
    .order("send_at")
    .limit(limit);
  if (dueError) throw dueError;

  const { data: businesses, error: businessError } = await deps.db
    .from("businesses")
    .select("id, timezone")
    .in("id", [...new Set(due.map((r) => r.business_id))]);
  if (businessError) throw businessError;
  const timeZones = new Map(businesses.map((b) => [b.id, b.timezone]));

  let queued = 0;
  for (const reminder of due) {
    const booking = reminder.booking;
    if (!booking?.customer) continue;
    const body = reminderMessage({
      customerName: booking.customer.full_name,
      serviceName: booking.service?.name ?? "booking",
      startsAt: new Date(booking.starts_at),
      timeZone: timeZones.get(reminder.business_id) ?? "Europe/London",
    });
    const { data: outcome, error: queueError } = await deps.db.rpc(
      "queue_reminder",
      { p_reminder_id: reminder.id, p_body: body },
    );
    if (queueError) throw queueError;
    deps.log?.("whatsapp.reminder", { reminderId: reminder.id, outcome });
    queued++;
  }
  return queued;
}
