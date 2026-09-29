import { createHash } from "node:crypto";
import type { ContentType } from "@/domain/channel/inbound";

// WhatsApp Cloud API webhook bodies, turned into flat events. The shape (as
// documented for Graph API v26.0):
//
//   { object: "whatsapp_business_account",
//     entry: [{ id: <WABA ID>, changes: [{ field: "messages", value: {
//       metadata: { display_phone_number, phone_number_id },
//       contacts: [{ wa_id, user_id?, profile: { name } }],
//       messages: [{ from?, from_user_id?, id, timestamp, type, text: { body }, … }],
//       statuses: [{ id, status, timestamp, recipient_id, pricing?, errors? }]
//     } }] }] }
//
// Nothing here trusts the payload's shape: unknown fields and types are
// kept as "other" events or ignored, never thrown on. Parsing happens only
// after the signature has been checked.

export type WebhookMessageEvent = {
  kind: "message";
  key: string;
  phoneNumberId: string;
  wabaId: string | null;
  messageId: string;
  /** The customer's number as digits. Absent for some username-only users. */
  senderWaId: string | null;
  /** WhatsApp's business-scoped user ID (BSUID), when present. */
  senderUserId: string | null;
  sentAt: Date;
  /** Null when there's nothing to act on (a reaction, a sticker, a system note). */
  contentType: ContentType | null;
  providerType: string;
  text: string | null;
};

export type WebhookStatusEvent = {
  kind: "status";
  key: string;
  phoneNumberId: string;
  messageId: string;
  status: "sent" | "delivered" | "read" | "failed" | "played" | "other";
  at: Date;
  pricing: {
    billable: boolean | null;
    category: string | null;
    type: string | null;
    model: string | null;
  } | null;
  errorCode: number | null;
};

export type WebhookOtherEvent = {
  kind: "other";
  key: string;
  field: string;
  phoneNumberId: string | null;
};

export type WebhookEvent =
  WebhookMessageEvent | WebhookStatusEvent | WebhookOtherEvent;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 && v.length <= 4096 ? v : null;
const id = (v: unknown): string | null => {
  const s = str(v);
  return s && s.length <= 200 ? s : null;
};

function when(timestamp: unknown, fallback: Date): Date {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);

/** Which Pingflow content type a WhatsApp message type is, and its text. */
function content(message: Obj): {
  contentType: ContentType | null;
  text: string | null;
} {
  const type = str(message.type) ?? "unknown";
  const part = obj(message[type]);
  switch (type) {
    case "text":
      return { contentType: "text", text: str(part?.body) };
    case "image":
    case "video":
    case "document":
      return { contentType: type, text: str(part?.caption) };
    case "audio":
      return { contentType: "audio", text: null };
    case "location":
      return { contentType: "location", text: null };
    case "contacts":
      return { contentType: "contacts", text: null };
    case "interactive":
    case "button":
      return {
        contentType: "interactive",
        text:
          str(part?.text) ??
          str(obj(part?.button_reply)?.title) ??
          str(obj(part?.list_reply)?.title),
      };
    // A reaction or sticker is a nod, not a request; a system message is
    // WhatsApp's own notice. Recorded, never acted on.
    case "reaction":
    case "sticker":
    case "system":
      return { contentType: null, text: null };
    default:
      return { contentType: "unknown", text: null };
  }
}

const statuses = new Set(["sent", "delivered", "read", "failed", "played"]);

export function parseWebhook(
  payload: unknown,
  receivedAt = new Date(),
): WebhookEvent[] {
  const events: WebhookEvent[] = [];
  const root = obj(payload);
  if (!root || root.object !== "whatsapp_business_account") return events;

  for (const entry of arr(root.entry)) {
    const e = obj(entry);
    if (!e) continue;
    const wabaId = id(e.id);
    for (const change of arr(e.changes)) {
      const c = obj(change);
      if (!c) continue;
      const field = str(c.field) ?? "unknown";
      const value = obj(c.value);
      const phoneNumberId = id(obj(value?.metadata)?.phone_number_id);

      if (field !== "messages" || !value || !phoneNumberId) {
        events.push({
          kind: "other",
          key: `other:${field.slice(0, 60)}:${digest(change)}`,
          field,
          phoneNumberId,
        });
        continue;
      }

      for (const m of arr(value.messages)) {
        const message = obj(m);
        const messageId = id(message?.id);
        if (!message || !messageId) continue;
        const { contentType, text } = content(message);
        events.push({
          kind: "message",
          key: `message:${messageId}`,
          phoneNumberId,
          wabaId,
          messageId,
          senderWaId: id(message.from),
          senderUserId: id(message.from_user_id),
          sentAt: when(message.timestamp, receivedAt),
          contentType,
          providerType: (str(message.type) ?? "unknown").slice(0, 40),
          text,
        });
      }

      for (const s of arr(value.statuses)) {
        const status = obj(s);
        const messageId = id(status?.id);
        const raw = str(status?.status);
        if (!status || !messageId || !raw) continue;
        const pricing = obj(status.pricing);
        const error = obj(arr(status.errors)[0]);
        const normalised = statuses.has(raw)
          ? (raw as WebhookStatusEvent["status"])
          : "other";
        events.push({
          kind: "status",
          key: `status:${messageId}:${normalised === "other" ? raw.slice(0, 30) : normalised}`,
          phoneNumberId,
          messageId,
          status: normalised,
          at: when(status.timestamp, receivedAt),
          pricing: pricing
            ? {
                billable:
                  typeof pricing.billable === "boolean"
                    ? pricing.billable
                    : null,
                category: str(pricing.category),
                type: str(pricing.type),
                model: str(pricing.pricing_model),
              }
            : null,
          errorCode:
            typeof error?.code === "number" ? (error.code as number) : null,
        });
      }

      // Account-level errors on the change itself.
      if (arr(value.errors).length && !arr(value.messages).length) {
        events.push({
          kind: "other",
          key: `other:errors:${digest(value.errors)}`,
          field: "errors",
          phoneNumberId,
        });
      }
    }
  }
  return events;
}
