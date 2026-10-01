import type {
  MessagingTransport,
  SendResult,
  TemplateMessage,
  TextMessage,
} from "@/lib/messaging/transport";

// A stand-in for WhatsApp in tests: records every send and answers from a
// script (by default, success with a fresh message ID). Never touches the
// network.

export type FakeSend =
  ({ type: "text" } & TextMessage) | ({ type: "template" } & TemplateMessage);

export class FakeMessagingTransport implements MessagingTransport {
  readonly sent: FakeSend[] = [];
  private readonly script: SendResult[];
  private count = 0;

  constructor(script: SendResult[] = []) {
    this.script = [...script];
  }

  private next(): SendResult {
    this.count++;
    return (
      this.script.shift() ?? {
        ok: true,
        providerMessageId: `wamid.fake-${this.count}-${Math.random().toString(36).slice(2, 10)}`,
      }
    );
  }

  async sendText(message: TextMessage) {
    this.sent.push({ type: "text", ...message });
    return this.next();
  }

  async sendTemplate(message: TemplateMessage) {
    this.sent.push({ type: "template", ...message });
    return this.next();
  }
}
