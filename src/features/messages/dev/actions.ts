"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { zonedInstant } from "@/domain/time/zoned";
import { devToolsEnabled } from "@/features/messages/dev/enabled";
import {
  PipelineError,
  type ProcessingReport,
  processInboundMessage,
  reprocessRun,
} from "@/features/messages/pipeline";
import { serverPipeline } from "@/features/messages/process";
import { requireOwner } from "@/lib/auth/session";
import { logServerError } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase/service";

// The simulator's actions: development only, and always for the signed-in
// owner's own business. A simulated message goes through exactly the same
// pipeline a WhatsApp message will.

export type SimulationResult =
  | { ok: true; externalId: string; report: ProcessingReport }
  | { ok: false; error: string };

const unavailable: SimulationResult = {
  ok: false,
  error: "The simulator only runs in development.",
};

export async function simulateMessage(input: {
  from: string;
  body: string;
  /** "2026-09-28T14:05", in the business's time zone. Empty for now. */
  receivedAt?: string | null;
  /** Reuse an earlier ID to deliver the same message again. */
  externalId?: string | null;
}): Promise<SimulationResult> {
  if (!devToolsEnabled()) return unavailable;
  const owner = await requireOwner();

  let receivedAt: Date | undefined;
  if (input.receivedAt) {
    const [date, time] = input.receivedAt.split("T");
    try {
      receivedAt = zonedInstant(
        date,
        time.slice(0, 5),
        owner.business.timeZone,
      );
    } catch {
      return { ok: false, error: "That received time isn’t valid." };
    }
  }

  const externalId = input.externalId || `sim-${randomUUID()}`;
  try {
    const report = await processInboundMessage(serverPipeline(), {
      businessId: owner.business.id,
      from: input.from,
      body: input.body,
      receivedAt,
      externalId,
      source: "simulator",
    });
    refresh();
    return { ok: true, externalId, report };
  } catch (error) {
    if (error instanceof PipelineError) {
      return { ok: false, error: error.message };
    }
    logServerError("simulateMessage", error);
    return { ok: false, error: "Processing failed. See the server log." };
  }
}

export async function reprocessMessage(
  runId: string,
): Promise<SimulationResult> {
  if (!devToolsEnabled()) return unavailable;
  const owner = await requireOwner();
  const { data: run } = await createServiceClient()
    .from("message_processing_runs")
    .select("id")
    .eq("id", runId)
    .eq("business_id", owner.business.id)
    .maybeSingle();
  if (!run) return { ok: false, error: "That run isn’t in your business." };

  try {
    const report = await reprocessRun(serverPipeline(), runId);
    refresh();
    return { ok: true, externalId: "", report };
  } catch (error) {
    logServerError("reprocessMessage", error);
    return { ok: false, error: "Reprocessing failed. See the server log." };
  }
}
