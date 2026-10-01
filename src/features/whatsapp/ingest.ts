import type { Database, Json } from "@/lib/supabase/database.types";
import { verifySignature } from "@/lib/whatsapp/signature";
import {
  parseWebhook,
  type WebhookEvent,
} from "@/lib/whatsapp/webhook-payload";
import type { WhatsAppDeps } from "@/features/whatsapp/deps";

// The webhook's only job: prove the request came from Meta, store each
// event once, and answer quickly. Processing happens afterwards, from the
// stored events (worker.ts), so a slow model or a failing send never holds
// Meta's request open, and nothing is lost if processing stops half-way.

export type IngestResult =
  | { status: 200; stored: number; duplicates: number }
  | { status: 400 | 401; reason: "bad_signature" | "bad_json" };

type Connection = {
  id: string;
  business_id: string;
  status: "connecting" | "connected" | "needs_attention" | "disconnected";
  phone_number_id: string;
};

const live = (c: Connection | undefined) =>
  c?.status === "connected" || c?.status === "needs_attention";

export async function ingestWebhook(
  deps: Pick<WhatsAppDeps, "db" | "log" | "now">,
  input: { rawBody: Uint8Array; signature: string | null; appSecret: string },
): Promise<IngestResult> {
  if (!verifySignature(input.rawBody, input.signature, input.appSecret)) {
    deps.log?.("whatsapp.webhook_rejected", { reason: "bad_signature" });
    return { status: 401, reason: "bad_signature" };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(input.rawBody));
  } catch {
    deps.log?.("whatsapp.webhook_rejected", { reason: "bad_json" });
    return { status: 400, reason: "bad_json" };
  }

  const now = deps.now?.() ?? new Date();
  const events = parseWebhook(payload, now);
  if (events.length === 0) return { status: 200, stored: 0, duplicates: 0 };

  // Route by Meta's phone number ID, never by the customer's number. A live
  // connection wins over older, disconnected ones for the same number.
  const numbers = [
    ...new Set(
      events.flatMap((e) => (e.phoneNumberId ? [e.phoneNumberId] : [])),
    ),
  ];
  const { data: found, error } = numbers.length
    ? await deps.db
        .from("whatsapp_connections")
        .select("id, business_id, status, phone_number_id")
        .in("phone_number_id", numbers)
        .order("created_at", { ascending: false })
    : { data: [] as Connection[], error: null };
  if (error) throw error;
  const byNumber = new Map<string, Connection>();
  for (const c of found as Connection[]) {
    const seen = byNumber.get(c.phone_number_id);
    if (!seen || (!live(seen) && live(c))) byNumber.set(c.phone_number_id, c);
  }

  const rows = events.map((event) => toRow(event, byNumber));
  const { data: inserted, error: insertError } = await deps.db
    .from("whatsapp_events")
    .upsert(rows, { onConflict: "event_key", ignoreDuplicates: true })
    .select("id");
  if (insertError) throw insertError;

  const reached = [...byNumber.values()].map((c) => c.id);
  if (reached.length) {
    await deps.db
      .from("whatsapp_connections")
      .update({ last_webhook_at: now.toISOString() })
      .in("id", reached);
  }

  const stored = inserted?.length ?? 0;
  deps.log?.("whatsapp.webhook_stored", {
    events: events.length,
    stored,
    duplicates: events.length - stored,
  });
  return { status: 200, stored, duplicates: events.length - stored };
}

type EventInsert = Database["public"]["Tables"]["whatsapp_events"]["Insert"];

function toRow(
  event: WebhookEvent,
  byNumber: Map<string, Connection>,
): EventInsert {
  const connection = event.phoneNumberId
    ? byNumber.get(event.phoneNumberId)
    : undefined;
  const base = {
    event_key: event.key,
    kind: event.kind,
    phone_number_id: event.phoneNumberId,
    connection_id: connection?.id ?? null,
    business_id: connection?.business_id ?? null,
  };

  if (event.kind === "other") {
    return {
      ...base,
      occurred_at: new Date().toISOString(),
      payload: { field: event.field } as NonNullable<Json>,
      status: "ignored" as const,
      error_category: "unsupported_field",
    };
  }

  if (event.kind === "status") {
    const known = event.status !== "other" && event.status !== "played";
    return {
      ...base,
      wa_message_id: event.messageId,
      occurred_at: event.at.toISOString(),
      payload: {
        status: event.status,
        pricing: event.pricing,
        error_code: event.errorCode,
      } as NonNullable<Json>,
      status: !connection
        ? ("unroutable" as const)
        : known
          ? ("pending" as const)
          : ("ignored" as const),
      error_category: !connection
        ? "unknown_number"
        : known
          ? null
          : "status_not_tracked",
    };
  }

  const status = !connection
    ? ("unroutable" as const)
    : !live(connection)
      ? ("ignored" as const)
      : event.contentType === null
        ? ("ignored" as const)
        : ("pending" as const);
  return {
    ...base,
    wa_message_id: event.messageId,
    sender: event.senderWaId ?? event.senderUserId,
    occurred_at: event.sentAt.toISOString(),
    payload: {
      type: event.providerType,
      content_type: event.contentType,
      sender_wa_id: event.senderWaId,
      sender_user_id: event.senderUserId,
      // Only while it waits to be processed; removed once stored.
      ...(status === "pending" ? { text: event.text } : {}),
    } as NonNullable<Json>,
    status,
    error_category: !connection
      ? "unknown_number"
      : !live(connection)
        ? "not_connected"
        : event.contentType === null
          ? "not_actionable"
          : null,
  };
}
