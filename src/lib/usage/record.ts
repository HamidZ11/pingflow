import "server-only";
import {
  aiUsage,
  messagingUsage,
  type UsageEvent,
} from "@/domain/usage/usage-event";
import { createServiceClient } from "@/lib/supabase/service";
import { writeUsage } from "@/lib/usage/ledger";

// The one way integrations record what they cost. For example, after a
// model call:
//
//   await recordAiUsage({ businessId, provider: "openai",
//     operation: "interpret_message", model, inputTokens, outputTokens,
//     requestId, estimatedCostMicros, currency: "USD" });
//
// Server-side only: the ledger is internal and owners can't read it.

export function recordUsage(event: UsageEvent) {
  return writeUsage(createServiceClient(), event);
}

export function recordAiUsage(input: Parameters<typeof aiUsage>[0]) {
  return recordUsage(aiUsage(input));
}

export function recordMessagingUsage(
  input: Parameters<typeof messagingUsage>[0],
) {
  return recordUsage(messagingUsage(input));
}
