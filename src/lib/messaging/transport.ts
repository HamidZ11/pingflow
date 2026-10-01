// Sending on a messaging channel. The dispatcher only knows this interface;
// WhatsApp's Cloud API is one implementation, a fake for tests another.

export type SendFailureCategory =
  /** Temporary (rate limit, provider down, connection refused): try later. */
  | "transient"
  /** It may or may not have been sent (timed out mid-request): never resend. */
  | "outcome_unknown"
  /**
   * The account can't send: credentials refused or expired, missing
   * permission, number not registered, payment problem. The connection
   * needs attention; nothing is retried until it's fixed.
   */
  | "connection"
  /** Outside the 24-hour window: only a template may be sent. */
  | "window_closed"
  /** The template doesn't exist, isn't approved, or its parameters are wrong. */
  | "template_rejected"
  /** The number isn't on WhatsApp, has opted out, or can't receive. */
  | "recipient_unavailable"
  /** Anything else the provider refused. */
  | "rejected";

export type SendResult =
  | { ok: true; providerMessageId: string }
  | {
      ok: false;
      category: SendFailureCategory;
      /** The provider's error code, for logs and diagnostics only. */
      code: number | null;
      /** Seconds the provider asked us to wait, if it said. */
      retryAfter?: number | null;
    };

export type TextMessage = { to: string; body: string };

export type TemplateMessage = {
  to: string;
  name: string;
  language: string;
  /** Body parameters, in order. */
  parameters: string[];
};

export interface MessagingTransport {
  sendText(message: TextMessage): Promise<SendResult>;
  sendTemplate(message: TemplateMessage): Promise<SendResult>;
}
