import type { Interval } from "@/domain/availability/engine";
import {
  clockTimeOf,
  type DateKey,
  dateKeyOf,
  minutesOfDay,
} from "@/domain/time/zoned";

// Where things sit on the schedule's time grid. Positions are minutes from
// the top of the grid, so the UI can pick any height per hour.

export type GridRange = { start: number; end: number };

/** Local minutes-of-day of an instant, on the grid's calendar date. */
export function minuteOfDay(instant: Date, date: DateKey, timeZone: string) {
  const onDate = dateKeyOf(instant, timeZone);
  if (onDate < date) return 0;
  if (onDate > date) return 24 * 60;
  return minutesOfDay(clockTimeOf(instant, timeZone));
}

/**
 * The hours the grid shows: from the earliest thing to the latest, on whole
 * hours, never less than 09:00–17:00. With a margin (regular hours), an
 * extra hour either side shows where the working day starts and ends; a
 * flexible schedule shows its bookable day edge to edge.
 */
export function gridRange(
  spans: { date: DateKey; interval: Interval }[],
  timeZone: string,
  { marginMinutes = 60 }: { marginMinutes?: number } = {},
): GridRange {
  let start = 9 * 60;
  let end = 17 * 60;
  for (const { date, interval } of spans) {
    start = Math.min(start, minuteOfDay(interval.startsAt, date, timeZone));
    end = Math.max(end, minuteOfDay(interval.endsAt, date, timeZone));
  }
  start = Math.max(0, Math.floor(start / 60) * 60 - marginMinutes);
  end = Math.min(24 * 60, Math.ceil(end / 60) * 60 + marginMinutes);
  return { start, end };
}

/** Top and height, in minutes from the top of the grid, clipped to it. */
export function place(
  interval: Interval,
  date: DateKey,
  range: GridRange,
  timeZone: string,
) {
  const from = Math.max(
    range.start,
    minuteOfDay(interval.startsAt, date, timeZone),
  );
  const to = Math.min(range.end, minuteOfDay(interval.endsAt, date, timeZone));
  return { top: from - range.start, height: Math.max(0, to - from) };
}
