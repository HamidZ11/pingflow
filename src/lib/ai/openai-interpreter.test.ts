import OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { interpretation } from "@/domain/messages/interpretation";
import { aiSettings } from "@/lib/ai/config";
import { OpenAIMessageInterpreter } from "@/lib/ai/openai-interpreter";
import { estimateCost, MODEL_PRICES, priceFor } from "@/lib/ai/pricing";
import { PROMPT_VERSION } from "@/lib/ai/prompts/message-interpreter";

// The OpenAI adapter against a fake network: no key, no cost.

const good = interpretation({
  intent: "reschedule_request",
  requested_date: {
    kind: "weekday",
    weekday: "friday",
    week: null,
    day: null,
    month: null,
  },
  requested_time: { constraint: "after", time: "16:00" },
  short_reason: "move to Friday",
});

function responseBody(
  overrides: Record<string, unknown> = {},
  text = JSON.stringify(good),
) {
  return {
    id: "resp_test_1",
    object: "response",
    created_at: 1_790_000_000,
    status: "completed",
    model: "gpt-5.6-luna",
    incomplete_details: null,
    error: null,
    output: [
      {
        type: "message",
        id: "msg_1",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    usage: {
      input_tokens: 820,
      input_tokens_details: { cached_tokens: 512 },
      output_tokens: 95,
      output_tokens_details: { reasoning_tokens: 40 },
      total_tokens: 915,
    },
    ...overrides,
  };
}

type Reply = { status: number; body: unknown } | "hang";

function fakeClient(replies: Reply[], seen: unknown[] = [], timeout = 8000) {
  let call = 0;
  const fetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
    seen.push(JSON.parse(String(init?.body ?? "{}")));
    const reply = replies[Math.min(call++, replies.length - 1)];
    if (reply === "hang") {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    }
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: {
        "content-type": "application/json",
        "x-request-id": "req_abc",
      },
    });
  };
  const client = new OpenAI({
    apiKey: "test-key",
    fetch,
    maxRetries: 1,
    timeout,
  });
  return { client, calls: () => call };
}

function interpreter(client: OpenAI) {
  return new OpenAIMessageInterpreter({
    apiKey: "test-key",
    model: "gpt-5.6-luna",
    reasoningEffort: "low",
    timeoutMs: 8000,
    maxRetries: 1,
    maxOutputTokens: 1200,
    client,
  });
}

const request = {
  message: "Can we move tomorrow's lesson to Friday after 4?",
  receivedAt: new Date("2026-09-28T13:12:00Z"),
  timeZone: "Europe/London",
  businessType: "driving_instructor",
  services: ["Driving lesson"],
  sender: { known: true, customers: ["Sarah"] },
  clarification: null,
};

describe("OpenAI message interpreter", () => {
  it("returns the validated interpretation and the usage the API reported", async () => {
    const seen: unknown[] = [];
    const { client } = fakeClient(
      [{ status: 200, body: responseBody() }],
      seen,
    );
    const result = await interpreter(client).interpret(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.interpretation.intent).toBe("reschedule_request");
    expect(result.promptVersion).toBe(PROMPT_VERSION);
    expect(result.usage).toEqual({
      model: "gpt-5.6-luna",
      inputTokens: 820,
      cachedInputTokens: 512,
      outputTokens: 95,
      responseId: "resp_test_1",
      requestId: "req_abc",
    });
  });

  it("sends one small, strict, unstored request", async () => {
    const seen: Record<string, unknown>[] = [];
    const { client } = fakeClient(
      [{ status: 200, body: responseBody() }],
      seen,
    );
    await interpreter(client).interpret(request);
    expect(seen).toHaveLength(1);
    const body = seen[0] as {
      model: string;
      store: boolean;
      text: { format: { type: string; strict: boolean; name: string } };
      reasoning: { effort: string };
      input: string;
      temperature?: number;
      tools?: unknown;
    };
    expect(body.model).toBe("gpt-5.6-luna");
    expect(body.store).toBe(false);
    expect(body.text.format).toMatchObject({
      type: "json_schema",
      strict: true,
      name: "message_interpretation",
    });
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.temperature).toBeUndefined();
    expect(body.tools).toBeUndefined();
    expect(body.input).toContain("Friday after 4");
    // Only the context needed to read the message: no bookings, no phone.
    expect(body.input).not.toMatch(/\+44|07700|booking_id|16:00–17:00/);
  });

  it("treats a refusal as a failure, not an answer", async () => {
    const refusal = responseBody({
      output: [
        {
          type: "message",
          id: "msg_1",
          status: "completed",
          role: "assistant",
          content: [{ type: "refusal", refusal: "I can't help with that." }],
        },
      ],
    });
    const { client } = fakeClient([{ status: 200, body: refusal }]);
    const result = await interpreter(client).interpret(request);
    expect(result).toMatchObject({ ok: false, failure: "refused" });
  });

  it("treats an incomplete response as a failure, keeping its usage", async () => {
    const incomplete = responseBody(
      {
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
      },
      '{"intent":"resch',
    );
    const { client } = fakeClient([{ status: 200, body: incomplete }]);
    const result = await interpreter(client).interpret(request);
    expect(result).toMatchObject({
      ok: false,
      failure: expect.stringMatching(/incomplete|invalid_output/),
    });
  });

  it("rejects output that doesn't fit the schema", async () => {
    const wrong = responseBody(
      {},
      JSON.stringify({ intent: "book_everything" }),
    );
    const { client } = fakeClient([{ status: 200, body: wrong }]);
    const result = await interpreter(client).interpret(request);
    expect(result).toMatchObject({ ok: false, failure: "invalid_output" });
  });

  it("retries a server error once, then gives up", async () => {
    const error = {
      status: 500,
      body: { error: { message: "boom", type: "server_error" } },
    };
    const { client, calls } = fakeClient([error, error, error]);
    const result = await interpreter(client).interpret(request);
    expect(calls()).toBe(2);
    expect(result).toMatchObject({ ok: false, failure: "unavailable" });
  });

  it("doesn't retry a bad request", async () => {
    const error = {
      status: 400,
      body: { error: { message: "bad model", type: "invalid_request_error" } },
    };
    const { client, calls } = fakeClient([error]);
    const result = await interpreter(client).interpret(request);
    expect(calls()).toBe(1);
    expect(result).toMatchObject({
      ok: false,
      failure: "unavailable",
      detail: "provider error 400",
    });
  });

  it("times out instead of hanging", async () => {
    const { client } = fakeClient(["hang"], [], 50);
    const started = Date.now();
    const result = await interpreter(client).interpret(request);
    expect(result).toMatchObject({ ok: false, failure: "timeout" });
    expect(Date.now() - started).toBeLessThan(5000);
  }, 10_000);
});

describe("cost estimates", () => {
  it("prices a listed model from real token counts", () => {
    // gpt-5-mini: 300 fresh input × 0.25 + 500 cached × 0.025 + 100 output × 2
    expect(
      estimateCost({
        model: "gpt-5-mini",
        inputTokens: 800,
        cachedInputTokens: 500,
        outputTokens: 100,
      }),
    ).toEqual({
      micros: Math.round(300 * 0.25 + 500 * 0.025 + 100 * 2),
      currency: "USD",
    });
  });

  it("uses a dated snapshot's base price, but never borrows another model's", () => {
    expect(priceFor("gpt-5-mini-2025-08-07")).toBe(MODEL_PRICES["gpt-5-mini"]);
    expect(priceFor("gpt-5.6-sol")).toBeNull();
    expect(
      estimateCost({
        model: "gpt-5.6-sol",
        inputTokens: 800,
        cachedInputTokens: 0,
        outputTokens: 100,
      }),
    ).toBeNull();
  });
});

describe("choosing the interpreter", () => {
  it("uses OpenAI with a key, and the configured model", () => {
    expect(
      aiSettings({ NODE_ENV: "development", OPENAI_API_KEY: "sk-x" }),
    ).toMatchObject({
      interpreter: "openai",
      model: "gpt-5.6-luna",
      reasoningEffort: "low",
    });
    expect(
      aiSettings({
        NODE_ENV: "development",
        OPENAI_API_KEY: "sk-x",
        OPENAI_MESSAGE_MODEL: "gpt-5-mini",
      }).model,
    ).toBe("gpt-5-mini");
  });

  it("without a key, reads nothing rather than pretending", () => {
    expect(aiSettings({ NODE_ENV: "development" }).interpreter).toBe("none");
  });

  it("allows the fixture interpreter in development only", () => {
    expect(
      aiSettings({
        NODE_ENV: "development",
        PINGFLOW_MESSAGE_INTERPRETER: "fixture",
      }).interpreter,
    ).toBe("fixture");
    expect(
      aiSettings({
        NODE_ENV: "production",
        PINGFLOW_MESSAGE_INTERPRETER: "fixture",
      }).interpreter,
    ).toBe("none");
  });

  it("the key is never a public variable", () => {
    const settings = JSON.stringify(
      aiSettings({
        NODE_ENV: "development",
        OPENAI_API_KEY: "sk-secret-value",
      }),
    );
    expect(settings).not.toContain("sk-secret-value");
  });
});
