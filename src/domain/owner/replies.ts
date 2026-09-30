import { firstName, serviceNoun } from "@/domain/messages/templates";
import {
  formatDate,
  formatDuration,
  formatTime,
  formatTimeRange,
} from "@/domain/time/format";
import {
  addDays,
  type DateKey,
  dateKeyOf,
  daysBetween,
} from "@/domain/time/zoned";

// What Pingflow says back to the owner on WhatsApp: short, factual, from
// checked data only. No model writes any of it.

/** "today", "tomorrow", "Friday 2 October". */
export function dayName(date: DateKey, today: DateKey): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return formatDate(date, "long");
}

/** "Today", "Tomorrow", "Friday 2 October", for headings. */
function dayHeading(date: DateKey, today: DateKey) {
  const name = dayName(date, today);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** "tomorrow", "on Friday 2 October", inside a sentence. */
export function onDay(date: DateKey, today: DateKey): string {
  const name = dayName(date, today);
  return daysBetween(today, date) <= 1 && daysBetween(today, date) >= 0
    ? name
    : `on ${name}`;
}

/** "tomorrow at 16:00", "Friday 2 October at 16:00". */
export function when(startsAt: Date, timeZone: string, today: DateKey) {
  return `${dayName(dateKeyOf(startsAt, timeZone), today)} at ${formatTime(startsAt, timeZone)}`;
}

const possessive = (name: string) =>
  name.endsWith("s") ? `${name}’` : `${name}’s`;

export type ListedBooking = {
  startsAt: Date;
  endsAt: Date;
  customerName: string;
  serviceName: string;
};

export type ListedBlock = {
  startsAt: Date;
  endsAt: Date;
  label: string | null;
};

/**
 * "Tomorrow:\n• 10:00–11:00 — Sarah Khan — Driving lesson", one section a
 * day; "You're free tomorrow." when there's nothing.
 */
export function scheduleReply(input: {
  from: DateKey;
  days: number;
  bookings: ListedBooking[];
  blocks: ListedBlock[];
  timeZone: string;
  today: DateKey;
  /** "this week", for the empty case of a range. */
  rangeName?: string;
}): string {
  const tz = input.timeZone;
  const sections: string[] = [];
  for (let d = 0; d < input.days; d++) {
    const date = addDays(input.from, d);
    const items = [
      ...input.bookings
        .filter((b) => dateKeyOf(b.startsAt, tz) === date)
        .map((b) => ({
          at: b.startsAt.getTime(),
          line: `• ${formatTimeRange(b.startsAt, b.endsAt, tz)} — ${b.customerName} — ${b.serviceName}`,
        })),
      ...input.blocks
        .filter((b) => dateKeyOf(b.startsAt, tz) === date)
        .map((b) => ({
          at: b.startsAt.getTime(),
          line: `• ${formatTimeRange(b.startsAt, b.endsAt, tz)} — Blocked${b.label ? `: ${b.label}` : ""}`,
        })),
    ].sort((a, b) => a.at - b.at);
    if (items.length) {
      sections.push(
        [`${dayHeading(date, input.today)}:`, ...items.map((i) => i.line)].join(
          "\n",
        ),
      );
    }
  }
  if (sections.length) return sections.join("\n\n");
  if (input.days > 1) return `You’re free ${input.rangeName ?? "then"}.`;
  return `You’re free ${onDay(input.from, input.today)}.`;
}

/** "You have 4 bookings tomorrow (5 hours 30 min)." */
export function countReply(input: {
  count: number;
  minutes: number;
  period: string;
}): string {
  if (input.count === 0) return `You have no bookings ${input.period}.`;
  const noun = input.count === 1 ? "booking" : "bookings";
  return `You have ${input.count} ${noun} ${input.period} (${formatDuration(input.minutes)}).`;
}

/** A customer's upcoming bookings, the next three at most. */
export function customerBookingsReply(input: {
  customerName: string;
  bookings: { startsAt: Date; serviceName: string }[];
  timeZone: string;
  today: DateKey;
}): string {
  const { customerName, bookings, timeZone, today } = input;
  if (bookings.length === 0) return `${customerName} has nothing booked.`;
  if (bookings.length === 1) {
    const b = bookings[0];
    return `${customerName} is booked ${when(b.startsAt, timeZone, today)} for a ${serviceNoun(b.serviceName)}.`;
  }
  const shown = bookings.slice(0, 3);
  const lines = shown.map(
    (b) =>
      `• ${capitalise(when(b.startsAt, timeZone, today))} — ${b.serviceName}`,
  );
  const more = bookings.length - shown.length;
  return [
    `${customerName}:`,
    ...lines,
    ...(more > 0 ? [`…and ${more} more.`] : []),
  ].join("\n");
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function rescheduledReply(input: {
  customerName: string;
  serviceName: string;
  startsAt: Date;
  timeZone: string;
  today: DateKey;
}): string {
  return `Done. ${possessive(input.customerName)} ${serviceNoun(input.serviceName)} is now ${when(input.startsAt, input.timeZone, input.today)}. ${firstName(input.customerName)} hasn’t been messaged.`;
}

export function cancelledReply(input: {
  customerName: string;
  serviceName: string;
  startsAt: Date;
  timeZone: string;
  today: DateKey;
}): string {
  return `Cancelled ${possessive(input.customerName)} ${serviceNoun(input.serviceName)} ${when(input.startsAt, input.timeZone, input.today)}. ${firstName(input.customerName)} hasn’t been messaged.`;
}

export function blockedReply(input: {
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  today: DateKey;
}): string {
  const date = dateKeyOf(input.startsAt, input.timeZone);
  return `Blocked ${dayName(date, input.today)} ${formatTimeRange(input.startsAt, input.endsAt, input.timeZone)}.`;
}

/** "10:00, 14:00 or 17:00" */
export function listTimes(times: string[]): string {
  if (times.length <= 1) return times.join("");
  return `${times.slice(0, -1).join(", ")} or ${times.at(-1)}`;
}

export const ownerReplies = {
  failed: "I couldn’t process that command. Nothing was changed.",
  notText: "I can only read typed messages. Nothing was changed.",
  unsupported:
    "I can’t do that from WhatsApp. I can show your bookings, check when you’re free, and move, cancel or block time.",
  unclear:
    "Sorry, I didn’t catch that. You can ask “Who have I got tomorrow?”, “When is Sarah booked?” or “Block Thursday afternoon”.",
  exhausted: "I still can’t tell what you mean. Please update it in Pingflow.",
  exhaustedBooking:
    "I still can’t tell which booking you mean. Please update it in Pingflow.",
  whichDay: "Which day?",
  untilWhen: "Until what time?",
  whose: "Whose booking?",
} as const;
