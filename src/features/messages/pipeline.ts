import type { SupabaseClient } from "@supabase/supabase-js";
import { type ContentType, contentTypes } from "@/domain/channel/inbound";
import { parsePhone } from "@/domain/contacts/phone";
import type { CustomerBooking } from "@/domain/messages/booking-reference";
import {
  type LinkedCustomer,
  resolveIdentity,
} from "@/domain/messages/identity";
import type { Interpretation } from "@/domain/messages/interpretation";
import {
  type Decision,
  decide,
  type PendingClarification,
  scheduleWindow,
  type Service,
} from "@/domain/messages/policy";
import { aiUsage } from "@/domain/usage/usage-event";
import { dateKeyOf } from "@/domain/time/zoned";
import {
  type BusinessRef,
  loadAutomationFor,
  loadScheduleContext,
} from "@/features/schedule/load-schedule";
import { processOwnerRun } from "@/features/messages/owner";
import type {
  InterpreterResult,
  MessageInterpreter,
} from "@/lib/ai/interpreter";
import type { OwnerCommandInterpreter } from "@/lib/ai/owner-interpreter";
import { estimateCost } from "@/lib/ai/pricing";
import type { Database, Json } from "@/lib/supabase/database.types";
import { writeUsage } from "@/lib/usage/ledger";

// The inbound message pipeline. One entry point, processInboundMessage, for
// every source: the development simulator today, the WhatsApp webhook next.
//
//   receive       store the message once (by its external ID) and open a run
//   claim         take the run; one run per conversation at a time
//   context       the business, the sender and who they're linked to
//   interpret     what the message appears to mean (outside any transaction)
//   usage         record what the interpreter call cost
//   decide        identity, dates, the schedule, the owner's settings and
//                 the safety rules decide what happens (pure domain code)
//   persist       apply the decision in one transaction: reply, approval or
//                 owner task, clarification state and activity
//
// Runs as the server (service role), scoped to one business throughout.
// Failures never lose the message and never guess: the owner gets it.

type Db = SupabaseClient<Database>;

export type PipelineDeps = {
  /** The server's client (secret key). */
  db: Db;
  interpreter: MessageInterpreter;
  /** Reads the owner's own commands (owner.ts). Without it they're refused. */
  ownerInterpreter?: OwnerCommandInterpreter;
  /** Trace logging: IDs and outcomes only, never message text. */
  log?: (event: string, fields: Record<string, unknown>) => void;
};

export type InboundMessage = {
  businessId: string;
  /** The sender's number, as received. */
  from: string;
  body: string;
  receivedAt?: Date;
  /** The provider's message ID, or a simulation ID. */
  externalId: string;
  source: "whatsapp" | "simulator";
  /** Text unless said otherwise. Anything else goes to the owner unread. */
  contentType?: ContentType;
};

export type UsageReport = {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  estimatedCostMicros: number | null;
  currency: string | null;
  recorded: boolean;
};

export type ProcessingReport = {
  messageId: string;
  runId: string;
  status: "completed" | "failed" | "pending" | "processing";
  /** This delivery was seen before; nothing was done again. */
  duplicate: boolean;
  interpreter: string | null;
  model: string | null;
  promptVersion: string | null;
  identity?: { kind: string; customer: string | null };
  interpretation?: Interpretation | null;
  failure?: string;
  decision?: Pick<
    Decision,
    "outcome" | "reason" | "reply" | "ownerTask" | "assessment"
  > & {
    approval: { kind: string; proposal: string | null } | null;
  };
  created?: { pendingActionId?: string; replyMessageId?: string };
  usage?: UsageReport | null;
  /** Set when the sender was the business's owner (owner.ts). */
  owner?: {
    intent: string | null;
    outcome: string;
    reason: string;
    reply: string | null;
    /** What happened to a change: changed, conflict or stale. */
    applied: string | null;
  };
};

const MAX_RUNS_PER_DRAIN = 10;

export class PipelineError extends Error {}

/**
 * Receives one inbound message and processes it (and any earlier messages
 * from the same conversation still waiting). Delivering the same external
 * ID again returns the earlier result and changes nothing.
 */
export async function processInboundMessage(
  deps: PipelineDeps,
  message: InboundMessage,
): Promise<ProcessingReport> {
  const phone = parsePhone(message.from);
  if (!phone) throw new PipelineError("That isn't a phone number.");
  if (!message.body.trim()) throw new PipelineError("The message is empty.");
  if (message.contentType && !contentTypes.includes(message.contentType)) {
    throw new PipelineError("Unknown content type.");
  }

  const { data, error } = await deps.db.rpc("ingest_inbound_message", {
    p_business_id: message.businessId,
    p_phone_e164: phone,
    p_body: message.body,
    p_received_at: (message.receivedAt ?? new Date()).toISOString(),
    p_external_id: message.externalId,
    p_source: message.source,
    p_content_type: message.contentType ?? "text",
  });
  if (error || !data)
    throw new PipelineError(error?.message ?? "Ingest failed");
  const ingested = data as {
    message_id: string;
    conversation_id: string;
    run_id: string;
    run_status: ProcessingReport["status"];
    created: boolean;
  };
  deps.log?.("message.received", {
    messageId: ingested.message_id,
    runId: ingested.run_id,
    duplicate: !ingested.created,
  });

  if (ingested.run_status === "completed") {
    return {
      ...(await storedReport(deps.db, ingested.run_id)),
      duplicate: true,
    };
  }

  const reports = await drainConversation(deps, ingested.conversation_id);
  return (
    reports.get(ingested.run_id) ?? {
      ...(await storedReport(deps.db, ingested.run_id)),
      duplicate: !ingested.created,
    }
  );
}

/**
 * Tries a failed (or abandoned) run again. Safe to repeat: a run that has
 * completed is never redone, and a retry replaces what the failed attempt
 * raised rather than adding to it.
 */
export async function reprocessRun(
  deps: PipelineDeps,
  runId: string,
): Promise<ProcessingReport> {
  const { data: attempt, error } = await deps.db.rpc("claim_message_run", {
    p_run_id: runId,
  });
  if (error) throw new PipelineError(error.message);
  if (attempt === null) return storedReport(deps.db, runId);
  return processRun(deps, runId, attempt);
}

/** Works through a conversation's waiting runs, oldest first. */
async function drainConversation(deps: PipelineDeps, conversationId: string) {
  const reports = new Map<string, ProcessingReport>();
  for (let i = 0; i < MAX_RUNS_PER_DRAIN; i++) {
    const { data: waiting, error } = await deps.db
      .from("message_processing_runs")
      .select(
        "id, message:messages!message_processing_runs_business_id_message_id_fkey ( sent_at )",
      )
      .eq("conversation_id", conversationId)
      .in("status", ["pending", "processing"]);
    if (error) throw new PipelineError(error.message);
    const next = (waiting ?? [])
      .filter((r) => !reports.has(r.id))
      .sort((a, b) =>
        (a.message?.sent_at ?? "").localeCompare(b.message?.sent_at ?? ""),
      )[0];
    if (!next) break;
    const { data: attempt, error: claimError } = await deps.db.rpc(
      "claim_message_run",
      { p_run_id: next.id },
    );
    if (claimError) throw new PipelineError(claimError.message);
    // Someone else is working on this conversation: they'll carry on.
    if (attempt === null) break;
    reports.set(next.id, await processRun(deps, next.id, attempt));
  }
  return reports;
}

/**
 * One claimed run. If anything unexpected goes wrong part-way (the
 * database, say), the run is marked failed so the message reaches the
 * owner and can be retried, rather than guessed at or lost.
 */
async function processRun(
  deps: PipelineDeps,
  runId: string,
  attempt: number,
): Promise<ProcessingReport> {
  try {
    return await processClaimedRun(deps, runId, attempt);
  } catch (error) {
    deps.log?.("message.error", {
      runId,
      attempt,
      error: error instanceof Error ? error.message : String(error),
    });
    await deps.db
      .rpc("fail_message_run", {
        p_run_id: runId,
        p_attempt: attempt,
        p_error_category: "processing_error",
      })
      .then(
        () => undefined,
        () => undefined,
      );
    throw error instanceof PipelineError
      ? error
      : new PipelineError("The message couldn’t be processed. It was kept.");
  }
}

async function processClaimedRun(
  deps: PipelineDeps,
  runId: string,
  attempt: number,
): Promise<ProcessingReport> {
  const { db } = deps;
  const context = await loadRunContext(db, runId);
  // The owner's own commands take their own path from here.
  if (context.fromOwner) {
    return processOwnerRun(deps, context, runId, attempt);
  }
  const { message, business, links, conversation } = context;
  const receivedAt = new Date(message.sent_at);
  const today = dateKeyOf(receivedAt, business.timeZone);
  const base = {
    messageId: message.id,
    runId,
    duplicate: false,
  };

  // The owner has taken this conversation over: Pingflow stays out of it,
  // and there's nothing to read the message for.
  if (conversation.automation_paused_at) {
    const created = await complete(db, runId, attempt, {
      interpreter: null,
      model: null,
      prompt_version: null,
      interpretation: null,
      decision: "no_action",
      decision_detail: { reason: "owner_handling" },
      customer_id: null,
      reply: null,
      approval: null,
      owner_task: null,
      clarification: null,
      activity: [],
    });
    deps.log?.("message.processed", {
      messageId: message.id,
      runId,
      attempt,
      decision: "no_action",
      reason: "owner_handling",
    });
    return {
      ...base,
      status: "completed",
      interpreter: null,
      model: null,
      promptVersion: null,
      created,
    };
  }

  // A photo, a voice note, a location: Pingflow only reads text, so the
  // owner gets it, without asking a model to guess.
  if (message.content_type !== "text") {
    const identity = resolveIdentity(links, null);
    const customerId =
      identity.kind === "customer" ? identity.customer.id : null;
    const task = {
      reason: "unsupported_content",
      intent: null,
      draft: null,
      content_type: message.content_type,
    };
    const created = await complete(db, runId, attempt, {
      interpreter: null,
      model: null,
      prompt_version: null,
      interpretation: null,
      decision: "owner_reply_task",
      decision_detail: {
        reason: "unsupported_content",
        content_type: message.content_type,
      },
      customer_id: customerId,
      reply: null,
      approval: null,
      owner_task: task,
      clarification: null,
      activity: [
        {
          kind: "reply_needed",
          actor: "pingflow",
          details: task,
          customer_id: customerId,
          booking_id: null,
          link: "task",
        },
      ],
    });
    deps.log?.("message.processed", {
      messageId: message.id,
      runId,
      attempt,
      decision: "owner_reply_task",
      reason: "unsupported_content",
    });
    return {
      ...base,
      status: "completed",
      interpreter: null,
      model: null,
      promptVersion: null,
      created,
    };
  }

  const pending = readClarification(conversation.clarification);
  const originalText = pending
    ? await originalMessageText(db, pending.messageId)
    : null;

  const result = await deps.interpreter.interpret({
    message: message.body,
    receivedAt,
    timeZone: business.timeZone,
    businessType: business.businessType,
    services: context.services.map((s) => s.name),
    sender: {
      known: links.length > 0,
      customers: links.map((c) => c.fullName.split(/\s+/)[0]),
    },
    clarification:
      pending && originalText
        ? { originalMessage: originalText, question: pending.question }
        : null,
  });

  const usage = await recordUsage(deps, business.id, message.id, runId, result);

  if (!result.ok) {
    const { data: failed, error: failError } = await db.rpc(
      "fail_message_run",
      {
        p_run_id: runId,
        p_attempt: attempt,
        p_error_category: result.failure,
        p_interpreter: result.interpreter,
        p_model: result.model ?? undefined,
        p_prompt_version: result.promptVersion ?? undefined,
      },
    );
    if (failError) throw failError;
    const pendingActionId = (failed as { pending_action_id?: string } | null)
      ?.pending_action_id;
    deps.log?.("message.failed", {
      messageId: message.id,
      runId,
      attempt,
      failure: result.failure,
      interpreter: result.interpreter,
    });
    return {
      ...base,
      status: "failed",
      interpreter: result.interpreter,
      model: result.model,
      promptVersion: result.promptVersion,
      failure: result.failure,
      usage,
      created: pendingActionId ? { pendingActionId } : undefined,
      decision: {
        outcome: "owner_reply_task",
        reason: "interpreter_unavailable",
        reply: null,
        ownerTask: {
          reason: "interpreter_unavailable",
          intent: null,
          draft: null,
        },
        approval: null,
        assessment: {
          identity: "unknown",
          interpreterConfidence: null,
          confident: false,
          notes: [result.failure],
        },
      },
    };
  }

  const identity = resolveIdentity(
    links,
    result.interpretation.person_reference,
  );
  const customerId = identity.kind === "customer" ? identity.customer.id : null;
  const [upcoming, usualServiceId, automation] = await Promise.all([
    customerId ? upcomingBookings(db, business.id, customerId, receivedAt) : [],
    customerId ? usualService(db, business.id, customerId) : null,
    loadAutomationFor(db, business.id),
  ]);
  const window = scheduleWindow({
    interpretation: result.interpretation,
    today,
    upcoming,
    timeZone: business.timeZone,
  });
  const schedule = await loadScheduleContext(
    db,
    business,
    window.from,
    window.days,
  );

  const decision = decide({
    messageId: message.id,
    now: receivedAt,
    today,
    timeZone: business.timeZone,
    identity,
    interpretation: result.interpretation,
    issues: result.issues,
    interpreterFailure: null,
    automation: {
      availabilityReplies: automation.availabilityRepliesEnabled,
      bookingTimeReplies: automation.bookingTimeRepliesEnabled,
      cancellationAcknowledgements:
        automation.cancellationAcknowledgementsEnabled,
    },
    pendingClarification: pending,
    services: context.services,
    upcoming,
    usualServiceId,
    schedule,
  });

  const created = await complete(db, runId, attempt, {
    interpreter: result.interpreter,
    model: result.model,
    prompt_version: result.promptVersion,
    interpretation: result.interpretation,
    decision: decision.outcome,
    decision_detail: {
      reason: decision.reason,
      assessment: decision.assessment,
      identity: identity.kind,
    },
    customer_id: decision.customerId,
    reply: decision.reply,
    approval: decision.approval
      ? {
          kind: decision.approval.kind,
          customer_id: decision.approval.customerId,
          booking_id: decision.approval.bookingId,
          understood: decision.approval.understood,
          proposed_starts_at:
            decision.approval.proposal?.startsAt.toISOString() ?? null,
          proposed_ends_at:
            decision.approval.proposal?.endsAt.toISOString() ?? null,
        }
      : null,
    owner_task: decision.ownerTask,
    clarification: decision.clarification
      ? "set" in decision.clarification
        ? { set: decision.clarification.set }
        : { clear: true }
      : null,
    activity: decision.activity.map((a) => ({
      kind: a.kind,
      actor: a.actor,
      details: a.details,
      customer_id: a.customerId,
      booking_id: a.bookingId,
      link: a.link ?? null,
    })),
  });

  deps.log?.("message.processed", {
    messageId: message.id,
    runId,
    attempt,
    interpreter: result.interpreter,
    intent: result.interpretation.intent,
    decision: decision.outcome,
    reason: decision.reason,
    ...created,
  });

  return {
    ...base,
    status: "completed",
    interpreter: result.interpreter,
    model: result.model,
    promptVersion: result.promptVersion,
    identity: {
      kind: identity.kind,
      customer:
        identity.kind === "customer" ? identity.customer.fullName : null,
    },
    interpretation: result.interpretation,
    decision: {
      outcome: decision.outcome,
      reason: decision.reason,
      reply: decision.reply,
      ownerTask: decision.ownerTask,
      assessment: decision.assessment,
      approval: decision.approval
        ? {
            kind: decision.approval.kind,
            proposal:
              decision.approval.proposal?.startsAt.toISOString() ?? null,
          }
        : null,
    },
    created,
    usage,
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export type RunContext = Awaited<ReturnType<typeof loadRunContext>>;

async function loadRunContext(db: Db, runId: string) {
  const { data: run, error } = await db
    .from("message_processing_runs")
    .select(
      `id, business_id, message_id, conversation_id,
       message:messages!message_processing_runs_business_id_message_id_fkey ( id, body, sent_at, content_type ),
       conversation:conversations ( id, contact_id, clarification, automation_paused_at, contact:contacts ( phone_e164 ) )`,
    )
    .eq("id", runId)
    .single();
  if (error || !run?.message || !run.conversation) {
    throw new PipelineError(error?.message ?? "Run not found");
  }

  const [businessResult, servicesResult, linksResult, ownerResult] =
    await Promise.all([
      db
        .from("businesses")
        .select("id, business_type, timezone, schedule_mode")
        .eq("id", run.business_id)
        .single(),
      db
        .from("services")
        .select("id, name, duration_minutes, buffer_minutes")
        .eq("business_id", run.business_id)
        .is("archived_at", null)
        .order("position"),
      db
        .from("customer_contacts")
        .select("relationship, customer:customers ( id, full_name )")
        .eq("business_id", run.business_id)
        .eq("contact_id", run.conversation.contact_id),
      db
        .from("owner_channel_identities")
        .select("address_e164")
        .eq("business_id", run.business_id)
        .eq("channel", "whatsapp")
        .maybeSingle(),
    ]);
  if (ownerResult.error) throw ownerResult.error;
  if (businessResult.error) throw businessResult.error;
  if (servicesResult.error) throw servicesResult.error;

  const business: BusinessRef & { businessType: string } = {
    id: businessResult.data.id,
    timeZone: businessResult.data.timezone,
    scheduleMode: businessResult.data.schedule_mode,
    businessType: businessResult.data.business_type,
  };
  const services: Service[] = (servicesResult.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    durationMinutes: s.duration_minutes,
    bufferMinutes: s.buffer_minutes,
  }));
  if (linksResult.error) throw linksResult.error;
  // In name order, so "Is this about Adam or Leo?" always reads the same.
  const links: LinkedCustomer[] = linksResult.data
    .filter((l) => l.customer)
    .map((l) => ({
      id: l.customer!.id,
      fullName: l.customer!.full_name,
      relationship: l.relationship,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  // The owner is whoever the business has named as its owner's number:
  // never inferred from names or wording.
  const senderPhone = run.conversation.contact?.phone_e164 ?? null;
  const fromOwner = Boolean(
    senderPhone && ownerResult.data?.address_e164 === senderPhone,
  );

  return {
    run,
    message: run.message,
    conversation: run.conversation,
    business,
    services,
    links,
    fromOwner,
  };
}

async function upcomingBookings(
  db: Db,
  businessId: string,
  customerId: string,
  after: Date,
): Promise<CustomerBooking[]> {
  const { data, error } = await db
    .from("bookings")
    .select(
      "id, starts_at, ends_at, buffer_minutes, service_id, series_id, service:services ( name )",
    )
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .eq("status", "confirmed")
    .gt("starts_at", after.toISOString())
    .order("starts_at")
    .limit(10);
  if (error) throw error;
  return data.map((b) => ({
    id: b.id,
    startsAt: new Date(b.starts_at),
    endsAt: new Date(b.ends_at),
    bufferMinutes: b.buffer_minutes,
    serviceId: b.service_id,
    serviceName: b.service?.name ?? "booking",
    seriesId: b.series_id,
  }));
}

/** The service this customer most recently booked. */
async function usualService(db: Db, businessId: string, customerId: string) {
  const { data, error } = await db
    .from("bookings")
    .select("service_id")
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.service_id ?? null;
}

function readClarification(value: Json | null): PendingClarification | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.question !== "string" || typeof v.messageId !== "string") {
    return null;
  }
  // An owner's open question isn't a customer's.
  if (v.kind === "owner") return null;
  return value as unknown as PendingClarification;
}

export async function originalMessageText(db: Db, messageId: string) {
  const { data, error } = await db
    .from("messages")
    .select("body")
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw error;
  return data?.body ?? null;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

async function complete(
  db: Db,
  runId: string,
  attempt: number,
  result: Record<string, unknown>,
) {
  const { data, error } = await db.rpc("complete_message_run", {
    p_run_id: runId,
    p_attempt: attempt,
    p_result: result as Json,
  });
  if (error)
    throw new PipelineError(`Couldn't save the outcome: ${error.message}`);
  const created = (data ?? {}) as {
    pending_action_id?: string;
    reply_message_id?: string;
  };
  return {
    pendingActionId: created.pending_action_id,
    replyMessageId: created.reply_message_id,
  };
}

export async function recordUsage(
  deps: PipelineDeps,
  businessId: string,
  messageId: string,
  runId: string,
  result: Pick<InterpreterResult, "usage" | "promptVersion" | "ok"> & {
    failure?: string;
  },
  operation:
    "interpret_message" | "interpret_owner_command" = "interpret_message",
): Promise<UsageReport | null> {
  if (!result.usage) return null;
  const u = result.usage;
  const cost = estimateCost(u);
  const report: UsageReport = {
    model: u.model,
    inputTokens: u.inputTokens,
    cachedInputTokens: u.cachedInputTokens,
    outputTokens: u.outputTokens,
    estimatedCostMicros: cost?.micros ?? null,
    currency: cost?.currency ?? null,
    recorded: false,
  };
  try {
    const { recorded } = await writeUsage(
      deps.db,
      aiUsage({
        businessId,
        provider: "openai",
        operation,
        model: u.model,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        cachedInputTokens: u.cachedInputTokens,
        estimatedCostMicros: cost?.micros,
        currency: cost?.currency,
        requestId: u.responseId ?? undefined,
        metadata: {
          prompt_version: result.promptVersion,
          provider_request_id: u.requestId,
          message_id: messageId,
          run_id: runId,
          outcome: result.ok ? "interpreted" : (result.failure ?? "failed"),
        },
      }),
    );
    report.recorded = recorded;
  } catch (error) {
    // Cost accounting never stops a customer's message being handled.
    deps.log?.("usage.not_recorded", {
      messageId,
      runId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return report;
}

/** What a finished run did, from what was stored. */
async function storedReport(db: Db, runId: string): Promise<ProcessingReport> {
  const { data } = await db
    .from("message_processing_runs")
    .select(
      "id, message_id, status, interpreter, model, prompt_version, interpretation, decision, decision_detail, error_category",
    )
    .eq("id", runId)
    .single();
  const detail = (data?.decision_detail ?? {}) as {
    reason?: string;
    sender?: string;
    created?: {
      pending_action_id?: string;
      reply_message_id?: string;
      outcome?: string;
    };
  };
  const fromOwner = detail.sender === "owner";
  return {
    messageId: data?.message_id ?? "",
    runId,
    status: data?.status ?? "pending",
    duplicate: false,
    interpreter: data?.interpreter ?? null,
    model: data?.model ?? null,
    promptVersion: data?.prompt_version ?? null,
    // An owner's command isn't a customer reading.
    interpretation: fromOwner
      ? null
      : ((data?.interpretation as Interpretation | null) ?? null),
    failure: data?.error_category ?? undefined,
    created: detail.created
      ? {
          pendingActionId: detail.created.pending_action_id,
          replyMessageId: detail.created.reply_message_id,
        }
      : undefined,
    ...(fromOwner && data
      ? { owner: await storedOwnerReport(db, data, detail) }
      : {}),
  };
}

/** The owner's side of a finished run, as it was first reported. */
async function storedOwnerReport(
  db: Db,
  run: { interpretation: unknown; decision: string | null },
  detail: {
    reason?: string;
    created?: { reply_message_id?: string; outcome?: string };
  },
): Promise<NonNullable<ProcessingReport["owner"]>> {
  const replyId = detail.created?.reply_message_id;
  const { data: reply } = replyId
    ? await db.from("messages").select("body").eq("id", replyId).maybeSingle()
    : { data: null };
  const outcome = detail.created?.outcome;
  const command = run.interpretation as { intent?: string } | null;
  return {
    intent: command?.intent ?? null,
    outcome: (run.decision ?? "").replace(/^owner_/, ""),
    reason: detail.reason ?? "",
    reply: reply?.body ?? null,
    applied: outcome && outcome !== "answered" ? outcome : null,
  };
}
