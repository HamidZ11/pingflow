import { TZDate } from "@date-fns/tz";

// Pingflow reasons about two kinds of time:
//
// - Instants (`Date`): a moment in time, stored in the database as
//   timestamptz. Bookings, blocks, messages and reminders are instants.
// - Wall-clock values in the business's time zone: a calendar date
//   (`DateKey`, "2026-10-02") and a time of day (`ClockTime`, "16:00").
//   Working hours, recurring series and the schedule's days are wall-clock.
//
// Every conversion between the two goes through this file, with an explicit
// IANA time zone, so clock changes (BST ↔ GMT) are handled in one place.

/** A calendar date in the business's time zone, "YYYY-MM-DD". */
export type DateKey = string;

/** A time of day in the business's time zone, "HH:mm" (24-hour). */
export type ClockTime = string;

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const DEFAULT_TIME_ZONE = "Europe/London";

const dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const clockTimePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== "string") return false;
  const match = dateKeyPattern.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

export function isClockTime(value: unknown): value is ClockTime {
  return typeof value === "string" && clockTimePattern.test(value);
}

function parseDateKey(date: DateKey) {
  const match = dateKeyPattern.exec(date);
  if (!match) throw new Error(`Invalid date: ${date}`);
  return { year: +match[1], month: +match[2], day: +match[3] };
}

/** Minutes since midnight: "16:30" → 990. Accepts "24:00" as end of day. */
export function minutesOfDay(time: ClockTime): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** 990 → "16:30". */
export function clockTimeFromMinutes(minutes: number): ClockTime {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * The instant a wall-clock date and time happen in a time zone. A time that
 * doesn't exist (skipped when clocks go forward) moves forward by the gap.
 * "24:00" means midnight at the end of that date.
 */
export function zonedInstant(
  date: DateKey,
  time: ClockTime,
  timeZone: string,
): Date {
  const { year, month, day } = parseDateKey(date);
  const minutes = minutesOfDay(time);
  const zoned = new TZDate(
    year,
    month - 1,
    day,
    Math.floor(minutes / 60),
    minutes % 60,
    timeZone,
  );
  return new Date(zoned.getTime());
}

function inZone(instant: Date, timeZone: string) {
  return new TZDate(instant.getTime(), timeZone);
}

/** The calendar date an instant falls on in a time zone. */
export function dateKeyOf(instant: Date, timeZone: string): DateKey {
  const z = inZone(instant, timeZone);
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`;
}

/** The wall-clock time an instant shows in a time zone. */
export function clockTimeOf(instant: Date, timeZone: string): ClockTime {
  const z = inZone(instant, timeZone);
  return clockTimeFromMinutes(z.getHours() * 60 + z.getMinutes());
}

// Calendar arithmetic on DateKeys is time-zone free: a date is a date.
function toUtcDate(date: DateKey) {
  const { year, month, day } = parseDateKey(date);
  return new Date(Date.UTC(year, month - 1, day));
}

function fromUtcDate(d: Date): DateKey {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: DateKey, days: number): DateKey {
  const d = toUtcDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtcDate(d);
}

export function isoWeekday(date: DateKey): Weekday {
  const day = toUtcDate(date).getUTCDay();
  return (day === 0 ? 7 : day) as Weekday;
}

/** The Monday of the week containing `date`. */
export function startOfWeek(date: DateKey): DateKey {
  return addDays(date, 1 - isoWeekday(date));
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: DateKey, to: DateKey): number {
  return Math.round(
    (toUtcDate(to).getTime() - toUtcDate(from).getTime()) / 86_400_000,
  );
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60_000);
}
