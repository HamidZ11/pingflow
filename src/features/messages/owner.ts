import type { SupabaseClient } from "@supabase/supabase-js";
import type { OwnerCommand } from "@/domain/owner/command";
import {
  decideOwnerCommand,
  type OwnerDecision,
  type OwnerPending,
} from "@/domain/owner/decide";
import { ownerReplies } from "@/domain/owner/replies";
import { resolveDateReference } from "@/domain/messages/dates";
import {
  addDays,
  type DateKey,
  daysBetween,
  dateKeyOf,
  zonedInstant,
} from "@/domain/time/zoned";
import {
  type PipelineDeps,
  PipelineError,
  type ProcessingReport,
  type RunContext,
  originalMessageText,
  recordUsage,
} from "@/features/messages/pipeline";
import {
  loadAutomationFor,
  loadScheduleContext,
} from "@/features/schedule/load-schedule";
import type { OwnerInterpreterResult } from "@/lib/ai/owner-interpreter";
import type { Database, Json } from "@/lib/supabase/database.types";

// The owner's own commands, from their own number. The same pipeline as a
// customer's message up to here (stored once, one at a time, retried
// safely); then the owner's reader and rules:
//
//   read      the owner-command interpreter (words to fields only)
//   usage     recorded as interpret_owner_command
//   load      this business's customers, bookings, blocks and schedule
//   decide    decideOwnerCommand: answer, one question, or one change
//   apply     complete_owner_command: the change (if any), the reply and
//             the run's completion in one transaction, exactly once, with
//             the booking re-checked as it's written
//
// Only this business's data is ever loaded: the run says which business.

type Db = SupabaseClient<Database>;

/** Days of bookings loaded to answer from. */
const WINDOW_DAYS = 60;

function readOwnerPending(value: Json | null): OwnerPending | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  return v.kind === "owner" && typeof v.question === "string"
    ? (value as unknown as OwnerPending)
    : null;
}

export async function processOwnerRun(
  deps: PipelineDeps,
  context: RunContext,
  runId: string,
  attempt: number,
): Promise<ProcessingReport> {
  const { message, business, conversation } = context;
  const receivedAt = new Date(message.sent_at);
  const pending = readOwnerPending(conversation.clarification);
  const base = {
    messageId: message.id,
    runId,
    duplicate: false,
    status: "completed" as const,
  };

  const finish = async (
    decision: OwnerDecision,
    read: {
      interpreter: string | null;
      model: string | null;
      promptVersion: string | null;
      command: OwnerCommand | null;
    },
    usage: ProcessingReport["usage"] = null,
  ): Promise<ProcessingReport> => {
    const created = await completeOwnerCommand(deps.db, runId, attempt, {
      interpreter: read.interpreter,
      model: read.model,
      prompt_version: read.promptVersion,
      interpretation: read.command,
      decision: `owner_${decision.outcome}`,
      decision_detail: { reason: decision.reason, sender: "owner" },
      reply: decision.reply,
      conflict_reply: decision.conflictReply,
      mutation: decision.mutation
        ? {
            ...decision.mutation,
            ...("expectedStartsAt" in decision.mutation
              ? {
                  expected_starts_at:
                    decision.mutation.expectedStartsAt.toISOString(),
                }
              : {}),
            ...(decision.mutation.kind === "reschedule"
              ? {
                  booking_id: decision.mutation.bookingId,
                  starts_at: decision.mutation.startsAt.toISOString(),
                  reminder_send_at:
                    decision.mutation.reminderSendAt?.toISOString() ?? null,
                }
              : decision.mutation.kind === "cancel"
                ? { booking_id: decision.mutation.bookingId }
                : {
                    starts_at: decision.mutation.startsAt.toISOString(),
                    ends_at: decision.mutation.endsAt.toISOString(),
                    label: decision.mutation.label,
                  }),
          }
        : null,
      clarification: decision.clarification,
    });
    deps.log?.("owner.command", {
      messageId: message.id,
      runId,
      attempt,
      intent: read.command?.intent ?? null,
      outcome: decision.outcome,
      reason: decision.reason,
      applied: created.outcome ?? null,
      replyMessageId: created.reply_message_id ?? null,
    });
    return {
      ...base,
      interpreter: read.interpreter,
      model: read.model,
      promptVersion: read.promptVersion,
      usage,
      created: { replyMessageId: created.reply_message_id },
      owner: {
        intent: read.command?.intent ?? null,
        outcome: decision.outcome,
        reason: decision.reason,
        reply:
          created.outcome === "conflict" || created.outcome === "stale"
            ? decision.conflictReply
            : decision.reply,
        applied:
          decision.mutation && created.outcome !== "answered"
            ? (created.outcome ?? null)
            : null,
      },
    };
  };

  const refuse = (reason: string, reply: string): OwnerDecision => ({
    outcome: "refuse",
    reason,
    reply,
    conflictReply: null,
    mutation: null,
    clarification: pending ? { clear: true } : null,
  });
  const noRead = {
    interpreter: null,
    model: null,
    promptVersion: null,
    command: null,
  };

  try {
    if (message.content_type !== "text") {
      return await finish(refuse("not_text", ownerReplies.notText), noRead);
    }
    if (!deps.ownerInterpreter) {
      return await finish(
        refuse("no_interpreter", ownerReplies.failed),
        noRead,
      );
    }

    const originalText = pending
      ? await originalMessageText(deps.db, pending.messageId)
      : null;
    const result: OwnerInterpreterResult =
      await deps.ownerInterpreter.interpret({
        message: message.body,
        receivedAt,
        timeZone: business.timeZone,
        businessType: business.businessType,
        services: context.services.map((s) => s.name),
        clarification:
          pending && originalText
            ? { originalMessage: originalText, question: pending.question }
            : null,
      });
    const usage = await recordUsage(
      deps,
      business.id,
      message.id,
      runId,
      result,
      "interpret_owner_command",
    );
    const read = {
      interpreter: result.interpreter,
      model: result.model,
      promptVersion: result.promptVersion,
      command: result.ok ? result.command : null,
    };

    // Relative days ("tomorrow") are as the owner meant them when they
    // sent it; "has it passed?" is judged now.
    const now = new Date(Math.max(Date.now(), receivedAt.getTime()));
    const today = dateKeyOf(receivedAt, business.timeZone);
    const data = await loadOwnerData(
      deps.db,
      business,
      today,
      windowDays(read.command, today),
    );
    const decision = decideOwnerCommand({
      messageId: message.id,
      now,
      today,
      timeZone: business.timeZone,
      command: read.command,
      pending,
      ...data,
    });
    return await finish(decision, read, usage);
  } catch (error) {
    // Something unexpected (the database, say): tell the owner nothing
    // changed. If even that can't be saved, the run fails and is retried.
    deps.log?.("owner.error", {
      runId,
      error: error instanceof Error ? error.message : String(error),
    });
    try {
      return await finish(
        refuse("processing_error", ownerReplies.failed),
        noRead,
      );
    } catch {
      throw error instanceof PipelineError
        ? error
        : new PipelineError("The owner's command couldn’t be processed.");
    }
  }
}

/** Enough days to cover the command: two months, or out to the day named. */
function windowDays(command: OwnerCommand | null, today: DateKey) {
  const day = resolveDateReference(command?.date ?? null, today);
  const last =
    day?.kind === "day" ? day.date : day ? addDays(day.from, day.days) : today;
  return Math.min(400, Math.max(WINDOW_DAYS, daysBetween(today, last) + 2));
}

async function loadOwnerData(
  db: Db,
  business: RunContext["business"],
  today: DateKey,
  days: number,
) {
  const tz = business.timeZone;
  const from = zonedInstant(today, "00:00", tz).toISOString();
  const until = zonedInstant(addDays(today, days), "00:00", tz).toISOString();
  const [customers, bookings, blocks, schedule, automation] = await Promise.all(
    [
      db
        .from("customers")
        .select("id, full_name")
        .eq("business_id", business.id)
        .order("full_name"),
      db
        .from("bookings")
        .select(
          "id, customer_id, starts_at, ends_at, buffer_minutes, customer:customers ( full_name ), service:services ( name )",
        )
        .eq("business_id", business.id)
        .eq("status", "confirmed")
        .gt("ends_at", from)
        .lt("starts_at", until)
        .order("starts_at")
        .limit(2000),
      db
        .from("schedule_blocks")
        .select("id, starts_at, ends_at, label")
        .eq("business_id", business.id)
        .gt("ends_at", from)
        .lt("starts_at", until),
      loadScheduleContext(db, business, today, days),
      loadAutomationFor(db, business.id),
    ],
  );
  if (customers.error) throw customers.error;
  if (bookings.error) throw bookings.error;
  if (blocks.error) throw blocks.error;

  return {
    customers: customers.data.map((c) => ({ id: c.id, fullName: c.full_name })),
    bookings: bookings.data.map((b) => ({
      id: b.id,
      customerId: b.customer_id,
      customerName: b.customer?.full_name ?? "A customer",
      serviceName: b.service?.name ?? "Booking",
      startsAt: new Date(b.starts_at),
      endsAt: new Date(b.ends_at),
      bufferMinutes: b.buffer_minutes,
    })),
    blocks: blocks.data.map((b) => ({
      id: b.id,
      startsAt: new Date(b.starts_at),
      endsAt: new Date(b.ends_at),
      label: b.label,
    })),
    schedule,
    reminders: automation.reminders,
  };
}

async function completeOwnerCommand(
  db: Db,
  runId: string,
  attempt: number,
  result: Record<string, unknown>,
) {
  const { data, error } = await db.rpc("complete_owner_command", {
    p_run_id: runId,
    p_attempt: attempt,
    p_result: result as Json,
  });
  if (error)
    throw new PipelineError(`Couldn’t save the outcome: ${error.message}`);
  return (data ?? {}) as { reply_message_id?: string; outcome?: string };
}
