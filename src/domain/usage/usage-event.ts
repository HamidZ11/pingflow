// What a usage record looks like, and how the two kinds we expect first
// (model calls and messages) become one. Pure: no database, no provider SDK.
//
// Why it exists: Pingflow charges a flat monthly price, while model calls
// and WhatsApp messages cost us per use. Recording each one as it happens,
// with the raw quantities, lets us answer "what did this business cost us
// this month?" and recompute it if prices change. Nothing records usage yet;
// the AI and WhatsApp integrations will, through src/lib/usage.

export type UsageCategory = "ai" | "whatsapp" | "email" | "other";

export type UsageEvent = {
  businessId: string;
  occurredAt?: Date;
  category: UsageCategory;
  /** e.g. "openai", "meta", "resend" */
  provider: string;
  /** What we did, e.g. "interpret_message", "send_template". */
  operation: string;
  quantity: number;
  /** e.g. "request", "message", "email" */
  unit: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  /** WhatsApp pricing category, e.g. "utility", "service". */
  messageCategory?: string;
  /** ISO 3166 country of the recipient, e.g. "GB". */
  destinationCountry?: string;
  billable?: boolean;
  /** Our estimate at the time, in millionths of `currency`. */
  estimatedCostMicros?: number;
  currency?: string;
  /** The provider's own ID; makes repeated reports of one event count once. */
  externalReference?: string;
  /** Provider-specific extras that aren't worth their own column. */
  metadata?: Record<string, unknown>;
};

/** A model call: tokens in, tokens out. */
export function aiUsage(input: {
  businessId: string;
  provider: string;
  operation: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  estimatedCostMicros?: number;
  currency?: string;
  requestId?: string;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
}): UsageEvent {
  return {
    businessId: input.businessId,
    occurredAt: input.occurredAt,
    category: "ai",
    provider: input.provider,
    operation: input.operation,
    quantity: 1,
    unit: "request",
    model: input.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    cachedInputTokens: input.cachedInputTokens,
    estimatedCostMicros: input.estimatedCostMicros,
    currency: input.currency,
    externalReference: input.requestId,
    metadata: input.metadata,
  };
}

/** One message sent (or charged) through a messaging provider. */
export function messagingUsage(input: {
  businessId: string;
  channel: "whatsapp" | "email";
  provider: string;
  operation: string;
  messageCategory?: string;
  destinationCountry?: string;
  billable?: boolean;
  estimatedCostMicros?: number;
  currency?: string;
  providerMessageId?: string;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
}): UsageEvent {
  return {
    businessId: input.businessId,
    occurredAt: input.occurredAt,
    category: input.channel,
    provider: input.provider,
    operation: input.operation,
    quantity: 1,
    unit: input.channel === "email" ? "email" : "message",
    messageCategory: input.messageCategory,
    destinationCountry: input.destinationCountry,
    billable: input.billable,
    estimatedCostMicros: input.estimatedCostMicros,
    currency: input.currency,
    externalReference: input.providerMessageId,
    metadata: input.metadata,
  };
}

/**
 * A model call's estimated cost in micro-units, from per-million-token
 * prices the caller supplies (prices change; they don't live here).
 */
export function estimateTokenCostMicros(
  tokens: { input: number; output: number; cachedInput?: number },
  pricePerMillion: { input: number; output: number; cachedInput?: number },
): number {
  const cached = tokens.cachedInput ?? 0;
  // Integers throughout: each price becomes micro-units per million tokens
  // ($0.20 → 200,000), so tokens × price is exact, and the total is
  // rounded once, half up, to a whole micro-unit ($0.000001). A typical
  // message costs a few hundred micro-units; nothing rounds to zero cents.
  const perMillion = (price: number) => Math.round(price * 1_000_000);
  const total =
    (tokens.input - cached) * perMillion(pricePerMillion.input) +
    cached * perMillion(pricePerMillion.cachedInput ?? pricePerMillion.input) +
    tokens.output * perMillion(pricePerMillion.output);
  return Math.floor((total + 500_000) / 1_000_000);
}

const slug = /^[a-z0-9_.-]+$/;
const count = (n: number | undefined) =>
  n === undefined || (Number.isInteger(n) && n >= 0);

/** Problems with an event, as short sentences (empty when it's valid). */
export function usageEventProblems(event: UsageEvent): string[] {
  const problems: string[] = [];
  if (!event.businessId) problems.push("businessId is required");
  if (!slug.test(event.provider) || event.provider.length > 40) {
    problems.push("provider must be a short lowercase name");
  }
  if (!slug.test(event.operation) || event.operation.length > 60) {
    problems.push("operation must be a short lowercase name");
  }
  if (!/^[a-z_]{1,20}$/.test(event.unit)) problems.push("unit is invalid");
  if (!(event.quantity >= 0)) problems.push("quantity can't be negative");
  if (
    !count(event.inputTokens) ||
    !count(event.outputTokens) ||
    !count(event.cachedInputTokens)
  ) {
    problems.push("token counts must be whole, non-negative numbers");
  }
  if (
    event.cachedInputTokens !== undefined &&
    event.inputTokens !== undefined &&
    event.cachedInputTokens > event.inputTokens
  ) {
    problems.push("cached tokens can't exceed input tokens");
  }
  if (!count(event.estimatedCostMicros)) {
    problems.push("estimatedCostMicros must be a whole, non-negative number");
  }
  if (event.estimatedCostMicros !== undefined && !event.currency) {
    problems.push("a cost needs a currency");
  }
  if (event.currency !== undefined && !/^[A-Z]{3}$/.test(event.currency)) {
    problems.push("currency must be an ISO code like GBP");
  }
  if (
    event.destinationCountry !== undefined &&
    !/^[A-Z]{2}$/.test(event.destinationCountry)
  ) {
    problems.push("destinationCountry must be an ISO code like GB");
  }
  return problems;
}
