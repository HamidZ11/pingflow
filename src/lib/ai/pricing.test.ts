import { describe, expect, it } from "vitest";
import { estimateTokenCostMicros } from "@/domain/usage/usage-event";
import { estimateCost, MODEL_PRICES, priceFor } from "@/lib/ai/pricing";

// GPT-5.6 Luna: $0.20 per million input tokens, $0.02 cached, $1.20 output.
// Costs are whole micro-units of a dollar ($0.000001).

const luna = (
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
) =>
  estimateCost({
    model: "gpt-5.6-luna",
    inputTokens,
    cachedInputTokens,
    outputTokens,
  });

describe("GPT-5.6 Luna prices", () => {
  it("is listed at its published price", () => {
    expect(priceFor("gpt-5.6-luna")).toEqual({
      inputPerMillion: 0.2,
      cachedInputPerMillion: 0.02,
      outputPerMillion: 1.2,
      currency: "USD",
      effectiveFrom: "2026-09-29",
    });
    expect(priceFor("gpt-5.6-luna-2026-09-01")).toBe(
      MODEL_PRICES["gpt-5.6-luna"],
    );
  });

  it("prices uncached input", () => {
    expect(luna(1_000_000, 0, 0)).toEqual({ micros: 200_000, currency: "USD" });
    expect(luna(1000, 0, 0)?.micros).toBe(200);
  });

  it("prices cached input at a tenth", () => {
    expect(luna(1_000_000, 1_000_000, 0)?.micros).toBe(20_000);
    expect(luna(1000, 1000, 0)?.micros).toBe(20);
  });

  it("prices output", () => {
    expect(luna(0, 0, 1_000_000)?.micros).toBe(1_200_000);
    expect(luna(0, 0, 100)?.micros).toBe(120);
  });

  it("adds a whole request together", () => {
    // 308 fresh × 0.2 + 512 cached × 0.02 + 95 out × 1.2
    // = 61.6 + 10.24 + 114 = 185.84 micro-dollars.
    expect(luna(820, 512, 95)?.micros).toBe(186);
    // No cache at all.
    expect(luna(820, 0, 95)?.micros).toBe(278); // 164 + 114
  });

  it("keeps a fraction of a cent, never $0.00", () => {
    // A typical message: about $0.0002, recorded as 186 micro-dollars.
    const cost = luna(820, 512, 95)!;
    expect(cost.micros).toBeGreaterThan(0);
    expect(cost.micros).toBeLessThan(10_000); // under one cent
    expect(cost.micros / 1_000_000).toBeCloseTo(0.000186, 9);
  });

  it("does integer arithmetic, with one half-up rounding", () => {
    // 0.1 + 0.2 style float error can't creep in: 3 × 0.2 is exactly 0.6.
    expect(luna(3, 0, 0)?.micros).toBe(1);
    expect(luna(2, 0, 0)?.micros).toBe(0); // 0.4
    // Exactly half a micro-dollar rounds up.
    expect(
      estimateTokenCostMicros(
        { input: 2, output: 0 },
        { input: 0.25, output: 0 },
      ),
    ).toBe(1);
    // Large volumes stay exact: 10M in (4M cached), 2M out.
    expect(luna(10_000_000, 4_000_000, 2_000_000)?.micros).toBe(
      1_200_000 + 80_000 + 2_400_000,
    );
  });

  it("an unlisted model has an unknown cost, and doesn't fail", () => {
    expect(
      estimateCost({
        model: "gpt-5.6-terra",
        inputTokens: 820,
        cachedInputTokens: 0,
        outputTokens: 95,
      }),
    ).toBeNull();
  });
});
