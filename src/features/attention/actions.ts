"use server";

import { refresh } from "next/cache";
import { checkSlot } from "@/domain/availability/engine";
import { explainSlotProblem } from "@/domain/availability/explain";
import { firstName, serviceNoun } from "@/domain/messages/templates";
import {
  planBookingApproval,
  planBookingDecline,
  readBookingUnderstanding,
} from "@/domain/requests/booking";
import {
  planCancellationApproval,
  planCancellationDecline,
} from "@/domain/requests/cancellation";
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
import { sendAfterResponse } from "@/features/whatsapp/server";
import { type Owner, requireOwner } from "@/lib/auth/session";
import { type ActionResult, type DbError, friendlyError } from "@/lib/errors";

// The owner's answers to requests in Attention. Each action re-reads the
// request, re-checks the schedule with the availability engine, works out
// the messages and reminder in the domain layer, and then applies everything
// in one database transaction (resolve_reschedule_request,
// resolve_booking_request or resolve_cancellation_request). A reply that
// transaction queued for WhatsApp is sent once the response has gone; the
// booking change never waits for WhatsApp, and never rolls back for it.

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
type Booking = NonNullable<Request["booking"]> & {
  service: NonNullable<NonNullable<Request["booking"]>["service"]>;
};

/** Already answered, or closed by something the owner did elsewhere. */
function handled(): ActionResult {
  refresh();
  return {
    ok: false,
    error: "This request has already been handled.",
    gone: true,
  };
}

/**
 * A failed answer, said plainly. When the failure means the schedule or
 * the request changed underneath the owner (the time was taken, the
 * booking went, someone already answered it), Attention is refreshed so
 * the card shows how things are now rather than offering the same button.
 */
function failed(error: DbError, operation: string): ActionResult {
  const message = friendlyError(error, operation);
  if (error.hint === "already_resolved") {
    refresh();
    return { ok: false, error: message, gone: true };
  }
  if (
    error.code === "23P01" ||
    error.hint === "slot_unavailable" ||
    error.hint === "booking_inactive"
  ) {
    refresh();
  }
  return { ok: false, error: message };
}

function withBooking(request: Request): request is Request & {
  booking: Booking;
  customer: NonNullable<Request["customer"]>;
} {
  return Boolean(request.booking?.service && request.customer);
}

const resolvers = {
  reschedule_request: "resolve_reschedule_request",
  booking_request: "resolve_booking_request",
  cancellation_request: "resolve_cancellation_request",
} as const;

type RequestKind = keyof typeof resolvers;

function isRequestKind(kind: string): kind is RequestKind {
  return kind in resolvers;
}

function parseStart(value: string | null | undefined) {
  const startsAt = value ? new Date(value) : null;
  return startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : null;
}

/** Whether the time is still free, with the owner-facing reason if not. */
async function recheck(
  owner: Owner,
  startsAt: Date,
  length: { durationMinutes: number; bufferMinutes: number },
  ignoreBookingId?: string,
): Promise<string | null> {
  const tz = owner.business.timeZone;
  const context = await loadEngineContext(owner, dateKeyOf(startsAt, tz), 1);
  const check = checkSlot(
    context,
    startsAt,
    { ...length, ignoreBookingId },
    { now: new Date() },
  );
  return check.ok
    ? null
    : `${formatDateTime(startsAt, tz)} isn’t available any more. ${explainSlotProblem(check.problem)} Choose another time.`;
}

/** Approves a move or a new booking at the proposed time, or the one chosen. */
export async function approveRequest(
  actionId: string,
  chosenStartsAt?: string,
): Promise<ActionResult> {
  const owner = await requireOwner();
  const request = await loadRequest(owner, actionId);
  if (!request || request.status !== "open") return handled();
  if (request.kind === "reschedule_request") {
    return approveMove(owner, request, chosenStartsAt);
  }
  if (request.kind === "booking_request") {
    return approveBooking(owner, request, chosenStartsAt);
  }
  if (request.kind === "cancellation_request") {
    return approveCancellation(owner, request);
  }
  return { ok: false, error: "This request can’t be approved here." };
}

async function approveMove(
  owner: Owner,
  request: Request,
  chosenStartsAt?: string,
): Promise<ActionResult> {
  const tz = owner.business.timeZone;
  if (!withBooking(request)) {
    return { ok: false, error: "This request can’t be approved here." };
  }
  const startsAt = parseStart(chosenStartsAt ?? request.proposed_starts_at);
  if (!startsAt) return { ok: false, error: "Choose a time first." };

  const { booking } = request;
  if (new Date(booking.starts_at) <= new Date()) {
    refresh();
    return {
      ok: false,
      error: `${possessiveFirst(request.customer.full_name)} ${serviceNoun(booking.service.name)} on ${formatDateTime(new Date(booking.starts_at), tz)} has already started, so it can’t be moved. Decline it or reply yourself.`,
    };
  }
  const problem = await recheck(
    owner,
    startsAt,
    {
      durationMinutes: minutesBetween(
        new Date(booking.starts_at),
        new Date(booking.ends_at),
      ),
      bufferMinutes: booking.buffer_minutes,
    },
    booking.id,
  );
  if (problem) {
    refresh();
    return { ok: false, error: problem };
  }

  const plan = planRescheduleApproval({
    newStartsAt: startsAt,
    customerName: request.customer.full_name,
    serviceName: booking.service.name,
    timeZone: tz,
    automation: await loadAutomation(owner),
    now: new Date(),
  });

  const { error } = await owner.supabase.rpc("resolve_reschedule_request", {
    p_action_id: request.id,
    p_decision: "approve",
    p_starts_at: plan.startsAt.toISOString(),
    p_reply_body: plan.replyBody ?? undefined,
    p_reminder_send_at: plan.reminderSendAt?.toISOString(),
  });
  if (error) return failed(error, "approveReschedule");

  sendAfterResponse();
  refresh();
  return {
    ok: true,
    message: `${possessiveFirst(request.customer.full_name)} ${serviceNoun(booking.service.name)} is now ${formatDateTime(plan.startsAt, tz)}.`,
  };
}

async function approveBooking(
  owner: Owner,
  request: Request,
  chosenStartsAt?: string,
): Promise<ActionResult> {
  const tz = owner.business.timeZone;
  const understanding = readBookingUnderstanding(request.understood);
  if (!understanding || !request.customer) {
    return { ok: false, error: "This request can’t be approved here." };
  }
  const startsAt = parseStart(chosenStartsAt ?? request.proposed_starts_at);
  if (!startsAt) return { ok: false, error: "Choose a time first." };

  const { data: service, error: serviceError } = await owner.supabase
    .from("services")
    .select("name, duration_minutes, buffer_minutes")
    .eq("business_id", owner.business.id)
    .eq("id", understanding.serviceId)
    .is("archived_at", null)
    .maybeSingle();
  if (serviceError) {
    return { ok: false, error: friendlyError(serviceError, "approveBooking") };
  }
  if (!service) {
    return {
      ok: false,
      error: "That service isn’t available any more. Choose another one.",
    };
  }

  const problem = await recheck(owner, startsAt, {
    durationMinutes: service.duration_minutes,
    bufferMinutes: service.buffer_minutes,
  });
  if (problem) {
    refresh();
    return { ok: false, error: problem };
  }

  const plan = planBookingApproval({
    startsAt,
    customerName: request.customer.full_name,
    serviceName: service.name,
    timeZone: tz,
    automation: await loadAutomation(owner),
    now: new Date(),
  });

  const { error } = await owner.supabase.rpc("resolve_booking_request", {
    p_action_id: request.id,
    p_decision: "approve",
    p_starts_at: plan.startsAt.toISOString(),
    p_reply_body: plan.replyBody ?? undefined,
    p_reminder_send_at: plan.reminderSendAt?.toISOString(),
  });
  if (error) return failed(error, "approveBooking");

  sendAfterResponse();
  refresh();
  return {
    ok: true,
    message: `${possessiveFirst(request.customer.full_name)} ${serviceNoun(service.name)} is booked for ${formatDateTime(plan.startsAt, tz)}.`,
  };
}

async function approveCancellation(
  owner: Owner,
  request: Request,
): Promise<ActionResult> {
  const tz = owner.business.timeZone;
  if (!withBooking(request)) {
    return { ok: false, error: "This request can’t be approved here." };
  }
  const startsAt = new Date(request.booking.starts_at);
  const { replyBody } = planCancellationApproval({
    customerName: request.customer.full_name,
    serviceName: request.booking.service.name,
    startsAt,
    timeZone: tz,
    confirmationsEnabled: (await loadAutomation(owner)).confirmationsEnabled,
  });

  const { error } = await owner.supabase.rpc("resolve_cancellation_request", {
    p_action_id: request.id,
    p_decision: "approve",
    p_reply_body: replyBody ?? undefined,
  });
  if (error) return failed(error, "approveCancellation");

  sendAfterResponse();
  refresh();
  return {
    ok: true,
    message: `${possessiveFirst(request.customer.full_name)} ${serviceNoun(request.booking.service.name)} on ${formatDateTime(startsAt, tz)} is cancelled.`,
  };
}

/** Declines a request and records the reply the owner was shown. */
export async function declineRequest(actionId: string): Promise<ActionResult> {
  const owner = await requireOwner();
  const tz = owner.business.timeZone;
  const today = dateKeyOf(new Date(), tz);
  const request = await loadRequest(owner, actionId);
  if (!request || request.status !== "open") return handled();
  const cannot: ActionResult = {
    ok: false,
    error: "This request can’t be declined here.",
  };
  if (!request.customer || !isRequestKind(request.kind)) return cannot;

  let replyBody: string;
  let outcome: string;
  if (request.kind === "booking_request") {
    const understanding = readBookingUnderstanding(request.understood);
    if (!understanding) return cannot;
    replyBody = planBookingDecline({
      understanding,
      customerName: request.customer.full_name,
      today,
    }).replyBody;
    outcome = "Declined. Nothing was booked.";
  } else {
    if (!withBooking(request)) return cannot;
    const { booking } = request;
    const noun = serviceNoun(booking.service.name);
    if (request.kind === "cancellation_request") {
      replyBody = planCancellationDecline({
        customerName: request.customer.full_name,
        serviceName: booking.service.name,
        startsAt: new Date(booking.starts_at),
        timeZone: tz,
      }).replyBody;
      outcome = `Declined. ${possessiveFirst(request.customer.full_name)} ${noun} is still on.`;
    } else {
      const understanding = readRescheduleUnderstanding(request.understood);
      if (!understanding) return cannot;
      replyBody = planRescheduleDecline({
        understanding,
        currentStartsAt: new Date(booking.starts_at),
        customerName: request.customer.full_name,
        serviceName: booking.service.name,
        timeZone: tz,
        today,
      }).replyBody;
      outcome = `Declined. ${possessiveFirst(request.customer.full_name)} ${noun} stays as it is.`;
    }
  }

  const { error } = await owner.supabase.rpc(resolvers[request.kind], {
    p_action_id: actionId,
    p_decision: "decline",
    p_reply_body: replyBody,
  });
  if (error) return failed(error, "declineRequest");

  sendAfterResponse();
  refresh();
  return { ok: true, message: outcome };
}

/** The owner will deal with it: Pingflow stops replying to this person. */
export async function takeOverRequest(actionId: string): Promise<ActionResult> {
  const owner = await requireOwner();
  const request = await loadRequest(owner, actionId);
  if (!request || request.status !== "open") return handled();
  if (!isRequestKind(request.kind)) {
    return { ok: false, error: "This request can’t be handed over here." };
  }

  const { error } = await owner.supabase.rpc(resolvers[request.kind], {
    p_action_id: actionId,
    p_decision: "take_over",
  });
  if (error) return failed(error, "takeOverRequest");

  refresh();
  const name = request.customer
    ? firstName(request.customer.full_name)
    : "them";
  return {
    ok: true,
    message: `Over to you. Pingflow won’t reply to ${name} until you let it.`,
  };
}

/** The owner's own reply to a message that needed one. */
export async function replyToMessage(
  actionId: string,
  body: string,
): Promise<ActionResult> {
  const owner = await requireOwner();
  const text = body.trim();
  if (!text) return { ok: false, error: "Write a reply first." };
  if (text.length > 4096) {
    return { ok: false, error: "That reply is too long for one message." };
  }
  const { error } = await owner.supabase.rpc("reply_to_pending_action", {
    p_action_id: actionId,
    p_body: text,
  });
  if (error) return failed(error, "replyToMessage");
  sendAfterResponse();
  refresh();

  // Say what actually happens to it, from the message that was stored.
  const { data: sent } = await owner.supabase
    .from("activity_events")
    .select("message:messages ( delivery )")
    .eq("business_id", owner.business.id)
    .eq("pending_action_id", actionId)
    .eq("kind", "reply_sent")
    .limit(1)
    .maybeSingle();
  const delivery = sent?.message?.delivery;
  return {
    ok: true,
    message:
      delivery === "queued"
        ? "Sending your reply on WhatsApp."
        : delivery === "blocked"
          ? "Saved, but WhatsApp won’t allow it from here. Reply in WhatsApp."
          : "Reply recorded.",
  };
}

export async function dismissNote(actionId: string): Promise<ActionResult> {
  const owner = await requireOwner();
  const { error } = await owner.supabase.rpc("dismiss_pending_action", {
    p_action_id: actionId,
  });
  if (error) return failed(error, "dismissNote");
  refresh();
  return { ok: true, message: "Marked as handled." };
}

function possessiveFirst(fullName: string) {
  const first = firstName(fullName);
  return first.endsWith("s") ? `${first}’` : `${first}’s`;
}
