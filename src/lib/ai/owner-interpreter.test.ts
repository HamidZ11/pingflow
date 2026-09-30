import OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { ownerCommand } from "@/domain/owner/command";
import {
  OpenAIOwnerInterpreter,
  type OwnerInterpreterRequest,
} from "@/lib/ai/owner-interpreter";
import { OWNER_PROMPT_VERSION } from "@/lib/ai/prompts/owner-command";

// The owner-command adapter against a fake network: no key, no cost.

const good = ownerCommand({
  intent: "owner_reschedule_booking",
  person: "Sarah",
  date: {
    kind: "weekday",
    weekday: "friday",
    week: null,
    day: null,
    month: null,
  },
  time: { constraint: "exact", time: "17:00" },
  short_reason: "move Sarah to Friday 5pm",
});

function responseBody(text: string) {
  return {
    id: "resp_owner_1",
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
      input_tokens: 900,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 80,
      output_tokens_details: { reasoning_tokens: 20 },
      total_tokens: 980,
    },
  };
}

function interpreter(text: string, seen: Record<string, unknown>[] = []) {
  const fetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
    seen.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response(JSON.stringify(responseBody(text)), {
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_o" },
    });
  };
  const client = new OpenAI({ apiKey: "test-key", fetch, maxRetries: 0 });
  return new OpenAIOwnerInterpreter({
    apiKey: "test-key",
    model: "gpt-5.6-luna",
    reasoningEffort: "low",
    timeoutMs: 8000,
    maxRetries: 0,
    maxOutputTokens: 1200,
    client,
  });
}

const request: OwnerInterpreterRequest = {
  message: "Move Sarah to Friday at 5",
  receivedAt: new Date("2026-09-28T13:12:00Z"),
  timeZone: "Europe/London",
  businessType: "driving_instructor",
  services: ["Driving lesson"],
  clarification: null,
};

describe("OpenAI owner-command interpreter", () => {
  it("returns the checked command and the usage the API reported", async () => {
    const result = await interpreter(JSON.stringify(good)).interpret(request);
    expect(result).toMatchObject({
      ok: true,
      promptVersion: OWNER_PROMPT_VERSION,
      command: { intent: "owner_reschedule_booking", person: "Sarah" },
      issues: [],
      usage: {
        model: "gpt-5.6-luna",
        inputTokens: 900,
        outputTokens: 80,
        responseId: "resp_owner_1",
        requestId: "req_o",
      },
    });
  });

  it("sends one strict, unstored request with no customer data", async () => {
    const seen: Record<string, unknown>[] = [];
    await interpreter(JSON.stringify(good), seen).interpret(request);
    expect(seen).toHaveLength(1);
    const body = seen[0] as {
      store: boolean;
      text: { format: { type: string; strict: boolean; name: string } };
      reasoning: { effort: string };
      input: string;
      tools?: unknown;
    };
    expect(body.store).toBe(false);
    expect(body.text.format).toMatchObject({
      type: "json_schema",
      strict: true,
      name: "owner_command",
    });
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.tools).toBeUndefined();
    expect(body.input).toContain("Move Sarah to Friday at 5");
    // Words only: no customer list, bookings or numbers go to the model.
    expect(body.input).not.toMatch(/\+44|07700|Khan|booking_id/);
  });

  it("includes the question Pingflow asked when this is an answer", async () => {
    const seen: Record<string, unknown>[] = [];
    await interpreter(JSON.stringify(good), seen).interpret({
      ...request,
      message: "5",
      clarification: {
        originalMessage: "Move Sarah Friday",
        question: "What time on Friday?",
      },
    });
    const input = (seen[0] as { input: string }).input;
    expect(input).toContain("Move Sarah Friday");
    expect(input).toContain("What time on Friday?");
  });

  it("blanks fields that aren't real, and says so", async () => {
    const odd = { ...good, time: { constraint: "exact", time: "25:99" } };
    const result = await interpreter(JSON.stringify(odd)).interpret(request);
    expect(result).toMatchObject({
      ok: true,
      command: { time: null },
      issues: ["invalid_time"],
    });
  });

  it("rejects output that doesn't fit the schema", async () => {
    const result = await interpreter(
      JSON.stringify({ intent: "owner_delete_everything" }),
    ).interpret(request);
    expect(result).toMatchObject({ ok: false, failure: "invalid_output" });
  });
});
