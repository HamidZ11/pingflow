"use server";

import { refresh } from "next/cache";
import { checkSlot } from "@/domain/availability/engine";
import { explainSlotProblem } from "@/domain/availability/explain";
import { firstName, serviceNoun } from "@/domain/messages/templates";
import {
  planRescheduleApproval,
  planRescheduleDecline,
  readRescheduleUnderstanding,
} from "@/domain/requests/reschedule";
import { formatDateTime } from "@/domain/time/format";
import { dateKeyOf, minutesBetween } from "@/domain/time/zoned";
import {
  loadAutomation,
  loadEngineContext,
} from "@/features/schedule/engine-context";
import { type Owner, requireOwner } from "@/lib/auth/session";
import { type ActionResult, friendlyError } from "@/lib/errors";

// The owner's answers to a reschedule request. Each action re-reads the
// request, re-checks the schedule with the availability engine, works out
// the messages and reminder in the domain layer, and then applies everything
// in one database transaction (resolve_reschedule_request).

async function loadRequest(owner: Owner, actionId: string) {
  const { data, error } = await owner.supabase
    .from("pending_actions")
    .select(
      `id, status, kind, understood, proposed_starts_at,
       customer:customers ( full_name ),
       booking:bookings ( id, starts_at, ends_at, buffer_minutes, status,
                          service:services ( name ) )`,
    )
    .eq("business_id", owner.business.id)
    .eq("id", actionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

type Request = NonNullable<Awaited<ReturnType<typeof loadRequest>>>;

function usable(request: Request | null): request is Request & {
  booking: NonNullable<Request["booking"]> & {
    service: NonNullable<NonNullable<Request["booking"]>["service"]>;
  };
  customer: NonNullable<Request["customer"]>;
} {
  return Boolean(
    request &&
    request.kind === "reschedule_request" &&
    request.booking?.service &&
    request.customer,
  );
}

export async function approveReschedule(
  actionId: string,
  chosenStartsAt?: string,
): Promise<ActionResult> {
  const owner = await requireOwner();
  const tz = owner.business.timeZone;
  const request = await loadRequest(owner, actionId);
  if (!request || request.status !== "open") {
    return { ok: false, error: "This request has already been handled." };
  }
  if (!usable(request)) {
    return { ok: false, error: "This request can’t be approved here." };
  }

  const startsIso = chosenStartsAt ?? request.proposed_starts_at;
  const startsAt = startsIso ? new Date(startsIso) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    return { ok: false, error: "Choose a time first." };
  }

  const { booking } = request;
  const lengthMinutes = minutesBetween(
    new Date(booking.starts_at),
    new Date(booking.ends_at),
  );
  const now = new Date();
  const context = await loadEngineContext(owner, dateKeyOf(startsAt, tz), 1);
  const check = checkSlot(
    context,
    startsAt,
    {
      durationMinutes: lengthMinutes,
      bufferMinutes: booking.buffer_minutes,
      ignoreBookingId: booking.id,
    },
    { now },
  );
  if (!check.ok) {
    return {
      ok: false,
      error: `${formatDateTime(startsAt, tz)} isn’t available any more. ${explainSlotProblem(check.problem)} Choose another time.`,
    };
  }

  const plan = planRescheduleApproval({
    newStartsAt: startsAt,
    customerName: request.customer.full_name,
    serviceName: booking.service.name,
    timeZone: tz,
    automation: await loadAutomation(owner),
    now,
  });

  const { error } = await owner.supabase.rpc("resolve_reschedule_request", {
    p_action_id: actionId,
    p_decision: "approve",
    p_starts_at: plan.startsAt.toISOString(),
    p_reply_body: plan.replyBody ?? undefined,
    p_reminder_send_at: plan.reminderSendAt?.toISOString(),
  });
  if (error)
    return { ok: false, error: friendlyError(error, "approveReschedule") };

  refresh();
  return {
    ok: true,
    message: `${possessiveFirst(request.customer.full_name)} ${serviceNoun(booking.service.name)} is now ${formatDateTime(plan.startsAt, tz)}.`,
  };
}

export async function declineReschedule(
  actionId: string,
): Promise<ActionResult> {
  const owner = await requireOwner();
  const tz = owner.business.timeZone;
  const request = await loadRequest(owner, actionId);
  if (!request || request.status !== "open") {
    return { ok: false, error: "This request has already been handled." };
  }
  if (!usable(request)) {
    return { ok: false, error: "This request can’t be declined here." };
  }
  const understanding = readRescheduleUnderstanding(request.understood);
  if (!understanding) {
    return { ok: false, error: "This request can’t be declined here." };
  }

  const { replyBody } = planRescheduleDecline({
    understanding,
    currentStartsAt: new Date(request.booking.starts_at),
    customerName: request.customer.full_name,
    serviceName: request.booking.service.name,
    timeZone: tz,
    today: dateKeyOf(new Date(), tz),
  });

  const { error } = await owner.supabase.rpc("resolve_reschedule_request", {
    p_action_id: actionId,
    p_decision: "decline",
    p_reply_body: replyBody,
  });
  if (error)
    return { ok: false, error: friendlyError(error, "declineReschedule") };

  refresh();
  return {
    ok: true,
    message: `Declined. ${possessiveFirst(request.customer.full_name)} ${serviceNoun(request.booking.service.name)} stays as it is.`,
  };
}

export async function takeOverReschedule(
  actionId: string,
): Promise<ActionResult> {
  const owner = await requireOwner();
  const request = await loadRequest(owner, actionId);
  if (!request || request.status !== "open") {
    return { ok: false, error: "This request has already been handled." };
  }

  const { error } = await owner.supabase.rpc("resolve_reschedule_request", {
    p_action_id: actionId,
    p_decision: "take_over",
  });
  if (error)
    return { ok: false, error: friendlyError(error, "takeOverReschedule") };

  refresh();
  const name = request.customer
    ? firstName(request.customer.full_name)
    : "them";
  return {
    ok: true,
    message: `Over to you. Pingflow won’t reply to ${name} until you let it.`,
  };
}

export async function dismissNote(actionId: string): Promise<ActionResult> {
  const owner = await requireOwner();
  const { error } = await owner.supabase.rpc("dismiss_pending_action", {
    p_action_id: actionId,
  });
  if (error) return { ok: false, error: friendlyError(error, "dismissNote") };
  refresh();
  return { ok: true, message: "Marked as handled." };
}

function possessiveFirst(fullName: string) {
  const first = firstName(fullName);
  return first.endsWith("s") ? `${first}’` : `${first}’s`;
}
