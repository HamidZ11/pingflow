import { serviceNoun } from "@/domain/messages/templates";
import {
  formatDate,
  formatRelativeDate,
  formatTime,
} from "@/domain/time/format";
import { type DateKey, dateKeyOf, daysBetween } from "@/domain/time/zoned";

// What Pingflow says to customers on its own. Every sentence is a fixed
// template filled in with checked data: nothing here is written by a model.
// Short and natural, like the owner would text: no "Hi Sarah!" on every
// message, no "your query has been processed".

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function list(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
}

/** "today", "tomorrow", "on Friday", "on Mon 12 Oct" */
export function onDay(date: DateKey, today: DateKey): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff > 1 && diff < 7) return `on ${formatDate(date, "weekday")}`;
  return `on ${formatDate(date)}`;
}

/** "today", "tomorrow", "Friday 16 October" */
function whenDay(date: DateKey, today: DateKey): string {
  const relative = formatRelativeDate(date, today);
  if (relative === "Today" || relative === "Tomorrow") {
    return relative.toLowerCase();
  }
  return formatDate(date, "long");
}

/**
 * "Your next driving lesson is tomorrow at 16:00." When a parent or carer
 * asks about someone else, it names them: "Adam’s next driving lesson…".
 */
export function nextBookingReply(input: {
  serviceName: string;
  startsAt: Date;
  timeZone: string;
  today: DateKey;
  forName?: string | null;
}): string {
  const date = dateKeyOf(input.startsAt, input.timeZone);
  const whose = input.forName ? possessive(input.forName) : "Your";
  return `${whose} next ${serviceNoun(input.serviceName)} is ${whenDay(date, input.today)} at ${formatTime(input.startsAt, input.timeZone)}.`;
}

export function noUpcomingBookingReply(forName?: string | null): string {
  return forName
    ? `${forName} doesn’t have anything booked at the moment.`
    : "You don’t have anything booked at the moment.";
}

function possessive(name: string) {
  return name.endsWith("s") ? `${name}’` : `${name}’s`;
}

export type Offer = { startsAt: Date };

/**
 * Up to three free times. On one day: "I've got 14:00, 15:30 or 17:00 free
 * on Thursday." Across days: "I've got Tuesday at 09:00, Wednesday at 10:30
 * or Thu 8 Oct at 13:00 free."
 */
export function availabilityReply(input: {
  offers: Offer[];
  timeZone: string;
  today: DateKey;
}): string {
  const { offers, timeZone, today } = input;
  const days = new Set(offers.map((o) => dateKeyOf(o.startsAt, timeZone)));
  if (days.size === 1) {
    const date = [...days][0];
    const times = offers.map((o) => formatTime(o.startsAt, timeZone));
    return `I’ve got ${list(times)} free ${onDay(date, today)}.`;
  }
  const parts = offers.map((o) => {
    const date = dateKeyOf(o.startsAt, timeZone);
    const day = onDay(date, today).replace(/^on /, "");
    return `${day} at ${formatTime(o.startsAt, timeZone)}`;
  });
  return `I’ve got ${list(parts)} free.`;
}

/** "Yes, 15:00 is free on Friday." */
export function exactTimeFreeReply(input: {
  startsAt: Date;
  timeZone: string;
  today: DateKey;
}): string {
  const date = dateKeyOf(input.startsAt, input.timeZone);
  return `Yes, ${formatTime(input.startsAt, input.timeZone)} is free ${onDay(date, input.today)}.`;
}

/** "15:00 isn't free on Friday, but I've got 15:30 or 16:30." */
export function exactTimeTakenReply(input: {
  asked: string;
  date: DateKey;
  alternatives: Offer[];
  timeZone: string;
  today: DateKey;
}): string {
  const day = onDay(input.date, input.today);
  if (input.alternatives.length === 0) {
    return `Sorry, ${input.asked} isn’t free ${day}, and I don’t have anything else that day.`;
  }
  const times = input.alternatives.map((o) =>
    formatTime(o.startsAt, input.timeZone),
  );
  return `${input.asked} isn’t free ${day}, but I’ve got ${list(times)}.`;
}

/** "I don't have anything free on Thursday afternoon." */
export function noAvailabilityReply(period: string): string {
  return `I don’t have anything free ${period}.`;
}

export function cancellationAcknowledgement(): string {
  return "I’ve got your cancellation request. I’ll confirm it shortly.";
}

// Clarifying questions: one per missing detail, chosen by the policy. At
// most one is ever asked before the owner takes over.

export type ClarificationTopic =
  "intent" | "person" | "booking" | "later" | "date" | "time" | "service";

export function clarificationQuestion(
  topic: ClarificationTopic,
  options: {
    names?: string[];
    bookings?: { startsAt: Date; serviceName: string }[];
    services?: string[];
    day?: string;
    timeZone?: string;
    today?: DateKey;
    noun?: string;
  } = {},
): string {
  switch (topic) {
    case "person":
      return `Is this about ${list(options.names ?? [])}?`;
    case "booking": {
      const tz = options.timeZone!;
      const bookings = (options.bookings ?? []).map((b) => {
        const date = dateKeyOf(b.startsAt, tz);
        return `${onDay(date, options.today!).replace(/^on /, "")} at ${formatTime(b.startsAt, tz)}`;
      });
      return bookings.length
        ? `Which ${options.noun ?? "booking"} do you mean: ${list(bookings)}?`
        : `Which ${options.noun ?? "booking"} do you mean?`;
    }
    case "later":
      return "Do you mean later today, or a different day?";
    case "date":
      return "What day would suit you?";
    case "time":
      return `What time would suit you${options.day ? ` ${options.day}` : ""}?`;
    case "service":
      return `Which would you like: ${list(options.services ?? [])}?`;
    case "intent":
      return "Sorry, I didn’t quite catch that. What would you like to do?";
  }
}

export { capitalise };
