import { describe, expect, it } from "vitest";
import {
  classifyGraphError,
  classifyNetworkError,
} from "@/lib/whatsapp/graph-errors";
import { WhatsAppCloudTransport } from "@/lib/whatsapp/cloud-transport";
import { GRAPH_API_BASE, GRAPH_API_VERSION } from "@/lib/whatsapp/config";
import {
  currentMetaInboundText,
  inboundOfType,
  inboundText,
  otherField,
  statusUpdate,
  TEST_PHONE_NUMBER_ID,
} from "@/lib/whatsapp/fixtures";
import {
  signBody,
  verifyChallenge,
  verifySignature,
} from "@/lib/whatsapp/signature";
import { parseWebhook } from "@/lib/whatsapp/webhook-payload";

const secret = "test-app-secret";
const bytes = (s: string) => new TextEncoder().encode(s);

describe("webhook signature", () => {
  const body = JSON.stringify(
    inboundText({ id: "wamid.1", from: "447700900123", body: "Hi 👋" }),
  );

  it("accepts Meta's HMAC of the exact bytes", () => {
    expect(verifySignature(bytes(body), signBody(body, secret), secret)).toBe(
      true,
    );
  });

  it("rejects a wrong, missing or malformed signature", () => {
    expect(verifySignature(bytes(body), signBody(body, "other"), secret)).toBe(
      false,
    );
    expect(verifySignature(bytes(body), null, secret)).toBe(false);
    expect(verifySignature(bytes(body), "sha1=abc", secret)).toBe(false);
    expect(verifySignature(bytes(body), "sha256=zz", secret)).toBe(false);
  });

  it("rejects the same JSON re-serialised: only the raw bytes count", () => {
    const signature = signBody(body, secret);
    const reformatted = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifySignature(bytes(reformatted), signature, secret)).toBe(false);
  });
});

describe("webhook verification handshake", () => {
  const params = (p: Record<string, string>) => new URLSearchParams(p);

  it("echoes the challenge for the right token", () => {
    expect(
      verifyChallenge(
        params({
          "hub.mode": "subscribe",
          "hub.verify_token": "tok",
          "hub.challenge": "1158201444",
        }),
        "tok",
      ),
    ).toBe("1158201444");
  });

  it("refuses a wrong token, mode or challenge", () => {
    const base = {
      "hub.mode": "subscribe",
      "hub.verify_token": "tok",
      "hub.challenge": "123",
    };
    expect(
      verifyChallenge(params({ ...base, "hub.verify_token": "nope" }), "tok"),
    ).toBeNull();
    expect(
      verifyChallenge(params({ ...base, "hub.mode": "unsubscribe" }), "tok"),
    ).toBeNull();
    expect(
      verifyChallenge(params({ ...base, "hub.challenge": "<script>" }), "tok"),
    ).toBeNull();
  });
});

describe("webhook payloads", () => {
  const at = new Date("2026-09-29T10:42:00Z");

  it("turns an inbound text into one message event, keyed by its ID", () => {
    const [event] = parseWebhook(
      inboundText({
        id: "wamid.A",
        from: "447700900123",
        body: "When's my next lesson?",
        at,
      }),
    );
    expect(event).toEqual({
      kind: "message",
      key: "message:wamid.A",
      phoneNumberId: TEST_PHONE_NUMBER_ID,
      wabaId: expect.any(String),
      messageId: "wamid.A",
      senderWaId: "447700900123",
      senderUserId: null,
      sentAt: at,
      contentType: "text",
      providerType: "text",
      text: "When's my next lesson?",
    });
  });

  it("reads Meta's current shape, with user IDs and internal fields, by the documented fields only", () => {
    const [event] = parseWebhook(
      currentMetaInboundText({
        id: "wamid.CURRENT",
        from: "447700900123",
        body: "When’s my next lesson",
        at,
      }),
    );
    expect(event).toEqual({
      kind: "message",
      key: "message:wamid.CURRENT",
      phoneNumberId: TEST_PHONE_NUMBER_ID,
      wabaId: expect.any(String),
      messageId: "wamid.CURRENT",
      senderWaId: "447700900123",
      senderUserId: "GB.0000000000000000",
      sentAt: at,
      contentType: "text",
      providerType: "text",
      text: "When’s my next lesson",
    });
    expect(JSON.stringify(event)).not.toMatch(
      /internal_1p|account_context|from_logical_id|country_code/,
    );
  });

  it("gives a retried delivery the same key", () => {
    const payload = inboundText({
      id: "wamid.B",
      from: "447700900123",
      body: "x",
    });
    expect(parseWebhook(payload)[0].key).toBe(parseWebhook(payload)[0].key);
  });

  it("reads statuses, pricing and errors", () => {
    const [delivered] = parseWebhook(
      statusUpdate({
        id: "wamid.C",
        status: "delivered",
        category: "service",
        at,
      }),
    );
    expect(delivered).toMatchObject({
      kind: "status",
      key: "status:wamid.C:delivered",
      status: "delivered",
      at,
      pricing: {
        billable: false,
        category: "service",
        type: "free_customer_service",
        model: "PMP",
      },
    });
    const [failed] = parseWebhook(
      statusUpdate({ id: "wamid.C", status: "failed", errorCode: 131026 }),
    );
    expect(failed).toMatchObject({
      key: "status:wamid.C:failed",
      errorCode: 131026,
    });
  });

  it("labels media, keeps captions, and ignores reactions and stickers", () => {
    const [voice] = parseWebhook(
      inboundOfType({
        id: "wamid.D",
        from: "447700900123",
        type: "audio",
        part: { id: "m", voice: true },
      }),
    );
    expect(voice).toMatchObject({ contentType: "audio", text: null });
    const [photo] = parseWebhook(
      inboundOfType({
        id: "wamid.E",
        from: "447700900123",
        type: "image",
        part: { caption: "This one?" },
      }),
    );
    expect(photo).toMatchObject({ contentType: "image", text: "This one?" });
    for (const type of ["reaction", "sticker", "system"]) {
      const [event] = parseWebhook(
        inboundOfType({ id: `wamid.${type}`, from: "447700900123", type }),
      );
      expect(event).toMatchObject({ kind: "message", contentType: null });
    }
    const [odd] = parseWebhook(
      inboundOfType({
        id: "wamid.F",
        from: "447700900123",
        type: "brand_new_type",
      }),
    );
    expect(odd).toMatchObject({ contentType: "unknown" });
  });

  it("keeps the business-scoped user ID when no number is shared", () => {
    const [event] = parseWebhook(
      inboundOfType({
        id: "wamid.G",
        from: null,
        userId: "GB.abc123",
        type: "text",
        part: { body: "hi" },
      }),
    );
    expect(event).toMatchObject({
      senderWaId: null,
      senderUserId: "GB.abc123",
    });
  });

  it("records other fields, and survives malformed payloads", () => {
    expect(parseWebhook(otherField("smb_message_echoes"))[0]).toMatchObject({
      kind: "other",
      field: "smb_message_echoes",
    });
    for (const bad of [
      null,
      "text",
      42,
      {},
      { object: "page" },
      { object: "whatsapp_business_account", entry: "x" },
    ]) {
      expect(parseWebhook(bad)).toEqual([]);
    }
    expect(
      parseWebhook({
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  metadata: { phone_number_id: "1" },
                  messages: [{ nope: true }],
                },
              },
            ],
          },
        ],
      }),
    ).toEqual([]);
  });
});

describe("Cloud API transport", () => {
  function fake(
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
  ) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return new Response(JSON.stringify(body), { status, headers });
    };
    return {
      calls,
      transport: new WhatsAppCloudTransport({
        accessToken: "tok-x",
        phoneNumberId: "123",
        fetch,
      }),
    };
  }

  it("sends text to the pinned Graph version with a bearer token", async () => {
    const { calls, transport } = fake(200, {
      messages: [{ id: "wamid.OUT", message_status: "accepted" }],
    });
    const result = await transport.sendText({
      to: "+447700900123",
      body: "Your next lesson is Friday at 17:00.",
    });
    expect(result).toEqual({ ok: true, providerMessageId: "wamid.OUT" });
    expect(GRAPH_API_VERSION).toBe("v26.0");
    expect(calls[0].url).toBe(`${GRAPH_API_BASE}/123/messages`);
    expect(
      (calls[0].init.headers as Record<string, string>).Authorization,
    ).toBe("Bearer tok-x");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "+447700900123",
      type: "text",
      text: {
        preview_url: false,
        body: "Your next lesson is Friday at 17:00.",
      },
    });
  });

  it("sends a template with its body parameters in order", async () => {
    const { calls, transport } = fake(200, { messages: [{ id: "wamid.T" }] });
    await transport.sendTemplate({
      to: "+447700900123",
      name: "appointment_reminder",
      language: "en_GB",
      parameters: ["Sarah", "Friday 2 October at 17:00"],
    });
    expect(JSON.parse(String(calls[0].init.body)).template).toEqual({
      name: "appointment_reminder",
      language: { code: "en_GB" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "Sarah" },
            { type: "text", text: "Friday 2 October at 17:00" },
          ],
        },
      ],
    });
  });

  it("sorts failures by what to do", async () => {
    const cases: [number, number | null, string][] = [
      [429, 130429, "transient"],
      [400, 131056, "transient"],
      [500, 131016, "transient"],
      [503, null, "transient"],
      [401, 190, "connection"],
      [400, 131047, "window_closed"],
      [400, 132001, "template_rejected"],
      [400, 131026, "recipient_unavailable"],
      [400, 100, "rejected"],
    ];
    for (const [status, code, category] of cases) {
      const body = code === null ? {} : { error: { code, message: "x" } };
      expect(
        classifyGraphError(status, body).category,
        `${status}/${code}`,
      ).toBe(category);
    }
    const { transport } = fake(
      429,
      { error: { code: 130429 } },
      { "retry-after": "60" },
    );
    expect(await transport.sendText({ to: "+1", body: "x" })).toMatchObject({
      category: "transient",
      code: 130429,
      retryAfter: 60,
    });
  });

  it("never treats a request that may have arrived as safe to repeat", async () => {
    const hanging = new WhatsAppCloudTransport({
      accessToken: "t",
      phoneNumberId: "1",
      timeoutMs: 20,
      fetch: (_url, init) =>
        new Promise((_, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("timed out", "TimeoutError")),
          ),
        ),
    });
    expect(await hanging.sendText({ to: "+1", body: "x" })).toMatchObject({
      category: "outcome_unknown",
    });
    expect(
      classifyNetworkError(
        Object.assign(new TypeError("fetch failed"), {
          cause: { code: "ECONNREFUSED" },
        }),
      ),
    ).toMatchObject({ category: "transient" });
    expect(
      classifyNetworkError(
        Object.assign(new TypeError("fetch failed"), {
          cause: { code: "ECONNRESET" },
        }),
      ),
    ).toMatchObject({ category: "outcome_unknown" });
    const { transport } = fake(200, { messages: [] });
    expect(await transport.sendText({ to: "+1", body: "x" })).toMatchObject({
      category: "outcome_unknown",
    });
  });
});
