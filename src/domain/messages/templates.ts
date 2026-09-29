import { formatDate, formatTime } from "@/domain/time/format";
import { dateKeyOf } from "@/domain/time/zoned";

// Messages Pingflow sends to customers. They are fixed templates filled with
// checked booking data: Pingflow never improvises wording to a customer.

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/** "Driving lesson" → "driving lesson", so it reads inside a sentence. */
export function serviceNoun(serviceName: string): string {
  const name = serviceName.trim();
  const [first, ...rest] = name.split(" ");
  // Leave acronyms and names alone ("MOT prep", "Pilates").
  if (first.length > 1 && first === first.toUpperCase()) return name;
  return [first.charAt(0).toLowerCase() + first.slice(1), ...rest].join(" ");
}

function longWhen(startsAt: Date, timeZone: string) {
  const day = formatDate(dateKeyOf(startsAt, timeZone), "long");
  return `${day} at ${formatTime(startsAt, timeZone)}`;
}

export function rescheduleConfirmation(input: {
  customerName: string;
  serviceName: string;
  startsAt: Date;
  timeZone: string;
}): string {
  return `Hi ${firstName(input.customerName)}, that’s done. Your ${serviceNoun(input.serviceName)} is now on ${longWhen(input.startsAt, input.timeZone)}. See you then!`;
}

export function rescheduleDecline(input: {
  customerName: string;
  serviceName: string;
  currentStartsAt: Date;
  /** What they asked for, e.g. "Friday after 16:00". */
  requested: string;
  timeZone: string;
}): string {
  return `Hi ${firstName(input.customerName)}, sorry, ${input.requested} doesn’t work this time. Your ${serviceNoun(input.serviceName)} stays on ${longWhen(input.currentStartsAt, input.timeZone)}.`;
}

export function bookingConfirmation(input: {
  customerName: string;
  serviceName: string;
  startsAt: Date;
  timeZone: string;
}): string {
  return `Hi ${firstName(input.customerName)}, that’s booked. Your ${serviceNoun(input.serviceName)} is on ${longWhen(input.startsAt, input.timeZone)}. See you then!`;
}

export function bookingDecline(input: {
  customerName: string;
  /** What they asked for, e.g. "Friday after 16:00". */
  requested: string;
}): string {
  return `Hi ${firstName(input.customerName)}, sorry, ${input.requested} doesn’t work this time. Let me know if another day suits you.`;
}

export function cancellationConfirmation(input: {
  customerName: string;
  serviceName: string;
  startsAt: Date;
  timeZone: string;
}): string {
  return `Hi ${firstName(input.customerName)}, that’s done. Your ${serviceNoun(input.serviceName)} on ${longWhen(input.startsAt, input.timeZone)} is cancelled.`;
}

export function cancellationDecline(input: {
  customerName: string;
  serviceName: string;
  startsAt: Date;
  timeZone: string;
}): string {
  return `Hi ${firstName(input.customerName)}, I can’t cancel this one, sorry. Your ${serviceNoun(input.serviceName)} is still on ${longWhen(input.startsAt, input.timeZone)}.`;
}
