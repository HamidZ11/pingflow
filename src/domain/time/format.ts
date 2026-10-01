import {
  addDays,
  clockTimeOf,
  type DateKey,
  dateKeyOf,
  daysBetween,
  isoWeekday,
} from "@/domain/time/zoned";

// Every date and time the owner reads is formatted here, in the business's
// time zone, in British English. Names come from fixed tables rather than
// Intl so the server and every browser produce identical text (ICU versions
// disagree on details such as "Sep" vs "Sept").

const weekdayNames = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function dateParts(date: DateKey) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = weekdayNames[isoWeekday(date) - 1];
  const monthName = monthNames[month - 1];
  return {
    year,
    day,
    weekday,
    weekdayShort: weekday.slice(0, 3),
    month: monthName,
    monthShort: monthName.slice(0, 3),
  };
}

/** "17:00" */
export function formatTime(instant: Date, timeZone: string): string {
  return clockTimeOf(instant, timeZone);
}

/** "17:00–18:00" */
export function formatTimeRange(
  start: Date,
  end: Date,
  timeZone: string,
): string {
  return `${formatTime(start, timeZone)}–${formatTime(end, timeZone)}`;
}

type DayStyle =
  /** "Fri" */
  | "weekday-short"
  /** "Friday" */
  | "weekday"
  /** "Fri 2 Oct" */
  | "short"
  /** "Friday 2 October" */
  | "long"
  /** "2" */
  | "day-of-month";

/** Formats a calendar date (already in the business's zone). */
export function formatDate(date: DateKey, style: DayStyle = "short"): string {
  const p = dateParts(date);
  switch (style) {
    case "weekday-short":
      return p.weekdayShort;
    case "weekday":
      return p.weekday;
    case "day-of-month":
      return String(p.day);
    case "short":
      return `${p.weekdayShort} ${p.day} ${p.monthShort}`;
    case "long":
      return `${p.weekday} ${p.day} ${p.month}`;
  }
}

/** The calendar date of an instant, formatted. */
export function formatDay(
  instant: Date,
  timeZone: string,
  style: DayStyle = "short",
): string {
  return formatDate(dateKeyOf(instant, timeZone), style);
}

/** "Fri 2 Oct, 17:00" */
export function formatDateTime(instant: Date, timeZone: string): string {
  return `${formatDay(instant, timeZone)}, ${formatTime(instant, timeZone)}`;
}

/** "Fri 2 Oct, 17:00–18:00" */
export function formatDateTimeRange(
  start: Date,
  end: Date,
  timeZone: string,
): string {
  return `${formatDay(start, timeZone)}, ${formatTimeRange(start, end, timeZone)}`;
}

/**
 * How a person would say the day relative to today: "Today", "Tomorrow",
 * "Yesterday", a weekday within the coming week, otherwise "Fri 2 Oct".
 */
export function formatRelativeDate(date: DateKey, today: DateKey): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return formatDate(date, "weekday");
  return formatDate(date, "short");
}

/** "Tomorrow, 16:00" / "Friday, 17:00" / "Mon 12 Oct, 09:00" */
export function formatRelativeDateTime(
  instant: Date,
  now: Date,
  timeZone: string,
): string {
  const day = formatRelativeDate(
    dateKeyOf(instant, timeZone),
    dateKeyOf(now, timeZone),
  );
  return `${day}, ${formatTime(instant, timeZone)}`;
}

/** "28 Sep – 4 Oct 2026", "28 Dec 2026 – 3 Jan 2027" */
export function formatWeekRange(monday: DateKey): string {
  const a = dateParts(monday);
  const b = dateParts(addDays(monday, 6));
  if (a.year !== b.year) {
    return `${a.day} ${a.monthShort} ${a.year} – ${b.day} ${b.monthShort} ${b.year}`;
  }
  if (a.month !== b.month) {
    return `${a.day} ${a.monthShort} – ${b.day} ${b.monthShort} ${b.year}`;
  }
  return `${a.day}–${b.day} ${b.monthShort} ${b.year}`;
}

/** 60 → "1 hour", 90 → "1 hour 30 min", 45 → "45 min", 120 → "2 hours" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  const hours = `${h} ${h === 1 ? "hour" : "hours"}`;
  return m === 0 ? hours : `${hours} ${m} min`;
}

/** 1440 → "1 day before", 120 → "2 hours before" */
export function formatLeadTime(minutes: number): string {
  if (minutes % 1440 === 0) {
    const d = minutes / 1440;
    return `${d} ${d === 1 ? "day" : "days"} before`;
  }
  return `${formatDuration(minutes)} before`;
}
