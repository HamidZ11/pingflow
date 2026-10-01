import type {
  DateReference,
  TimeReference,
  WeekdayName,
} from "@/domain/messages/interpretation";
import {
  addDays,
  type ClockTime,
  clockTimeFromMinutes,
  type DateKey,
  isDateKey,
  isoWeekday,
  minutesOfDay,
  startOfWeek,
} from "@/domain/time/zoned";

// Turning what a customer said ("next Friday", "after 4", "afternoon") into
// actual dates and times. The interpreter only reports what was said; the
// rules for what it means live here, so they are the same every time and
// can be tested. Everything is relative to when the message arrived, in the
// business's time zone.

/**
 * What "morning", "afternoon" and "evening" mean when a customer asks for
 * times. A slot belongs to the part of the day it starts in. The business's
 * own bookable hours still apply on top (a regular business that stops at
 * 17:00 has no evening; a flexible one stops at 22:00).
 */
export const TIME_BUCKETS = {
  morning: { start: "06:00", end: "12:00" },
  afternoon: { start: "12:00", end: "17:00" },
  evening: { start: "17:00", end: "22:00" },
} as const;

const weekdayNumbers: Record<WeekdayName, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

export type ResolvedDay =
  | { kind: "day"; date: DateKey }
  | { kind: "range"; from: DateKey; days: number };

/**
 * The day (or run of days) a date reference points to.
 *
 * - "Friday": the next Friday after today (on a Friday, that's next week's;
 *   today is "today").
 * - "this Friday": this week's Friday (Monday to Sunday), or next week's if
 *   this week's has passed.
 * - "next Friday": the Friday of next week. (People differ on this; the
 *   rule is fixed so the answer is predictable.)
 * - A calendar date without a year: the next time that date comes round.
 * - "this week" / "next week": a range of days.
 */
export function resolveDateReference(
  ref: DateReference,
  today: DateKey,
): ResolvedDay | null {
  if (!ref) return null;
  switch (ref.kind) {
    case "today":
    case "later_today":
      return { kind: "day", date: today };
    case "tomorrow":
      return { kind: "day", date: addDays(today, 1) };
    case "day_after_tomorrow":
      return { kind: "day", date: addDays(today, 2) };
    case "weekday": {
      if (!ref.weekday) return null;
      const target = weekdayNumbers[ref.weekday];
      const current = isoWeekday(today);
      if (ref.week === "this") {
        const thisWeek = addDays(startOfWeek(today), target - 1);
        return {
          kind: "day",
          date: thisWeek >= today ? thisWeek : addDays(thisWeek, 7),
        };
      }
      if (ref.week === "next") {
        return {
          kind: "day",
          date: addDays(startOfWeek(today), 7 + target - 1),
        };
      }
      const ahead = (target - current + 7) % 7 || 7;
      return { kind: "day", date: addDays(today, ahead) };
    }
    case "calendar_date": {
      if (!ref.day) return null;
      const year = Number(today.slice(0, 4));
      const key = (y: number, m: number) =>
        `${y}-${String(m).padStart(2, "0")}-${String(ref.day).padStart(2, "0")}`;
      if (ref.month) {
        for (const y of [year, year + 1]) {
          const date = key(y, ref.month);
          if (isDateKey(date) && date >= today) return { kind: "day", date };
        }
        return null;
      }
      // "The 6th": the next 6th from today, this month or the next one
      // that has that day.
      const month = Number(today.slice(5, 7));
      for (let i = 0; i < 3; i++) {
        const m = ((month - 1 + i) % 12) + 1;
        const date = key(year + Math.floor((month - 1 + i) / 12), m);
        if (isDateKey(date) && date >= today) return { kind: "day", date };
      }
      return null;
    }
    case "this_week": {
      const sunday = addDays(startOfWeek(today), 6);
      return {
        kind: "range",
        from: today,
        days: Math.round(
          (Date.parse(sunday) - Date.parse(today)) / 86_400_000 + 1,
        ),
      };
    }
    case "next_week":
      return { kind: "range", from: addDays(startOfWeek(today), 7), days: 7 };
  }
}

/**
 * Which start times a customer's time words allow. `from` is inclusive,
 * `until` exclusive; `exact` pins one time. An empty window allows any time.
 */
export type SlotWindow = {
  from?: ClockTime;
  until?: ClockTime;
  exact?: ClockTime;
};

const AROUND_MINUTES = 60;

function shift(time: ClockTime, minutes: number): ClockTime {
  return clockTimeFromMinutes(
    Math.min(24 * 60 - 1, Math.max(0, minutesOfDay(time) + minutes)),
  );
}

/**
 * The window for a time reference. "Same time", "later" and "earlier" are
 * relative to the booking being moved, so they need its start time; without
 * one they can't be resolved (null).
 */
export function resolveTimeWindow(
  ref: TimeReference,
  bookingTime?: ClockTime,
): SlotWindow | null {
  if (!ref) return {};
  switch (ref.constraint) {
    case "anytime":
      return {};
    case "exact":
      return ref.time ? { exact: ref.time } : null;
    case "around":
      return ref.time
        ? {
            from: shift(ref.time, -AROUND_MINUTES),
            until: shift(ref.time, AROUND_MINUTES + 1),
          }
        : null;
    case "before":
      return ref.time ? { until: ref.time } : null;
    case "after":
      return ref.time ? { from: ref.time } : null;
    case "morning":
    case "afternoon":
    case "evening":
      return {
        from: TIME_BUCKETS[ref.constraint].start,
        until: TIME_BUCKETS[ref.constraint].end,
      };
    case "same_time":
      return bookingTime ? { exact: bookingTime } : null;
    case "later":
      return bookingTime ? { from: shift(bookingTime, 1) } : null;
    case "earlier":
      return bookingTime ? { until: bookingTime } : null;
  }
}

/** Whether a slot starting at `time` fits the window. */
export function inWindow(time: ClockTime, window: SlotWindow): boolean {
  const t = minutesOfDay(time);
  if (window.exact) return t === minutesOfDay(window.exact);
  if (window.from && t < minutesOfDay(window.from)) return false;
  if (window.until && t >= minutesOfDay(window.until)) return false;
  return true;
}

/** "after 16:00", "in the afternoon", "at 15:00"… for replies and cards. */
export function describeTimeReference(ref: TimeReference): string | null {
  if (!ref) return null;
  switch (ref.constraint) {
    case "exact":
      return ref.time ? `at ${ref.time}` : null;
    case "around":
      return ref.time ? `around ${ref.time}` : null;
    case "before":
      return ref.time ? `before ${ref.time}` : null;
    case "after":
      return ref.time ? `after ${ref.time}` : null;
    case "morning":
    case "afternoon":
    case "evening":
      return ref.constraint;
    case "same_time":
      return "at the same time";
    case "later":
      return "later";
    case "earlier":
      return "earlier";
    case "anytime":
      return null;
  }
}
