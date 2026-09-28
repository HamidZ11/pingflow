import {
  addDays,
  addMinutes,
  type ClockTime,
  type DateKey,
  dateKeyOf,
  isoWeekday,
  type Weekday,
  zonedInstant,
} from "@/domain/time/zoned";

// The availability engine: which times can take a booking.
//
//   availability = bookable time − bookings (and the buffer after each)
//                  − blocked time
//
// Bookable time depends on the business's schedule mode:
// - regular:  its weekly working hours.
// - flexible: every day, within FLEXIBLE_BOOKABLE_DAY. The weekly hours
//             (which are kept, in case the owner switches back) don't apply.
//
// It is deterministic and has no I/O: callers load the schedule, pass it in
// and get plain answers back. The Schedule, "Choose another time" and (later)
// WhatsApp replies all ask the same engine, so they can never disagree.
//
// Rules
// - A booking occupies [start, end + its buffer). The buffer is the time
//   the owner needs after an appointment (travel, setting up) before the
//   next can start.
// - A new slot [start, start + duration) must sit inside one bookable
//   window, must not overlap blocked time, and together with its own
//   buffer must not overlap anything another booking occupies.
// - The buffer after the day's last appointment may run past closing time:
//   it is travel, not work.
// - Slots start on a grid (every 30 minutes by default) from the start of
//   each working window.

export type WorkingHoursRule = {
  weekday: Weekday;
  start: ClockTime;
  end: ClockTime;
};

export type BusyBooking = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  bufferMinutes: number;
};

export type BlockedTime = {
  id: string;
  startsAt: Date;
  endsAt: Date;
};

export type ScheduleMode = "regular" | "flexible";

/**
 * The part of each day a flexible-hours business can be booked, in its
 * local time. A safety boundary so "any free time" never means 03:00; it is
 * not a working-hours rule the owner sets. Change it here and every caller
 * (engine, schedule, availability pickers) follows.
 */
export const FLEXIBLE_BOOKABLE_DAY = { start: "06:00", end: "22:00" } as const;

export type ScheduleContext = {
  timeZone: string;
  mode: ScheduleMode;
  /** Used in regular mode only. */
  workingHours: WorkingHoursRule[];
  /** Confirmed bookings only. */
  bookings: BusyBooking[];
  blocks: BlockedTime[];
};

export type SlotRequest = {
  durationMinutes: number;
  bufferMinutes: number;
  /** The booking being moved: it doesn't get in its own way. */
  ignoreBookingId?: string;
};

export type Interval = { startsAt: Date; endsAt: Date };

export type SlotProblem =
  | { kind: "in_past" }
  | { kind: "outside_hours" }
  | { kind: "overlaps_booking"; bookingId: string }
  | { kind: "blocked"; blockId: string }
  | { kind: "inside_buffer"; bookingId: string };

export type SlotCheck = { ok: true } | { ok: false; problem: SlotProblem };

export const DEFAULT_STEP_MINUTES = 30;

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * The bookable windows on a calendar date, as instants, earliest first:
 * the day's working hours (regular), or the flexible bookable day.
 */
export function workingWindows(
  ctx: ScheduleContext,
  date: DateKey,
): Interval[] {
  if (ctx.mode === "flexible") {
    return [
      {
        startsAt: zonedInstant(date, FLEXIBLE_BOOKABLE_DAY.start, ctx.timeZone),
        endsAt: zonedInstant(date, FLEXIBLE_BOOKABLE_DAY.end, ctx.timeZone),
      },
    ];
  }
  const weekday = isoWeekday(date);
  return ctx.workingHours
    .filter((rule) => rule.weekday === weekday)
    .map((rule) => ({
      startsAt: zonedInstant(date, rule.start, ctx.timeZone),
      endsAt: zonedInstant(date, rule.end, ctx.timeZone),
    }))
    .filter((w) => w.endsAt > w.startsAt)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** Whether a booking could start at `startsAt`, and if not, why. */
export function checkSlot(
  ctx: ScheduleContext,
  startsAt: Date,
  request: SlotRequest,
  options: { now?: Date } = {},
): SlotCheck {
  const endsAt = addMinutes(startsAt, request.durationMinutes);
  const occupiedUntil = addMinutes(endsAt, request.bufferMinutes);

  if (options.now && startsAt < options.now) {
    return { ok: false, problem: { kind: "in_past" } };
  }

  const date = dateKeyOf(startsAt, ctx.timeZone);
  const insideHours = workingWindows(ctx, date).some(
    (w) => w.startsAt <= startsAt && endsAt <= w.endsAt,
  );
  if (!insideHours) {
    return { ok: false, problem: { kind: "outside_hours" } };
  }

  const others = ctx.bookings.filter((b) => b.id !== request.ignoreBookingId);

  const clash = others.find((b) =>
    overlaps(startsAt, endsAt, b.startsAt, b.endsAt),
  );
  if (clash) {
    return {
      ok: false,
      problem: { kind: "overlaps_booking", bookingId: clash.id },
    };
  }

  const block = ctx.blocks.find((b) =>
    overlaps(startsAt, endsAt, b.startsAt, b.endsAt),
  );
  if (block) {
    return { ok: false, problem: { kind: "blocked", blockId: block.id } };
  }

  const tooClose = others.find((b) =>
    overlaps(
      startsAt,
      occupiedUntil,
      b.startsAt,
      addMinutes(b.endsAt, b.bufferMinutes),
    ),
  );
  if (tooClose) {
    return {
      ok: false,
      problem: { kind: "inside_buffer", bookingId: tooClose.id },
    };
  }

  return { ok: true };
}

export type SlotSearch = {
  /** Slots starting before this instant are left out. */
  now?: Date;
  /** Only slots starting at or after this time of day. */
  notBefore?: ClockTime;
  stepMinutes?: number;
};

/** Every time a booking could start on a calendar date. */
export function availableSlots(
  ctx: ScheduleContext,
  date: DateKey,
  request: SlotRequest,
  search: SlotSearch = {},
): Interval[] {
  const step = search.stepMinutes ?? DEFAULT_STEP_MINUTES;
  const notBefore = search.notBefore
    ? zonedInstant(date, search.notBefore, ctx.timeZone)
    : undefined;
  const slots: Interval[] = [];

  for (const window of workingWindows(ctx, date)) {
    for (
      let start = window.startsAt;
      addMinutes(start, request.durationMinutes) <= window.endsAt;
      start = addMinutes(start, step)
    ) {
      if (notBefore && start < notBefore) continue;
      if (checkSlot(ctx, start, request, { now: search.now }).ok) {
        slots.push({
          startsAt: start,
          endsAt: addMinutes(start, request.durationMinutes),
        });
      }
    }
  }
  return slots;
}

export type DayAvailability = { date: DateKey; slots: Interval[] };

/** Available slots for `days` consecutive dates starting at `from`. */
export function availableDays(
  ctx: ScheduleContext,
  from: DateKey,
  days: number,
  request: SlotRequest,
  search: Omit<SlotSearch, "notBefore"> = {},
): DayAvailability[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    return { date, slots: availableSlots(ctx, date, request, search) };
  });
}

/** The first slot at or after `notBefore` on `date`, if there is one. */
export function firstAvailableSlot(
  ctx: ScheduleContext,
  date: DateKey,
  request: SlotRequest,
  search: SlotSearch = {},
): Interval | undefined {
  return availableSlots(ctx, date, request, search)[0];
}

/**
 * The working time on a date that nothing occupies: working windows minus
 * bookings (with their buffers) and blocked time. Used to show free time in
 * the schedule; whether a particular service fits is `availableSlots`.
 */
export function freeIntervals(ctx: ScheduleContext, date: DateKey): Interval[] {
  const busy = [
    ...ctx.bookings.map((b) => ({
      startsAt: b.startsAt,
      endsAt: addMinutes(b.endsAt, b.bufferMinutes),
    })),
    ...ctx.blocks,
  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const free: Interval[] = [];
  for (const window of workingWindows(ctx, date)) {
    let cursor = window.startsAt;
    for (const b of busy) {
      if (b.endsAt <= cursor || b.startsAt >= window.endsAt) continue;
      if (b.startsAt > cursor) {
        free.push({ startsAt: cursor, endsAt: b.startsAt });
      }
      if (b.endsAt > cursor) cursor = b.endsAt;
      if (cursor >= window.endsAt) break;
    }
    if (cursor < window.endsAt) {
      free.push({ startsAt: cursor, endsAt: window.endsAt });
    }
  }
  return free;
}
