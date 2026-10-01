import {
  checkSlot,
  freeIntervals,
  type Interval,
  type ScheduleContext,
  availableSlots,
  workingWindows,
} from "@/domain/availability/engine";
import { explainSlotProblem } from "@/domain/availability/explain";
import {
  resolveDateReference,
  resolveTimeWindow,
  TIME_BUCKETS,
} from "@/domain/messages/dates";
import type { DateReference } from "@/domain/messages/interpretation";
import { firstName } from "@/domain/messages/templates";
import type { OwnerCommand, OwnerIntent } from "@/domain/owner/command";
import {
  blockedReply,
  cancelledReply,
  countReply,
  customerBookingsReply,
  dayName,
  listTimes,
  onDay,
  ownerReplies,
  rescheduledReply,
  scheduleReply,
  when,
} from "@/domain/owner/replies";
import {
  type ReminderSettings,
  reminderSendAt,
} from "@/domain/reminders/policy";
import { formatDate, formatTime, formatTimeRange } from "@/domain/time/format";
import {
  addDays,
  addMinutes,
  type ClockTime,
  clockTimeOf,
  type DateKey,
  dateKeyOf,
  minutesBetween,
  minutesOfDay,
  zonedInstant,
} from "@/domain/time/zoned";

// What an owner's command does. Pure: the command as read, the business's
// real schedule and customers, and the rules; no database, no model. The
// model only supplied the words. Which customer, which booking, whether a
// time is free and whether anything changes are all decided here, and
// anything uncertain gets one question, never a guess.

export type OwnerCustomer = { id: string; fullName: string };

export type OwnerBooking = {
  id: string;
  customerId: string;
  customerName: string;
  serviceName: string;
  startsAt: Date;
  endsAt: Date;
  bufferMinutes: number;
};

export type OwnerBlock = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  label: string | null;
};

/** One open question to the owner, and what's already settled. */
export type OwnerPending = {
  kind: "owner";
  intent: OwnerIntent;
  topic: "person" | "booking" | "date" | "time" | "end" | "intent";
  question: string;
  messageId: string;
  turns: number;
  customerIds?: string[];
  bookingIds?: string[];
  date?: DateKey | null;
  time?: ClockTime | null;
};

export type OwnerMutation =
  | {
      kind: "reschedule";
      bookingId: string;
      expectedStartsAt: Date;
      startsAt: Date;
      reminderSendAt: Date | null;
    }
  | { kind: "cancel"; bookingId: string; expectedStartsAt: Date }
  | { kind: "block"; startsAt: Date; endsAt: Date; label: string | null };

export type OwnerDecision = {
  outcome: "answer" | "clarify" | "change" | "refuse" | "no_action";
  /** Machine-readable, for logs and the developer view. */
  reason: string;
  reply: string | null;
  /** Said instead of `reply` if the change can't be made when it's applied. */
  conflictReply: string | null;
  mutation: OwnerMutation | null;
  clarification: { set: OwnerPending } | { clear: true } | null;
};

export type OwnerInput = {
  messageId: string;
  now: Date;
  today: DateKey;
  timeZone: string;
  /** Null when the message couldn't be read. */
  command: OwnerCommand | null;
  pending: OwnerPending | null;
  customers: OwnerCustomer[];
  /** Confirmed bookings from the start of today onwards. */
  bookings: OwnerBooking[];
  blocks: OwnerBlock[];
  /** The engine's view of the schedule, covering the days involved. */
  schedule: ScheduleContext;
  reminders: ReminderSettings;
};

/** Free windows shorter than this aren't worth mentioning. */
const MIN_FREE_MINUTES = 30;
/** Bookings this close to the next one count as "which one?". */
const SAME_WEEK_DAYS = 6;

function normalise(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Customers a name could mean: an exact full name wins; otherwise every
 * word must match one of their names ("Sarah", "khan", "sarah k" doesn't).
 */
export function matchCustomers(
  customers: OwnerCustomer[],
  name: string,
): OwnerCustomer[] {
  const n = normalise(name);
  if (!n) return [];
  const exact = customers.filter((c) => normalise(c.fullName) === n);
  if (exact.length) return exact;
  const words = n.split(" ");
  return customers.filter((c) => {
    const parts = normalise(c.fullName).split(" ");
    return words.every((w) => parts.includes(w));
  });
}

function names(customers: OwnerCustomer[]) {
  const all = customers.map((c) => c.fullName);
  return all.length <= 1
    ? all.join("")
    : `${all.slice(0, -1).join(", ")} and ${all.at(-1)}`;
}

export function decideOwnerCommand(input: OwnerInput): OwnerDecision {
  const tz = input.timeZone;
  const c = input.command;
  const clearPending = input.pending ? ({ clear: true } as const) : null;

  const base = {
    reply: null,
    conflictReply: null,
    mutation: null,
    clarification: clearPending,
  } satisfies Partial<OwnerDecision>;
  const answer = (reason: string, reply: string): OwnerDecision => ({
    ...base,
    outcome: "answer",
    reason,
    reply,
  });
  const refuse = (reason: string, reply: string): OwnerDecision => ({
    ...base,
    outcome: "refuse",
    reason,
    reply,
  });

  if (!c) return refuse("interpreter_failed", ownerReplies.failed);

  // A reply to Pingflow's question carries on the same command, unless
  // the owner has plainly moved on to another one.
  const continuing =
    input.pending !== null &&
    (c.intent === input.pending.intent ||
      c.intent === "owner_unclear" ||
      input.pending.intent === "owner_unclear");
  const pending = continuing ? input.pending : null;
  const intent: OwnerIntent =
    pending && pending.intent !== "owner_unclear" ? pending.intent : c.intent;

  // One question at most. Asked again, it goes back to the owner.
  const clarify = (
    topic: OwnerPending["topic"],
    question: string,
    settled: Partial<OwnerPending> = {},
  ): OwnerDecision => {
    if (pending) {
      return refuse(
        `still_unclear_${topic}`,
        topic === "booking"
          ? ownerReplies.exhaustedBooking
          : ownerReplies.exhausted,
      );
    }
    return {
      ...base,
      outcome: "clarify",
      reason: `missing_${topic}`,
      reply: question,
      clarification: {
        set: {
          kind: "owner",
          intent,
          topic,
          question,
          messageId: input.messageId,
          turns: 1,
          ...settled,
        },
      },
    };
  };

  if (intent === "owner_acknowledgement") {
    return { ...base, outcome: "no_action", reason: "acknowledgement" };
  }
  if (intent === "owner_unsupported") {
    return refuse("unsupported", ownerReplies.unsupported);
  }
  if (intent === "owner_unclear") {
    return clarify("intent", ownerReplies.unclear);
  }

  // --- Shared resolution ----------------------------------------------------

  const resolveDay = (ref: DateReference) =>
    resolveDateReference(ref, input.today);
  const targetDay = (): DateKey | null => {
    const day = resolveDay(c.date);
    if (day?.kind === "day") return day.date;
    return pending?.date ?? null;
  };

  const bookingsFor = (customerId: string) =>
    input.bookings
      .filter((b) => b.customerId === customerId && b.startsAt > input.now)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  type Resolved<T> = { ok: T } | { decision: OwnerDecision };

  const resolveCustomer = (): Resolved<OwnerCustomer> => {
    const candidates = pending?.customerIds
      ? input.customers.filter((x) => pending.customerIds!.includes(x.id))
      : input.customers;
    if (pending?.customerIds?.length === 1 && candidates.length === 1) {
      return { ok: candidates[0] };
    }
    if (!c.person) {
      return { decision: clarify("person", ownerReplies.whose) };
    }
    const found = matchCustomers(candidates, c.person);
    if (found.length === 1) return { ok: found[0] };
    if (found.length === 0) {
      return {
        decision: refuse(
          "customer_not_found",
          `I can’t find a customer called ${c.person}.`,
        ),
      };
    }
    return {
      decision: clarify(
        "person",
        `I found ${found.length} customers called ${c.person}: ${names(found.slice(0, 3))}. Which one?`,
        { customerIds: found.map((f) => f.id), date: targetDay() },
      ),
    };
  };

  /** The booking to move or cancel: one plausible booking, or a question. */
  const resolveBooking = (
    customer: OwnerCustomer,
    verb: "move" | "cancel",
  ): Resolved<OwnerBooking> => {
    let upcoming = bookingsFor(customer.id);
    if (pending?.bookingIds) {
      upcoming = upcoming.filter((b) => pending.bookingIds!.includes(b.id));
      if (pending.bookingIds.length === 1 && upcoming.length === 1) {
        return { ok: upcoming[0] };
      }
    }
    if (upcoming.length === 0) {
      return {
        decision: refuse(
          "no_booking",
          `${customer.fullName} has nothing booked to ${verb}.`,
        ),
      };
    }
    // When the owner says which: "Sarah's Tuesday lesson", or (answering
    // "which one?") just "the Tuesday one".
    const said =
      c.booking_date ?? (pending?.topic === "booking" ? c.date : null) ?? null;
    const saidDay = resolveDay(said);
    let matches = upcoming;
    if (saidDay?.kind === "day") {
      matches = matches.filter(
        (b) => dateKeyOf(b.startsAt, tz) === saidDay.date,
      );
    }
    if (c.booking_time) {
      matches = matches.filter(
        (b) => clockTimeOf(b.startsAt, tz) === c.booking_time,
      );
    }
    if (saidDay || c.booking_time) {
      if (matches.length === 1) return { ok: matches[0] };
      if (matches.length === 0) {
        return {
          decision: refuse(
            "booking_not_found",
            `${customer.fullName} has no booking then.`,
          ),
        };
      }
    } else {
      // Nothing said: the next booking, unless another is close behind it.
      const first = upcoming[0];
      const horizon = addDays(dateKeyOf(first.startsAt, tz), SAME_WEEK_DAYS);
      matches = upcoming.filter((b) => dateKeyOf(b.startsAt, tz) <= horizon);
      if (matches.length === 1) return { ok: first };
    }
    const options = matches
      .slice(0, 3)
      .map((b) => when(b.startsAt, tz, input.today));
    return {
      decision: clarify(
        "booking",
        `Which of ${customer.fullName}’s bookings: ${listTimes(options)}?`,
        {
          customerIds: [customer.id],
          bookingIds: matches.map((b) => b.id),
          date: targetDay(),
        },
      ),
    };
  };

  const period = (from: DateKey, days: number, ref: DateReference) =>
    days > 1
      ? ref?.kind === "next_week"
        ? "next week"
        : "this week"
      : dayName(from, input.today);

  // --- Read-only ---------------------------------------------------------

  switch (intent) {
    case "owner_schedule_query":
    case "owner_booking_count_query": {
      const day = resolveDay(c.date) ?? { kind: "day", date: input.today };
      const from = day.kind === "day" ? day.date : day.from;
      const days = day.kind === "day" ? 1 : day.days;
      const last = addDays(from, days);
      const inRange = (d: Date) => {
        const k = dateKeyOf(d, tz);
        return k >= from && k < last;
      };
      const bookings = input.bookings.filter((b) => inRange(b.startsAt));
      if (intent === "owner_booking_count_query") {
        return answer(
          "count",
          countReply({
            count: bookings.length,
            minutes: bookings.reduce(
              (m, b) => m + minutesBetween(b.startsAt, b.endsAt),
              0,
            ),
            period: period(from, days, c.date),
          }),
        );
      }
      return answer(
        "schedule",
        scheduleReply({
          from,
          days,
          bookings,
          blocks: input.blocks.filter((b) => inRange(b.startsAt)),
          timeZone: tz,
          today: input.today,
          rangeName: period(from, days, c.date),
        }),
      );
    }

    case "owner_customer_booking_query": {
      const customer = resolveCustomer();
      if ("decision" in customer) return customer.decision;
      return answer(
        "customer_bookings",
        customerBookingsReply({
          customerName: customer.ok.fullName,
          bookings: bookingsFor(customer.ok.id),
          timeZone: tz,
          today: input.today,
        }),
      );
    }

    case "owner_availability_query":
      return availability(input, c, clarify, answer);

    case "owner_reschedule_booking": {
      const customer = resolveCustomer();
      if ("decision" in customer) return customer.decision;
      const booking = resolveBooking(customer.ok, "move");
      if ("decision" in booking) return booking.decision;
      const b = booking.ok;
      const noun = b.serviceName.toLowerCase();
      const settled = {
        customerIds: [customer.ok.id],
        bookingIds: [b.id],
      };

      const date = targetDay();
      if (!date) {
        return clarify(
          "date",
          `Which day should ${customer.ok.fullName}’s ${noun} move to?`,
          settled,
        );
      }
      const length = minutesBetween(b.startsAt, b.endsAt);
      const request = {
        durationMinutes: length,
        bufferMinutes: b.bufferMinutes,
        ignoreBookingId: b.id,
      };
      const free = availableSlots(input.schedule, date, request, {
        now: input.now,
      });
      // Up to three real times, nearest the one asked for, a lesson apart.
      const suggest = (near?: ClockTime) => {
        const target = near ? minutesOfDay(near) : 0;
        const gap = Math.max(60, length);
        const picked: number[] = [];
        for (const minutes of free
          .map((s) => minutesOfDay(clockTimeOf(s.startsAt, tz)))
          .sort(
            (x, y) => Math.abs(x - target) - Math.abs(y - target) || x - y,
          )) {
          if (picked.every((p) => Math.abs(p - minutes) >= gap))
            picked.push(minutes);
          if (picked.length === 3) break;
        }
        return picked
          .sort((x, y) => x - y)
          .map(
            (m) =>
              `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
          );
      };
      const freeText = (near?: ClockTime) => {
        const times = suggest(near);
        return times.length
          ? `You’re free at ${listTimes(times)}.`
          : `Nothing is free ${onDay(date, input.today)}.`;
      };

      const time: ClockTime | null =
        c.time?.constraint === "exact"
          ? c.time.time
          : c.time?.constraint === "same_time"
            ? clockTimeOf(b.startsAt, tz)
            : null;
      if (!time) {
        return clarify(
          "time",
          `What time ${onDay(date, input.today)}? ${freeText()}`,
          { ...settled, date },
        );
      }

      const startsAt = zonedInstant(date, time, tz);
      if (startsAt.getTime() === b.startsAt.getTime()) {
        return refuse(
          "already_then",
          `${customer.ok.fullName}’s ${noun} is already ${when(startsAt, tz, input.today)}.`,
        );
      }
      const check = checkSlot(input.schedule, startsAt, request, {
        now: input.now,
      });
      if (!check.ok) {
        return clarify(
          "time",
          `${capitalise(when(startsAt, tz, input.today))} isn’t available. ${explainSlotProblem(check.problem)} ${freeText(time)}`,
          { ...settled, date },
        );
      }
      return {
        ...base,
        outcome: "change",
        reason: "reschedule",
        mutation: {
          kind: "reschedule",
          bookingId: b.id,
          expectedStartsAt: b.startsAt,
          startsAt,
          reminderSendAt: reminderSendAt(startsAt, input.reminders, input.now),
        },
        reply: rescheduledReply({
          customerName: b.customerName,
          serviceName: b.serviceName,
          startsAt,
          timeZone: tz,
          today: input.today,
        }),
        conflictReply: `${capitalise(when(startsAt, tz, input.today))} isn’t free any more, or ${firstName(b.customerName)}’s ${noun} has changed. Nothing was changed.`,
        clarification: clearPending,
      };
    }

    case "owner_cancel_booking": {
      const customer = resolveCustomer();
      if ("decision" in customer) return customer.decision;
      const booking = resolveBooking(customer.ok, "cancel");
      if ("decision" in booking) return booking.decision;
      const b = booking.ok;
      return {
        ...base,
        outcome: "change",
        reason: "cancel",
        mutation: {
          kind: "cancel",
          bookingId: b.id,
          expectedStartsAt: b.startsAt,
        },
        reply: cancelledReply({
          customerName: b.customerName,
          serviceName: b.serviceName,
          startsAt: b.startsAt,
          timeZone: tz,
          today: input.today,
        }),
        conflictReply: `${possessive(b.customerName)} ${b.serviceName.toLowerCase()} has changed since you asked. Nothing was changed.`,
        clarification: clearPending,
      };
    }

    case "owner_block_time":
      return block(input, c, pending, clarify, refuse, targetDay(), base);
  }

  return refuse("unsupported", ownerReplies.unsupported);
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const possessive = (name: string) =>
  name.endsWith("s") ? `${name}’` : `${name}’s`;

/** The day's working span: the first window's start to the last one's end. */
function workingSpan(
  schedule: ScheduleContext,
  date: DateKey,
): Interval | null {
  const windows = workingWindows(schedule, date);
  if (!windows.length) return null;
  return { startsAt: windows[0].startsAt, endsAt: windows.at(-1)!.endsAt };
}

function periodName(date: DateKey, today: DateKey, c: OwnerCommand) {
  const day = dayName(date, today);
  switch (c.time?.constraint) {
    case "morning":
    case "afternoon":
    case "evening":
      return day === "today"
        ? `this ${c.time.constraint}`
        : `${day} ${c.time.constraint}`;
    case "after":
      return `${day} after ${c.time.time}`;
    case "before":
      return `${day} before ${c.time.time}`;
    case "around":
      return `${day} around ${c.time.time}`;
    default:
      return day;
  }
}

function availability(
  input: OwnerInput,
  c: OwnerCommand,
  clarify: (topic: OwnerPending["topic"], q: string) => OwnerDecision,
  answer: (reason: string, reply: string) => OwnerDecision,
): OwnerDecision {
  const tz = input.timeZone;
  const today = input.today;
  const day = resolveDateReference(c.date, today);
  if (day?.kind === "range") return clarify("date", ownerReplies.whichDay);

  // A time with no day: the next time it comes round.
  let date = day?.date ?? today;
  if (!day && c.time?.constraint === "exact" && c.time.time) {
    if (zonedInstant(today, c.time.time, tz) <= input.now) {
      date = addDays(today, 1);
    }
  }
  const schedule = input.schedule;
  const span = workingSpan(schedule, date);
  const dayWord = dayName(date, today);

  if (c.time?.constraint === "exact" && c.time.time) {
    const at = zonedInstant(date, c.time.time, tz);
    const label = `${c.time.time} ${dayWord === "today" || dayWord === "tomorrow" ? dayWord : `on ${dayWord}`}`;
    if (at <= input.now)
      return answer("slot_past", `${capitalise(label)} has already passed.`);
    if (!span) {
      return answer(
        "slot_closed",
        `No — you don’t work ${onDay(date, today)}.`,
      );
    }
    const windows = workingWindows(schedule, date);
    if (!windows.some((w) => w.startsAt <= at && at < w.endsAt)) {
      return answer(
        "slot_outside_hours",
        `No — ${label} is outside your working hours (${windows.map((w) => formatTimeRange(w.startsAt, w.endsAt, tz)).join(", ")}).`,
      );
    }
    const name = (id: string) =>
      input.bookings.find((b) => b.id === id)?.customerName ?? "Someone";
    const booked = schedule.bookings.find(
      (b) => b.startsAt <= at && at < b.endsAt,
    );
    if (booked) {
      return answer(
        "slot_booked",
        `No — ${name(booked.id)} is booked ${formatTimeRange(booked.startsAt, booked.endsAt, tz)} ${dayWord === "today" || dayWord === "tomorrow" ? dayWord : `on ${dayWord}`}.`,
      );
    }
    const blocked = schedule.blocks.find(
      (b) => b.startsAt <= at && at < b.endsAt,
    );
    if (blocked) {
      return answer(
        "slot_blocked",
        `No — ${formatTimeRange(blocked.startsAt, blocked.endsAt, tz)} ${dayWord === "today" || dayWord === "tomorrow" ? dayWord : `on ${dayWord}`} is blocked.`,
      );
    }
    const travel = schedule.bookings.find(
      (b) => b.endsAt <= at && at < addMinutes(b.endsAt, b.bufferMinutes),
    );
    if (travel) {
      return answer(
        "slot_travel",
        `No — that’s travel time after ${possessive(name(travel.id))} booking, until ${formatTime(addMinutes(travel.endsAt, travel.bufferMinutes), tz)}.`,
      );
    }
    const free = freeIntervals(schedule, date).find(
      (f) => f.startsAt <= at && at < f.endsAt,
    );
    return answer(
      "slot_free",
      `Yes — ${label} is free${free ? `, until ${formatTime(free.endsAt, tz)}` : ""}.`,
    );
  }

  if (!span)
    return answer("day_closed", `You don’t work ${onDay(date, today)}.`);

  // A part of the day, or after/before a time, or the whole day.
  const window = resolveTimeWindow(c.time ?? null) ?? {};
  const from = window.from
    ? zonedInstant(date, window.from, tz)
    : span.startsAt;
  const until = window.until
    ? zonedInstant(date, window.until, tz)
    : span.endsAt;
  const start = from > input.now ? from : input.now;
  const free = freeIntervals(schedule, date)
    .map((f) => ({
      startsAt: f.startsAt > start ? f.startsAt : start,
      endsAt: f.endsAt < until ? f.endsAt : until,
    }))
    .filter((f) => minutesBetween(f.startsAt, f.endsAt) >= MIN_FREE_MINUTES);
  const name = periodName(date, today, c);
  if (free.length === 0) {
    return answer(
      "window_full",
      `You’re fully booked ${name === "today" || name === "tomorrow" ? name : name.startsWith("this ") ? name : `on ${name}`}.`,
    );
  }
  const ranges = free
    .slice(0, 4)
    .map((f) => formatTimeRange(f.startsAt, f.endsAt, tz));
  return answer(
    "window_free",
    `${capitalise(name)} you’re free ${listAnd(ranges)}.`,
  );
}

function listAnd(items: string[]) {
  return items.length <= 1
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function block(
  input: OwnerInput,
  c: OwnerCommand,
  pending: OwnerPending | null,
  clarify: (
    topic: OwnerPending["topic"],
    q: string,
    settled?: Partial<OwnerPending>,
  ) => OwnerDecision,
  refuse: (reason: string, reply: string) => OwnerDecision,
  date: DateKey | null,
  base: Omit<OwnerDecision, "outcome" | "reason">,
): OwnerDecision {
  const tz = input.timeZone;
  if (!date) return clarify("date", "Which day should I block?");
  const span = workingSpan(input.schedule, date);
  const dayWord = dayName(date, input.today);
  if (!span) {
    return refuse(
      "day_closed",
      `You don’t work ${onDay(date, input.today)}, so there’s nothing to block.`,
    );
  }

  // The range: a part of the day, start and end, start and length, after
  // or before a time, or the whole working day.
  let startsAt: Date | null = null;
  let endsAt: Date | null = null;
  const t = c.time;
  const start = pending?.time ?? (t?.constraint === "exact" ? t.time : null);
  if (
    t &&
    (t.constraint === "morning" ||
      t.constraint === "afternoon" ||
      t.constraint === "evening")
  ) {
    const bucket = TIME_BUCKETS[t.constraint];
    startsAt = zonedInstant(date, bucket.start, tz);
    endsAt = zonedInstant(date, bucket.end, tz);
  } else if (start) {
    const end =
      c.end_time ??
      (pending?.topic === "end" && t?.constraint === "exact" ? t.time : null);
    startsAt = zonedInstant(date, start, tz);
    if (end) endsAt = zonedInstant(date, end, tz);
    else if (c.duration_minutes)
      endsAt = addMinutes(startsAt, c.duration_minutes);
    else return clarify("end", ownerReplies.untilWhen, { date, time: start });
  } else if (t?.constraint === "after" && t.time) {
    startsAt = zonedInstant(date, t.time, tz);
    endsAt = span.endsAt;
  } else if (t?.constraint === "before" && t.time) {
    startsAt = span.startsAt;
    endsAt = zonedInstant(date, t.time, tz);
  } else if (!t || t.constraint === "anytime") {
    startsAt = span.startsAt;
    endsAt = span.endsAt;
  } else {
    return clarify("end", "Which times should I block?", { date });
  }

  // Only working time is worth blocking.
  if (startsAt < span.startsAt) startsAt = span.startsAt;
  if (endsAt > span.endsAt) endsAt = span.endsAt;
  if (endsAt <= startsAt) {
    return refuse(
      "outside_hours",
      `That’s outside your working hours ${onDay(date, input.today)}, so there’s nothing to block.`,
    );
  }
  if (endsAt <= input.now) {
    return refuse("in_past", "That time has already passed.");
  }
  if (startsAt < input.now) {
    // Round the start up to the next five minutes.
    const five = 5 * 60 * 1000;
    startsAt = new Date(Math.ceil(input.now.getTime() / five) * five);
  }

  const range = `${dayWord} ${formatTimeRange(startsAt, endsAt, tz)}`;
  const clashes = input.bookings.filter(
    (b) => b.startsAt < endsAt! && startsAt! < b.endsAt,
  );
  if (clashes.length) {
    const who = clashes
      .slice(0, 2)
      .map(
        (b) => `${b.customerName} is booked at ${formatTime(b.startsAt, tz)}`,
      );
    return refuse(
      "block_overlaps_booking",
      `I can’t block ${range}: ${listAnd(who)}${clashes.length > 2 ? `, and ${clashes.length - 2} more` : ""}. Nothing was changed.`,
    );
  }
  return {
    ...base,
    outcome: "change",
    reason: "block",
    mutation: { kind: "block", startsAt, endsAt, label: null },
    reply: blockedReply({ startsAt, endsAt, timeZone: tz, today: input.today }),
    conflictReply: `Something was booked ${formatDate(date, "long") === dayWord ? `on ${dayWord}` : dayWord} in that time just now. Nothing was changed.`,
    clarification: pending ? { clear: true } : base.clarification,
  };
}
