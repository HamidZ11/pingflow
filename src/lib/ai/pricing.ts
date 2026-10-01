import { estimateTokenCostMicros } from "@/domain/usage/usage-event";

// What model calls cost, in one place. Prices change: update this table
// (with the date) and every new estimate follows. Usage events keep the raw
// token counts, so older estimates can be recalculated if needed.
//
// A model missing from the table still works: its calls are recorded with
// their token counts and an unknown cost. Add a model's published price here
// before relying on cost estimates for it.

export type ModelPrice = {
  /** US dollars per million input tokens. */
  inputPerMillion: number;
  /** Per million input tokens served from the provider's cache. */
  cachedInputPerMillion: number;
  /** Per million output tokens (reasoning tokens count as output). */
  outputPerMillion: number;
  currency: "USD";
  /** When these prices were published or confirmed, for checking they're current. */
  effectiveFrom: string;
};

export const MODEL_PRICES: Record<string, ModelPrice> = {
  // The default message model. OpenAI API list price, confirmed 2026-09-29.
  "gpt-5.6-luna": {
    inputPerMillion: 0.2,
    cachedInputPerMillion: 0.02,
    outputPerMillion: 1.2,
    currency: "USD",
    effectiveFrom: "2026-09-29",
  },
  // OpenAI list prices published with GPT-5 (August 2025).
  "gpt-5": {
    inputPerMillion: 1.25,
    cachedInputPerMillion: 0.125,
    outputPerMillion: 10,
    currency: "USD",
    effectiveFrom: "2025-08-07",
  },
  "gpt-5-mini": {
    inputPerMillion: 0.25,
    cachedInputPerMillion: 0.025,
    outputPerMillion: 2,
    currency: "USD",
    effectiveFrom: "2025-08-07",
  },
  "gpt-5-nano": {
    inputPerMillion: 0.05,
    cachedInputPerMillion: 0.005,
    outputPerMillion: 0.4,
    currency: "USD",
    effectiveFrom: "2025-08-07",
  },
};

/**
 * The price for a model: an exact match, or a dated snapshot of a listed
 * model ("gpt-5-mini-2025-08-07" uses "gpt-5-mini"). Nothing is guessed: an
 * unlisted model such as "gpt-5.6-sol" doesn't borrow a relative's price.
 */
export function priceFor(
  model: string,
  prices: Record<string, ModelPrice> = MODEL_PRICES,
): ModelPrice | null {
  if (prices[model]) return prices[model];
  const snapshot = /^(.*)-\d{4}-\d{2}-\d{2}$/.exec(model);
  return snapshot && prices[snapshot[1]] ? prices[snapshot[1]] : null;
}

/** An estimated cost in millionths of the currency, or null if unknown. */
export function estimateCost(
  usage: {
    model: string;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
  },
  prices: Record<string, ModelPrice> = MODEL_PRICES,
): { micros: number; currency: string } | null {
  const price = priceFor(usage.model, prices);
  if (!price) return null;
  return {
    micros: estimateTokenCostMicros(
      {
        input: usage.inputTokens,
        output: usage.outputTokens,
        cachedInput: usage.cachedInputTokens,
      },
      {
        input: price.inputPerMillion,
        output: price.outputPerMillion,
        cachedInput: price.cachedInputPerMillion,
      },
    ),
    currency: price.currency,
  };
}
