import { describe, expect, it } from "vitest";
import {
  aiUsage,
  estimateTokenCostMicros,
  messagingUsage,
  usageEventProblems,
} from "@/domain/usage/usage-event";
import { toUsageRow } from "@/lib/usage/ledger";

const businessId = "0b2f0128-5c6e-42ec-a61d-7ff2e48528fc";

describe("usage events", () => {
  it("records a model call with its raw token counts", () => {
    const event = aiUsage({
      businessId,
      provider: "openai",
      operation: "interpret_message",
      model: "example-model",
      inputTokens: 1200,
      outputTokens: 80,
      cachedInputTokens: 1000,
      estimatedCostMicros: 530,
      currency: "USD",
      requestId: "req_123",
    });
    expect(usageEventProblems(event)).toEqual([]);
    expect(toUsageRow(event)).toMatchObject({
      category: "ai",
      unit: "request",
      quantity: 1,
      model: "example-model",
      input_tokens: 1200,
      output_tokens: 80,
      cached_input_tokens: 1000,
      external_reference: "req_123",
      estimated_cost_micros: 530,
      currency: "USD",
    });
  });

  it("records a WhatsApp message with what makes it billable", () => {
    const event = messagingUsage({
      businessId,
      channel: "whatsapp",
      provider: "meta",
      operation: "send_template",
      messageCategory: "utility",
      destinationCountry: "GB",
      billable: true,
      providerMessageId: "wamid.ABC",
    });
    expect(usageEventProblems(event)).toEqual([]);
    expect(toUsageRow(event)).toMatchObject({
      category: "whatsapp",
      unit: "message",
      message_category: "utility",
      destination_country: "GB",
      billable: true,
      external_reference: "wamid.ABC",
      estimated_cost_micros: null,
    });
  });

  it("refuses events that would make the ledger wrong", () => {
    const base = aiUsage({
      businessId,
      provider: "openai",
      operation: "interpret_message",
      model: "m",
      inputTokens: 10,
      outputTokens: 5,
    });
    expect(usageEventProblems({ ...base, inputTokens: -1 })).not.toEqual([]);
    expect(usageEventProblems({ ...base, cachedInputTokens: 20 })).not.toEqual(
      [],
    );
    expect(usageEventProblems({ ...base, estimatedCostMicros: 10 })).toContain(
      "a cost needs a currency",
    );
    expect(usageEventProblems({ ...base, currency: "pounds" })).not.toEqual([]);
    expect(usageEventProblems({ ...base, provider: "Open AI" })).not.toEqual(
      [],
    );
  });

  it("estimates token costs from prices the caller supplies", () => {
    // 1,000,000 tokens at 2.00 per million = 2.00 = 2,000,000 micros.
    expect(
      estimateTokenCostMicros(
        { input: 1_000_000, output: 0 },
        { input: 2, output: 8 },
      ),
    ).toBe(2_000_000);
    // Cached input at its own (lower) price.
    expect(
      estimateTokenCostMicros(
        { input: 1000, output: 100, cachedInput: 800 },
        { input: 2, output: 8, cachedInput: 0.5 },
      ),
    ).toBe(Math.round(200 * 2 + 800 * 0.5 + 100 * 8));
  });
});
