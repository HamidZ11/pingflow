import { countryOfPhone } from "@/domain/contacts/phone";
import {
  type ApprovedTemplate,
  decideSend,
  type SendPurpose,
  type TemplatePurpose,
} from "@/domain/channel/send-policy";
import { templateParameters, templateValues } from "@/domain/channel/templates";
import { serviceWindow } from "@/domain/channel/window";
import { messagingUsage } from "@/domain/usage/usage-event";
import type { WhatsAppDeps } from "@/features/whatsapp/deps";
import type { SendResult } from "@/lib/messaging/transport";
import type { Json } from "@/lib/supabase/database.types";
import { writeUsage } from "@/lib/usage/ledger";
import { MAX_SEND_ATTEMPTS, retryDelaySeconds } from "@/lib/whatsapp/config";

// The outbox dispatcher. Each queued message is claimed by one worker,
// checked against the channel rules (connection, 24-hour window, approved
// templates), sent once, and its outcome recorded. A message WhatsApp has
// accepted is never sent again; a send whose outcome is unknown is never
// retried automatically.

type Claimed = {
  message_id: string;
  business_id: string;
  attempt: number;
  body: string;
  author: "pingflow" | "owner" | "contact";
  purpose: SendPurpose;
  booking: {
    id: string;
    status: string;
    starts_at: string;
    customer_name: string;
    service_name: string | null;
  } | null;
  time_zone: string;
  business_name: string | null;
  to: string | null;
  last_inbound_at: string | null;
  connection: {
    id: string;
    status: string;
    mode: "developer" | "embedded_signup";
    phone_number_id: string;
    waba_id: string | null;
  } | null;
};

type Outcome =
  | {
      outcome: "accepted";
      provider_message_id: string;
      sent_via: "text" | "template";
      template_name?: string;
    }
  | {
      outcome: "retry";
      retry_at: string;
      error_category: string;
      error_code: number | null;
    }
  | {
      outcome: "failed" | "blocked";
      error_category: string;
      error_code?: number | null;
    };

export type DispatchSummary = {
  accepted: number;
  retried: number;
  failed: number;
  blocked: number;
  /** A rate limit was hit: stop for this run. */
  throttled: boolean;
};

async function approvedTemplates(
  deps: WhatsAppDeps,
  connectionId: string,
): Promise<Partial<Record<TemplatePurpose, ApprovedTemplate>>> {
  const { data, error } = await deps.db
    .from("whatsapp_templates")
    .select("purpose, name, language, parameters")
    .eq("connection_id", connectionId)
    .eq("provider_status", "APPROVED");
  if (error) throw error;
  return Object.fromEntries(
    data.map((t) => [
      t.purpose,
      {
        purpose: t.purpose,
        name: t.name,
        language: t.language,
        parameters: t.parameters,
      },
    ]),
  );
}

async function markConnection(
  deps: WhatsAppDeps,
  connectionId: string,
  category: string,
) {
  const now = (deps.now?.() ?? new Date()).toISOString();
  await deps.db
    .from("whatsapp_connections")
    .update({
      status: "needs_attention",
      last_error_category: category,
      last_error_at: now,
    })
    .eq("id", connectionId)
    .eq("status", "connected");
  deps.log?.("whatsapp.connection_needs_attention", { connectionId, category });
}

/** Sends the next due message, if any. Returns false when there's none. */
export async function dispatchNext(
  deps: WhatsAppDeps,
  summary: DispatchSummary,
): Promise<boolean> {
  const { data, error } = await deps.db.rpc("claim_outbound_delivery");
  if (error) throw error;
  if (!data) return false;
  const job = data as unknown as Claimed;
  const now = deps.now?.() ?? new Date();

  const outcome = await send(deps, job, now);
  const { data: recorded, error: recordError } = await deps.db.rpc(
    "record_delivery_result",
    {
      p_message_id: job.message_id,
      p_attempt: job.attempt,
      p_result: outcome as unknown as Json,
    },
  );
  if (recordError) throw recordError;
  if (!recorded) {
    deps.log?.("whatsapp.send_stale", { messageId: job.message_id });
    return true;
  }

  if (outcome.outcome === "accepted") {
    summary.accepted++;
    await recordSendUsage(deps, job, outcome);
  } else if (outcome.outcome === "retry") {
    summary.retried++;
  } else if (outcome.outcome === "failed") {
    summary.failed++;
  } else {
    summary.blocked++;
  }
  deps.log?.("whatsapp.send", {
    messageId: job.message_id,
    attempt: job.attempt,
    purpose: job.purpose,
    outcome: outcome.outcome,
    category: "error_category" in outcome ? outcome.error_category : undefined,
    providerMessageId:
      outcome.outcome === "accepted" ? outcome.provider_message_id : undefined,
  });
  if (
    outcome.outcome === "retry" &&
    outcome.error_category === "transient" &&
    outcome.error_code !== null &&
    [4, 80007, 130429, 131048, 131056].includes(outcome.error_code)
  ) {
    summary.throttled = true;
  }
  return true;
}

async function send(
  deps: WhatsAppDeps,
  job: Claimed,
  now: Date,
): Promise<Outcome> {
  const connection = job.connection;
  if (!connection || connection.status !== "connected") {
    return { outcome: "blocked", error_category: "connection_unavailable" };
  }
  if (!job.to) {
    return { outcome: "failed", error_category: "no_recipient" };
  }
  const credentials = await deps.credentials.getCredentials({
    id: connection.id,
    mode: connection.mode,
    phoneNumberId: connection.phone_number_id,
  });
  if (!credentials) {
    await markConnection(deps, connection.id, "credentials_missing");
    return { outcome: "blocked", error_category: "connection_unavailable" };
  }

  const templates = await approvedTemplates(deps, connection.id);
  const window = serviceWindow(
    job.last_inbound_at ? new Date(job.last_inbound_at) : null,
    now,
  );
  const transport = deps.transportFor(credentials);

  const attempt = async (
    windowOpen: boolean,
  ): Promise<
    | { result: SendResult; via: "text" | "template"; template?: string }
    | Outcome
  > => {
    const decision = decideSend({
      purpose: job.purpose,
      booking: job.booking,
      window: windowOpen ? window : { open: false, closedAt: null },
      templates,
    });
    if (decision.action === "block") {
      return { outcome: "blocked", error_category: decision.reason };
    }
    if (decision.action === "send_text") {
      return {
        result: await transport.sendText({ to: job.to!, body: job.body }),
        via: "text",
      };
    }
    const booking = job.booking;
    const parameters = booking
      ? templateParameters(
          decision.template.parameters,
          templateValues({
            customerName: booking.customer_name,
            serviceName: booking.service_name,
            startsAt: new Date(booking.starts_at),
            timeZone: job.time_zone,
            businessName: job.business_name,
          }),
        )
      : null;
    if (!parameters) {
      return { outcome: "blocked", error_category: "template_misconfigured" };
    }
    return {
      result: await transport.sendTemplate({
        to: job.to!,
        name: decision.template.name,
        language: decision.template.language,
        parameters,
      }),
      via: "template",
      template: decision.template.name,
    };
  };

  let sent = await attempt(window.open);
  // WhatsApp's clock says the window has closed: use the template if
  // there is one, once.
  if (
    "result" in sent &&
    !sent.result.ok &&
    sent.result.category === "window_closed" &&
    sent.via === "text"
  ) {
    sent = await attempt(false);
  }
  if (!("result" in sent)) return sent;

  const { result } = sent;
  if (result.ok) {
    return {
      outcome: "accepted",
      provider_message_id: result.providerMessageId,
      sent_via: sent.via,
      ...(sent.template ? { template_name: sent.template } : {}),
    };
  }

  switch (result.category) {
    case "transient":
      if (job.attempt >= MAX_SEND_ATTEMPTS) {
        return {
          outcome: "failed",
          error_category: "gave_up",
          error_code: result.code,
        };
      }
      return {
        outcome: "retry",
        retry_at: new Date(
          now.getTime() +
            retryDelaySeconds(job.attempt, result.retryAfter) * 1000,
        ).toISOString(),
        error_category: "transient",
        error_code: result.code,
      };
    case "connection":
      await markConnection(deps, connection.id, "provider_refused");
      return {
        outcome: "blocked",
        error_category: "connection_unavailable",
        error_code: result.code,
      };
    case "window_closed":
      return {
        outcome: "blocked",
        error_category: "template_required",
        error_code: result.code,
      };
    case "template_rejected":
      if (sent.template) {
        await deps.db
          .from("whatsapp_templates")
          .update({ provider_status: "UNUSABLE", last_error_code: result.code })
          .eq("connection_id", connection.id)
          .eq("name", sent.template);
      }
      return {
        outcome: "failed",
        error_category: "template_rejected",
        error_code: result.code,
      };
    default:
      return {
        outcome: "failed",
        error_category: result.category,
        error_code: result.code,
      };
  }
}

/**
 * One usage row per message WhatsApp accepted. Whether it's billable, and
 * in which pricing category, only arrives with the status webhooks
 * (applyStatusPricing); no cost is estimated without a maintained rate card.
 */
async function recordSendUsage(
  deps: WhatsAppDeps,
  job: Claimed,
  outcome: Extract<Outcome, { outcome: "accepted" }>,
) {
  try {
    await writeUsage(
      deps.db,
      messagingUsage({
        businessId: job.business_id,
        channel: "whatsapp",
        provider: "meta",
        operation:
          outcome.sent_via === "template" ? "send_template" : "send_text",
        destinationCountry: job.to
          ? (countryOfPhone(job.to) ?? undefined)
          : undefined,
        providerMessageId: outcome.provider_message_id,
        metadata: {
          message_id: job.message_id,
          purpose: job.purpose,
          ...(outcome.template_name ? { template: outcome.template_name } : {}),
        },
      }),
    );
  } catch (error) {
    deps.log?.("usage.not_recorded", {
      messageId: job.message_id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
