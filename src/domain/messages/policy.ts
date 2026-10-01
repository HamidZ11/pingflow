import {
  availableSlots,
  type Interval,
  type ScheduleContext,
} from "@/domain/availability/engine";
import {
  type CustomerBooking,
  resolveBookingReference,
} from "@/domain/messages/booking-reference";
import {
  describeTimeReference,
  inWindow,
  type ResolvedDay,
  resolveDateReference,
  resolveTimeWindow,
  type SlotWindow,
} from "@/domain/messages/dates";
import type { Identity } from "@/domain/messages/identity";
import type {
  Intent,
  Interpretation,
  InterpretationIssue,
  TimeReference,
} from "@/domain/messages/interpretation";
import {
  availabilityReply,
  cancellationAcknowledgement,
  type ClarificationTopic,
  clarificationHandoff,
  clarificationQuestion,
  exactTimeFreeReply,
  exactTimeTakenReply,
  nextBookingReply,
  noAvailabilityReply,
  noUpcomingBookingReply,
  onDay,
} from "@/domain/messages/replies";
import { serviceNoun } from "@/domain/messages/templates";
import { formatDuration } from "@/domain/time/format";
import {
  addDays,
  addMinutes,
  clockTimeOf,
  type DateKey,
  dateKeyOf,
  minutesBetween,
} from "@/domain/time/zoned";

// The decision policy: what Pingflow does with a message, given who sent
// it, what it appears to mean, the owner's settings and the real schedule.
// Pure and deterministic. The interpreter's answer is one input among
// several; it never decides anything by itself.
//
// Locked rules
// - Automatic, for a customer Pingflow is sure of, and only if the owner's
//   automation is on: "when is my booking?" and availability questions.
// - New bookings, moves and cancellations always wait for the owner.
// - A message that isn't clear gets one short question. If the answer is
//   still unclear, the customer is told it's been passed on, and the owner
//   takes it from there.
// - A follow-up to a request still waiting for the owner ("actually 6 would
//   be better") revises that request: same booking, and the day they asked
//   for unless they name another. The newer request replaces the older one.
// - Anything else (complaints, questions Pingflow can't answer from its own
//   data, unknown numbers asking about bookings) goes to the owner. Nothing
//   free-form is ever sent automatically.

/** How many clarifying questions Pingflow asks before handing over. */
export const MAX_CLARIFICATION_TURNS = 1;

/** Most free times offered in one availability reply. */
export const MAX_OFFERS = 3;

/** How far ahead "when can you fit me in?" looks. */
export const OPEN_AVAILABILITY_DAYS = 7;

export type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
};

export type PendingClarification = {
  intent: Intent;
  topic: ClarificationTopic;
  question: string;
  /** The message that needed clarifying. */
  messageId: string;
  customerId: string | null;
  turns: number;
};

export type Outcome =
  | "auto_reply"
  | "request_clarification"
  | "create_approval"
  | "owner_reply_task"
  | "no_action"
  | "privacy_hold"
  | "unsupported";

export type OwnerTaskReason =
  | "clarification_exhausted"
  | "identity_unknown"
  | "not_linked"
  | "new_contact"
  | "unsupported"
  | "interpreter_unavailable"
  | "automation_off"
  | "business_question"
  | "no_booking_found";

export type ReplyKind =
  | "next_booking"
  | "availability"
  | "clarification"
  | "handoff"
  | "cancellation_ack";

export type ApprovalKind =
  "reschedule_request" | "booking_request" | "cancellation_request";

/**
 * A request from this conversation still waiting for the owner, as stored:
 * what a follow-up message may be revising.
 */
export type OpenRequest = {
  id: string;
  kind: ApprovalKind;
  customerId: string | null;
  bookingId: string | null;
  /** The day they asked for, for a booking or a move. */
  preferredDate: DateKey | null;
  serviceId: string | null;
};

export type Approval = {
  kind: ApprovalKind;
  customerId: string;
  bookingId: string | null;
  understood: Record<string, unknown>;
  proposal: Interval | null;
};

export type ActivityDraft = {
  kind:
    | "request_understood"
    | "time_proposed"
    | "approval_requested"
    | "reply_sent"
    | "reply_needed";
  actor: "pingflow";
  details: Record<string, unknown>;
  customerId: string | null;
  bookingId: string | null;
  /** Link to what this decision creates, once it has an ID. */
  link?: "approval" | "reply" | "task";
};

export type Decision = {
  outcome: Outcome;
  /** A short machine-readable reason, for logs and the developer view. */
  reason: string;
  customerId: string | null;
  reply: { kind: ReplyKind; body: string } | null;
  approval: Approval | null;
  ownerTask: {
    reason: OwnerTaskReason;
    intent: Intent | null;
    draft: string | null;
  } | null;
  clarification: { set: PendingClarification } | { clear: true } | null;
  activity: ActivityDraft[];
  /** Pingflow's own reading of how sure it is, beside the interpreter's. */
  assessment: {
    identity: Identity["kind"];
    interpreterConfidence: Interpretation["confidence"] | null;
    confident: boolean;
    notes: string[];
  };
};

export type PolicyInput = {
  messageId: string;
  now: Date;
  today: DateKey;
  timeZone: string;
  identity: Identity;
  interpretation: Interpretation | null;
  issues: InterpretationIssue[];
  /** Set when the interpreter couldn't produce an answer at all. */
  interpreterFailure: string | null;
  automation: {
    availabilityReplies: boolean;
    bookingTimeReplies: boolean;
    cancellationAcknowledgements: boolean;
  };
  pendingClarification: PendingClarification | null;
  /** This conversation's requests still waiting for the owner, newest first. */
  openRequests: OpenRequest[];
  services: Service[];
  /** Upcoming confirmed bookings of the identified customer, soonest first. */
  upcoming: CustomerBooking[];
  /** The service this customer usually books, if any. */
  usualServiceId: string | null;
  /** Covers every date the decision may look at (see scheduleWindow). */
  schedule: ScheduleContext;
};

// ---------------------------------------------------------------------------
// Which days the decision needs the schedule for
// ---------------------------------------------------------------------------

/** The run of days to load the schedule for before deciding. */
export function scheduleWindow(input: {
  interpretation: Interpretation | null;
  today: DateKey;
  upcoming: CustomerBooking[];
  timeZone: string;
}): { from: DateKey; days: number } {
  let last = addDays(input.today, 14);
  const consider = (date: DateKey | undefined) => {
    if (date && date > last) last = date;
  };
  const day = input.interpretation
    ? resolveDateReference(input.interpretation.requested_date, input.today)
    : null;
  if (day?.kind === "day") consider(day.date);
  if (day?.kind === "range") consider(addDays(day.from, day.days - 1));
  for (const b of input.upcoming.slice(0, 5)) {
    consider(dateKeyOf(b.startsAt, input.timeZone));
  }
  const days = Math.min(
    60,
    Math.round((Date.parse(last) - Date.parse(input.today)) / 86_400_000) + 1,
  );
  return { from: input.today, days };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0];
}

function slotsOn(
  input: PolicyInput,
  date: DateKey,
  service: Service,
  window: SlotWindow,
  ignoreBookingId?: string,
): Interval[] {
  return availableSlots(
    input.schedule,
    date,
    {
      durationMinutes: service.durationMinutes,
      bufferMinutes: service.bufferMinutes,
      ignoreBookingId,
    },
    { now: input.now },
  ).filter((s) => inWindow(clockTimeOf(s.startsAt, input.timeZone), window));
}

/** Up to `max` distinct options, spaced so they don't overlap. */
function spaced(slots: Interval[], max: number, gapMinutes: number) {
  const picked: Interval[] = [];
  for (const slot of slots) {
    const last = picked.at(-1);
    if (!last || minutesBetween(last.startsAt, slot.startsAt) >= gapMinutes) {
      picked.push(slot);
    }
    if (picked.length === max) break;
  }
  return picked;
}

type ServiceChoice =
  | { kind: "found"; service: Service }
  | { kind: "ambiguous"; options: Service[] };

/**
 * Lowercase letters and digits only, with "&" read as "and":
 * "Two-hour lesson" → "twohourlesson", "Wash & tidy" → "washandtidy".
 */
export function simplify(text: string) {
  return text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

function chooseService(
  input: PolicyInput,
  reference: string | null,
  { allowUsual }: { allowUsual: boolean },
): ServiceChoice {
  const active = input.services;
  const usual = active.find((s) => s.id === input.usualServiceId);
  if (reference) {
    const want = simplify(reference);
    const named = active.filter((s) => {
      const have = simplify(s.name);
      return have.includes(want) || want.includes(have);
    });
    if (named.length === 1) return { kind: "found", service: named[0] };
    if (named.length > 1) {
      // "lesson" fits several: the one they usually book, if allowed.
      if (allowUsual && usual && named.includes(usual)) {
        return { kind: "found", service: usual };
      }
      return { kind: "ambiguous", options: named };
    }
  }
  if (active.length === 1) return { kind: "found", service: active[0] };
  if (allowUsual) return { kind: "found", service: usual ?? active[0] };
  return { kind: "ambiguous", options: active };
}

function periodPhrase(day: string, time: TimeReference) {
  const t = describeTimeReference(time);
  if (!t) return day;
  if (["morning", "afternoon", "evening"].includes(time!.constraint)) {
    return day === "today"
      ? `this ${t}`
      : day === "tomorrow"
        ? `tomorrow ${t}`
        : `${day} ${t}`;
  }
  return `${day} ${t}`;
}

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

export function decide(input: PolicyInput): Decision {
  const i = input.interpretation;
  const identity = input.identity;
  const pending = input.pendingClarification;
  const customer = identity.kind === "customer" ? identity.customer : null;
  const notes: string[] = [...input.issues];

  const base = {
    customerId: customer?.id ?? null,
    reply: null,
    approval: null,
    ownerTask: null,
    clarification: pending ? ({ clear: true } as const) : null,
    activity: [] as ActivityDraft[],
    assessment: {
      identity: identity.kind,
      interpreterConfidence: i?.confidence ?? null,
      confident: false,
      notes,
    },
  };

  const ownerTask = (
    reason: OwnerTaskReason,
    outcome: Outcome = "owner_reply_task",
    draft: string | null = null,
  ): Decision => ({
    ...base,
    outcome,
    reason,
    ownerTask: { reason, intent: i?.intent ?? null, draft },
    activity: [
      {
        kind: "reply_needed",
        actor: "pingflow",
        details: { reason, intent: i?.intent ?? null },
        customerId: customer?.id ?? null,
        bookingId: null,
        link: "task",
      },
    ],
  });

  // One question at most; after that the owner takes over.
  const clarify = (
    topic: ClarificationTopic,
    intent: Intent,
    options: Parameters<typeof clarificationQuestion>[1] = {},
  ): Decision => {
    if (pending && pending.turns >= MAX_CLARIFICATION_TURNS) {
      notes.push(`still unclear after ${pending.turns} question`);
      const handedOver = ownerTask("clarification_exhausted");
      // Say what's still missing: this answer's gap, or, if the answer
      // made no sense at all, what the question was about.
      const body = clarificationHandoff(
        topic === "intent" ? pending.topic : topic,
        { noun: options.noun },
      );
      handedOver.reply = { kind: "handoff", body };
      handedOver.activity.push({
        kind: "reply_sent",
        actor: "pingflow",
        details: { reply_kind: "handoff", delivery: "simulated" },
        customerId: customer?.id ?? null,
        bookingId: null,
        link: "reply",
      });
      return handedOver;
    }
    const question = clarificationQuestion(topic, {
      timeZone: input.timeZone,
      today: input.today,
      ...options,
    });
    return {
      ...base,
      outcome: "request_clarification",
      reason: `missing_${topic}`,
      reply: { kind: "clarification", body: question },
      clarification: {
        set: {
          intent,
          topic,
          question,
          messageId: pending?.messageId ?? input.messageId,
          customerId: customer?.id ?? null,
          turns: (pending?.turns ?? 0) + 1,
        },
      },
      activity: [
        {
          kind: "reply_sent",
          actor: "pingflow",
          details: { reply_kind: "clarification", delivery: "simulated" },
          customerId: customer?.id ?? null,
          bookingId: null,
          link: "reply",
        },
      ],
    };
  };

  const autoReply = (
    kind: ReplyKind,
    body: string,
    reason: string,
    understood: Record<string, unknown>,
    enabled: boolean,
  ): Decision => {
    // Automatic answers only go to a number Pingflow knows. For anyone
    // else the owner gets the same answer as a draft to send or change.
    if (identity.kind === "unknown") {
      return ownerTask("identity_unknown", "owner_reply_task", body);
    }
    if (!enabled) {
      notes.push("automation off");
      return ownerTask("automation_off", "owner_reply_task", body);
    }
    return {
      ...base,
      outcome: "auto_reply",
      reason,
      reply: { kind, body },
      assessment: { ...base.assessment, confident: true },
      activity: [
        {
          kind: "request_understood",
          actor: "pingflow",
          details: understood,
          customerId: customer?.id ?? null,
          bookingId: null,
        },
        {
          kind: "reply_sent",
          actor: "pingflow",
          details: { reply_kind: kind, delivery: "simulated" },
          customerId: customer?.id ?? null,
          bookingId: null,
          link: "reply",
        },
      ],
    };
  };

  // The interpreter couldn't answer (unavailable, refused, malformed).
  // Never guess: the owner sees the message.
  if (!i || input.interpreterFailure) {
    notes.push(input.interpreterFailure ?? "no interpretation");
    return ownerTask("interpreter_unavailable");
  }

  // "Thanks", "perfect", 👍: nothing to do, and any open question stays open.
  if (i.intent === "acknowledgement") {
    return {
      ...base,
      clarification: null,
      outcome: "no_action",
      reason: "acknowledgement",
    };
  }

  const needsCustomer: Intent[] = [
    "next_booking_query",
    "reschedule_request",
    "cancellation_request",
    "new_booking_request",
  ];

  // Identity and privacy come first, and don't depend on the interpreter.
  if (identity.kind === "unknown") {
    if (i.intent === "new_booking_request") return ownerTask("new_contact");
    if (
      [
        "next_booking_query",
        "reschedule_request",
        "cancellation_request",
      ].includes(i.intent) ||
      i.person_reference
    ) {
      notes.push("unknown number asking about a booking");
      return ownerTask("identity_unknown", "privacy_hold");
    }
    if (i.intent === "unsupported")
      return ownerTask("unsupported", "unsupported");
    if (i.intent === "unclear") return ownerTask("identity_unknown");
    // Availability and simple questions carry on below: nothing private is
    // involved, and the answer becomes a draft for the owner.
  }
  if (identity.kind === "not_linked") {
    notes.push(`named someone this number isn't linked to`);
    return ownerTask("not_linked", "privacy_hold");
  }
  if (identity.kind === "ambiguous" && needsCustomer.includes(i.intent)) {
    return clarify("person", i.intent, {
      names: identity.candidates.map((c) => firstName(c.fullName)),
    });
  }

  if (i.intent === "unsupported")
    return ownerTask("unsupported", "unsupported");

  if (
    identity.kind !== "unknown" &&
    (i.intent === "unclear" || i.confidence === "low")
  ) {
    notes.push(i.intent === "unclear" ? "intent unclear" : "low confidence");
    return clarify("intent", pending?.intent ?? i.intent);
  }

  const noun = (serviceName?: string) =>
    serviceNoun(serviceName ?? input.services[0]?.name ?? "booking");

  // The newest request of this kind this customer is still waiting on.
  const openRequest = (kind: ApprovalKind) =>
    customer
      ? (input.openRequests.find(
          (r) => r.kind === kind && r.customerId === customer.id,
        ) ?? null)
      : null;

  switch (i.intent) {
    case "next_booking_query": {
      const service = i.service_reference
        ? simplify(i.service_reference)
        : null;
      const next =
        input.upcoming.find(
          (b) =>
            !service ||
            simplify(b.serviceName).includes(service) ||
            service.includes(simplify(b.serviceName)),
        ) ?? input.upcoming[0];
      // A parent or carer asking about someone else hears their name.
      const forName =
        customer && customer.relationship !== "self"
          ? firstName(customer.fullName)
          : null;
      const body = next
        ? nextBookingReply({
            serviceName: next.serviceName,
            startsAt: next.startsAt,
            timeZone: input.timeZone,
            today: input.today,
            forName,
          })
        : noUpcomingBookingReply(forName);
      return autoReply(
        "next_booking",
        body,
        next ? "next_booking" : "no_upcoming_booking",
        {
          intent: "next_booking_query",
          booking_starts_at: next?.startsAt.toISOString() ?? null,
        },
        input.automation.bookingTimeReplies,
      );
    }

    case "availability_query": {
      const choice = chooseService(input, i.service_reference, {
        allowUsual: true,
      });
      const service =
        choice.kind === "found" ? choice.service : input.services[0];
      if (!service) return ownerTask("unsupported", "unsupported");
      const window = resolveTimeWindow(i.requested_time);
      if (!window) return clarify("time", i.intent);
      const day: ResolvedDay = resolveDateReference(
        i.requested_date,
        input.today,
      ) ?? { kind: "range", from: input.today, days: OPEN_AVAILABILITY_DAYS };
      const gap = Math.max(60, service.durationMinutes);
      const understood = {
        intent: "availability_query",
        date: day.kind === "day" ? day.date : null,
        time_constraint: i.requested_time?.constraint ?? null,
        time: i.requested_time?.time ?? null,
      };

      if (day.kind === "day") {
        const dayWords = onDay(day.date, input.today);
        if (window.exact) {
          const exact = slotsOn(input, day.date, service, window);
          if (exact.length) {
            return autoReply(
              "availability",
              exactTimeFreeReply({
                startsAt: exact[0].startsAt,
                timeZone: input.timeZone,
                today: input.today,
              }),
              "exact_time_free",
              understood,
              input.automation.availabilityReplies,
            );
          }
          const alternatives = spaced(
            slotsOn(input, day.date, service, {}),
            2,
            gap,
          );
          return autoReply(
            "availability",
            exactTimeTakenReply({
              asked: window.exact,
              date: day.date,
              alternatives,
              timeZone: input.timeZone,
              today: input.today,
            }),
            "exact_time_taken",
            understood,
            input.automation.availabilityReplies,
          );
        }
        const offers = spaced(
          slotsOn(input, day.date, service, window),
          MAX_OFFERS,
          gap,
        );
        const body = offers.length
          ? availabilityReply({
              offers,
              timeZone: input.timeZone,
              today: input.today,
            })
          : noAvailabilityReply(periodPhrase(dayWords, i.requested_time));
        return autoReply(
          "availability",
          body,
          offers.length ? "slots_offered" : "nothing_free",
          understood,
          input.automation.availabilityReplies,
        );
      }

      // A run of days: the first free time on each of the first few days.
      const offers: Interval[] = [];
      for (let d = 0; d < day.days && offers.length < MAX_OFFERS; d++) {
        const date = addDays(day.from, d);
        const first = slotsOn(input, date, service, window)[0];
        if (first) offers.push(first);
      }
      const body = offers.length
        ? availabilityReply({
            offers,
            timeZone: input.timeZone,
            today: input.today,
          })
        : noAvailabilityReply(
            i.requested_date?.kind === "next_week"
              ? "next week"
              : i.requested_date?.kind === "this_week"
                ? "this week"
                : "in the next week",
          );
      return autoReply(
        "availability",
        body,
        offers.length ? "slots_offered" : "nothing_free",
        understood,
        input.automation.availabilityReplies,
      );
    }

    case "new_booking_request": {
      // "Actually 6 would be better": the same booking request, changed.
      const revising = openRequest("booking_request");
      const revisedService =
        !i.service_reference && revising?.serviceId
          ? input.services.find((s) => s.id === revising.serviceId)
          : undefined;
      const choice: ServiceChoice = revisedService
        ? { kind: "found", service: revisedService }
        : chooseService(input, i.service_reference, { allowUsual: false });
      if (choice.kind === "ambiguous") {
        return clarify("service", i.intent, {
          services: choice.options.slice(0, 3).map((s) => s.name),
        });
      }
      const service = choice.service;
      const day =
        resolveDateReference(i.requested_date, input.today) ??
        (revising?.preferredDate && i.requested_time && !i.clarification_needed
          ? ({ kind: "day", date: revising.preferredDate } as const)
          : null);
      if (!day || day.kind !== "day") {
        return clarify("date", i.intent);
      }
      const window = resolveTimeWindow(i.requested_time);
      if (!window)
        return clarify("time", i.intent, { day: onDay(day.date, input.today) });

      const matching = slotsOn(input, day.date, service, window);
      const fallback = matching.length
        ? []
        : slotsOn(input, day.date, service, {});
      const proposal =
        matching[0] ?? nearestTo(fallback, window, input) ?? null;
      const understood = {
        intent: "new_booking",
        preferred_date: day.date,
        time_constraint: i.requested_time?.constraint ?? null,
        time: i.requested_time?.time ?? null,
        earliest_time:
          i.requested_time?.constraint === "after"
            ? i.requested_time.time
            : null,
        service_id: service.id,
        service_name: service.name,
      };
      return approval(input, base, {
        kind: "booking_request",
        customerId: customer!.id,
        bookingId: null,
        understood,
        proposal,
      });
    }

    case "reschedule_request": {
      // A follow-up to a move still waiting for the owner is about the same
      // booking, unless it names a different one.
      const revising = openRequest("reschedule_request");
      // "My next one", or a day or time, says which booking: no borrowing.
      const saysWhich = Boolean(
        i.referenced_booking &&
        (i.referenced_booking.kind !== "unspecified" ||
          i.referenced_booking.date ||
          i.referenced_booking.time),
      );
      const revisedBooking =
        revising && !saysWhich
          ? input.upcoming.find((b) => b.id === revising.bookingId)
          : undefined;
      const match: ReturnType<typeof resolveBookingReference> = revisedBooking
        ? { kind: "found", booking: revisedBooking }
        : resolveBookingReference(
            i.referenced_booking,
            input.upcoming,
            input.today,
            input.timeZone,
          );
      if (match.kind === "none") return ownerTask("no_booking_found");
      if (match.kind === "several") {
        return clarify("booking", i.intent, {
          bookings: match.bookings,
          noun: noun(match.bookings[0].serviceName),
        });
      }
      const booking = match.booking;
      const bookingDate = dateKeyOf(booking.startsAt, input.timeZone);
      const bookingTime = clockTimeOf(booking.startsAt, input.timeZone);
      const relative = ["later", "earlier"].includes(
        i.requested_time?.constraint ?? "",
      );

      let day = resolveDateReference(i.requested_date, input.today);
      if (
        !day &&
        revisedBooking &&
        revising?.preferredDate &&
        i.requested_time &&
        !relative &&
        !i.clarification_needed
      ) {
        // "Actually 6 would be better": 6 on the day they already asked
        // for. "Later" is still asked about: later that day, or another?
        day = { kind: "day", date: revising.preferredDate };
      }
      // "Earlier tomorrow", about tomorrow's booking: earlier that day.
      const namedDay = resolveDateReference(
        i.referenced_booking?.date ?? null,
        input.today,
      );
      if (
        !day &&
        relative &&
        namedDay?.kind === "day" &&
        namedDay.date === bookingDate
      ) {
        day = { kind: "day", date: bookingDate };
      }
      if (!day) {
        // "Can we do later?" could be later today or another day: ask. A
        // plain time with no day ("after 4 instead") means the same day.
        if (relative || !i.requested_time || i.clarification_needed) {
          return clarify(
            relative
              ? i.requested_time!.constraint === "earlier"
                ? "earlier"
                : "later"
              : "date",
            i.intent,
          );
        }
        day = { kind: "day", date: bookingDate };
      }
      if (day.kind !== "day") return clarify("date", i.intent);

      const window = resolveTimeWindow(i.requested_time, bookingTime);
      if (!window)
        return clarify("time", i.intent, { day: onDay(day.date, input.today) });
      const lengthMinutes = minutesBetween(booking.startsAt, booking.endsAt);
      const service: Service = {
        id: booking.serviceId,
        name: booking.serviceName,
        durationMinutes: lengthMinutes,
        bufferMinutes: booking.bufferMinutes,
      };
      // Never "move" a booking to where it already is.
      const proposal =
        slotsOn(input, day.date, service, window, booking.id).find(
          (slot) => slot.startsAt.getTime() !== booking.startsAt.getTime(),
        ) ?? null;
      const understood = {
        intent: "reschedule",
        preferred_date: day.date,
        earliest_time:
          i.requested_time?.constraint === "after"
            ? i.requested_time.time
            : relative && i.requested_time?.constraint === "later"
              ? bookingTime
              : null,
        time_constraint: i.requested_time?.constraint ?? null,
        time: i.requested_time?.time ?? null,
        booking_starts_at: booking.startsAt.toISOString(),
      };
      return approval(input, base, {
        kind: "reschedule_request",
        customerId: customer!.id,
        bookingId: booking.id,
        understood,
        proposal: proposal
          ? {
              startsAt: proposal.startsAt,
              endsAt: addMinutes(proposal.startsAt, lengthMinutes),
            }
          : null,
      });
    }

    case "cancellation_request": {
      const match = resolveBookingReference(
        i.referenced_booking ?? {
          kind: "unspecified",
          date: i.requested_date,
          time: null,
          service: null,
        },
        input.upcoming,
        input.today,
        input.timeZone,
        { preferSingleWhenUnspecified: true },
      );
      if (match.kind === "none") return ownerTask("no_booking_found");
      if (match.kind === "several") {
        return clarify("booking", i.intent, {
          bookings: match.bookings,
          noun: noun(match.bookings[0].serviceName),
        });
      }
      const decision = approval(input, base, {
        kind: "cancellation_request",
        customerId: customer!.id,
        bookingId: match.booking.id,
        understood: {
          intent: "cancellation",
          booking_starts_at: match.booking.startsAt.toISOString(),
          scope: i.cancellation_scope ?? "single",
        },
        proposal: null,
      });
      if (input.automation.cancellationAcknowledgements) {
        decision.reply = {
          kind: "cancellation_ack",
          body: cancellationAcknowledgement(),
        };
        decision.activity.push({
          kind: "reply_sent",
          actor: "pingflow",
          details: { reply_kind: "cancellation_ack", delivery: "simulated" },
          customerId: customer!.id,
          bookingId: match.booking.id,
          link: "reply",
        });
      }
      return decision;
    }

    case "simple_business_question": {
      // Only what Pingflow actually knows is drafted; nothing is sent.
      let draft: string | null = null;
      if (i.business_question_topic === "service_length") {
        const choice = chooseService(input, i.service_reference, {
          allowUsual: true,
        });
        if (choice.kind === "found") {
          draft = `A ${serviceNoun(choice.service.name)} is ${formatDuration(choice.service.durationMinutes)}.`;
        }
      }
      return ownerTask("business_question", "owner_reply_task", draft);
    }
  }

  return ownerTask("unsupported", "unsupported");
}

function nearestTo(
  slots: Interval[],
  window: SlotWindow,
  input: PolicyInput,
): Interval | undefined {
  const target = window.exact ?? window.from;
  if (!target || slots.length === 0) return slots[0];
  const [h, m] = target.split(":").map(Number);
  const targetMinutes = h * 60 + m;
  return [...slots].sort((a, b) => {
    const da = Math.abs(minutesOfClock(a, input) - targetMinutes);
    const db = Math.abs(minutesOfClock(b, input) - targetMinutes);
    return da - db;
  })[0];
}

function minutesOfClock(slot: Interval, input: PolicyInput) {
  const [h, m] = clockTimeOf(slot.startsAt, input.timeZone)
    .split(":")
    .map(Number);
  return h * 60 + m;
}

function approval(
  input: PolicyInput,
  base: Omit<Decision, "outcome" | "reason">,
  request: Approval,
): Decision {
  const customerId = request.customerId;
  const activity: ActivityDraft[] = [
    {
      kind: "request_understood",
      actor: "pingflow",
      details: request.understood,
      customerId,
      bookingId: request.bookingId,
      link: "approval",
    },
  ];
  if (request.proposal) {
    activity.push({
      kind: "time_proposed",
      actor: "pingflow",
      details: {
        starts_at: request.proposal.startsAt.toISOString(),
        ends_at: request.proposal.endsAt.toISOString(),
      },
      customerId,
      bookingId: request.bookingId,
      link: "approval",
    });
  }
  activity.push({
    kind: "approval_requested",
    actor: "pingflow",
    details: { request_kind: request.kind },
    customerId,
    bookingId: request.bookingId,
    link: "approval",
  });
  return {
    ...base,
    outcome: "create_approval",
    reason: request.kind,
    approval: request,
    activity,
    assessment: { ...base.assessment, confident: true },
  };
}
