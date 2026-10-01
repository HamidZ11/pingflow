import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type UsageEvent,
  usageEventProblems,
} from "@/domain/usage/usage-event";
import type { Database } from "@/lib/supabase/database.types";

// Writes usage events to the internal ledger (public.usage_events). Takes
// the client as an argument so it can be tested; in the app, use
// src/lib/usage/record.ts, which supplies the server-only client.

export function toUsageRow(
  event: UsageEvent,
): Database["public"]["Tables"]["usage_events"]["Insert"] {
  return {
    business_id: event.businessId,
    occurred_at: event.occurredAt?.toISOString(),
    category: event.category,
    provider: event.provider,
    operation: event.operation,
    quantity: event.quantity,
    unit: event.unit,
    model: event.model ?? null,
    input_tokens: event.inputTokens ?? null,
    output_tokens: event.outputTokens ?? null,
    cached_input_tokens: event.cachedInputTokens ?? null,
    message_category: event.messageCategory ?? null,
    destination_country: event.destinationCountry ?? null,
    billable: event.billable ?? null,
    estimated_cost_micros: event.estimatedCostMicros ?? null,
    currency: event.currency ?? null,
    external_reference: event.externalReference ?? null,
    metadata: (event.metadata ??
      {}) as Database["public"]["Tables"]["usage_events"]["Insert"]["metadata"],
  };
}

/**
 * Records one event. A provider event that was already recorded (same
 * provider, operation and external reference, e.g. a webhook delivered
 * twice) is ignored: `recorded` is false and nothing changes.
 */
export async function writeUsage(
  client: SupabaseClient<Database>,
  event: UsageEvent,
): Promise<{ recorded: boolean }> {
  const problems = usageEventProblems(event);
  if (problems.length) {
    throw new Error(`Invalid usage event: ${problems.join("; ")}`);
  }
  const { data, error } = await client
    .from("usage_events")
    .upsert(toUsageRow(event), {
      onConflict: "provider,operation,external_reference",
      ignoreDuplicates: true,
    })
    .select("id");
  if (error) throw new Error(`Couldn't record usage: ${error.message}`);
  return { recorded: (data?.length ?? 0) > 0 };
}
