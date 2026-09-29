import type {
  MessagingTransport,
  SendResult,
  TemplateMessage,
  TextMessage,
} from "@/lib/messaging/transport";
import { GRAPH_API_BASE, SEND_TIMEOUT_MS } from "@/lib/whatsapp/config";
import {
  classifyGraphError,
  classifyNetworkError,
} from "@/lib/whatsapp/graph-errors";

// WhatsApp Cloud API over plain HTTPS: POST /{phone-number-id}/messages.
// Every request is bounded; nothing here retries (the outbox decides).
// The access token only ever goes in the Authorization header.

export type CloudTransportOptions = {
  accessToken: string;
  phoneNumberId: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

type Health =
  | { ok: true; displayPhoneNumber: string | null; verifiedName: string | null }
  | Extract<SendResult, { ok: false }>;

export type ProviderTemplate = {
  name: string;
  language: string;
  status: string;
  category: string | null;
};

export class WhatsAppCloudTransport implements MessagingTransport {
  private readonly fetch: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: CloudTransportOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? SEND_TIMEOUT_MS;
  }

  private async request(
    path: string,
    init: { method: "GET" | "POST"; body?: unknown },
  ): Promise<
    | { ok: true; body: Record<string, unknown> }
    | Extract<SendResult, { ok: false }>
  > {
    let response: Response;
    try {
      response = await this.fetch(`${GRAPH_API_BASE}/${path}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${this.options.accessToken}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      return classifyNetworkError(error);
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Not JSON: judged by the status alone.
    }
    if (!response.ok) {
      const failure = classifyGraphError(response.status, body);
      const retryAfter = Number(response.headers.get("retry-after"));
      return Number.isFinite(retryAfter) && retryAfter > 0
        ? { ...failure, retryAfter }
        : failure;
    }
    return { ok: true, body: (body ?? {}) as Record<string, unknown> };
  }

  private async send(payload: Record<string, unknown>): Promise<SendResult> {
    const result = await this.request(
      `${encodeURIComponent(this.options.phoneNumberId)}/messages`,
      {
        method: "POST",
        body: {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          ...payload,
        },
      },
    );
    if (!result.ok) return result;
    const id = (result.body.messages as { id?: unknown }[] | undefined)?.[0]
      ?.id;
    // A 200 without a message ID can't be tracked; it may still have gone.
    return typeof id === "string"
      ? { ok: true, providerMessageId: id }
      : { ok: false, category: "outcome_unknown", code: null };
  }

  sendText(message: TextMessage): Promise<SendResult> {
    return this.send({
      to: message.to,
      type: "text",
      text: { preview_url: false, body: message.body },
    });
  }

  sendTemplate(message: TemplateMessage): Promise<SendResult> {
    return this.send({
      to: message.to,
      type: "template",
      template: {
        name: message.name,
        language: { code: message.language },
        ...(message.parameters.length
          ? {
              components: [
                {
                  type: "body",
                  parameters: message.parameters.map((text) => ({
                    type: "text",
                    text,
                  })),
                },
              ],
            }
          : {}),
      },
    });
  }

  /** The number's details, which also proves the credentials work. */
  async health(): Promise<Health> {
    const result = await this.request(
      `${encodeURIComponent(this.options.phoneNumberId)}?fields=display_phone_number,verified_name`,
      { method: "GET" },
    );
    if (!result.ok) return result;
    const display = result.body.display_phone_number;
    const name = result.body.verified_name;
    return {
      ok: true,
      displayPhoneNumber: typeof display === "string" ? display : null,
      verifiedName: typeof name === "string" ? name : null,
    };
  }

  /** The account's templates and their review status. */
  async templates(
    wabaId: string,
  ): Promise<
    | { ok: true; templates: ProviderTemplate[] }
    | Extract<SendResult, { ok: false }>
  > {
    const result = await this.request(
      `${encodeURIComponent(wabaId)}/message_templates?fields=name,status,language,category&limit=200`,
      { method: "GET" },
    );
    if (!result.ok) return result;
    const data = Array.isArray(result.body.data) ? result.body.data : [];
    return {
      ok: true,
      templates: data.flatMap((t: Record<string, unknown>) =>
        typeof t.name === "string" && typeof t.language === "string"
          ? [
              {
                name: t.name,
                language: t.language,
                status: typeof t.status === "string" ? t.status : "UNKNOWN",
                category: typeof t.category === "string" ? t.category : null,
              },
            ]
          : [],
      ),
    };
  }
}
