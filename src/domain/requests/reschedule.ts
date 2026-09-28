import {
  rescheduleConfirmation,
  rescheduleDecline,
} from "@/domain/messages/templates";
import {
  type ReminderSettings,
  reminderSendAt,
} from "@/domain/reminders/policy";
import { formatDate, formatRelativeDate } from "@/domain/time/format";
import {
  type ClockTime,
  type DateKey,
  isClockTime,
  isDateKey,
} from "@/domain/time/zoned";

// A customer's request to move a booking, as Pingflow understood it, and
// what happens when the owner answers it.

export type RescheduleUnderstanding = {
  intent: "reschedule";
  /** The day they asked for. */
  preferredDate: DateKey;
  /** "after 4" → "16:00". Null when they didn't say. */
  earliestTime: ClockTime | null;
};

/** Reads the structured interpretation stored with a request. */
export function readRescheduleUnderstanding(
  value: unknown,
): RescheduleUnderstanding | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.intent !== "reschedule" || !isDateKey(v.preferred_date)) return null;
  return {
    intent: "reschedule",
    preferredDate: v.preferred_date,
    earliestTime: isClockTime(v.earliest_time) ? v.earliest_time : null,
  };
}

/**
 * "Friday after 16:00", "Tomorrow", "Mon 12 Oct after 09:30". Inside a
 * sentence, "Tomorrow" becomes "tomorrow".
 */
export function describeRequestedTime(
  understanding: RescheduleUnderstanding,
  today: DateKey,
  { inSentence = false } = {},
): string {
  let day = formatRelativeDate(understanding.preferredDate, today);
  if (inSentence && ["Today", "Tomorrow", "Yesterday"].includes(day)) {
    day = day.toLowerCase();
  }
  return understanding.earliestTime
    ? `${day} after ${understanding.earliestTime}`
    : day;
}

/** "Friday 2 October, after 16:00", for the full context. */
export function describeRequestedTimeLong(
  understanding: RescheduleUnderstanding,
): string {
  const day = formatDate(understanding.preferredDate, "long");
  return understanding.earliestTime
    ? `${day}, after ${understanding.earliestTime}`
    : day;
}

export type AutomationChoices = {
  confirmationsEnabled: boolean;
  reminders: ReminderSettings;
};

export type ApprovalPlan = {
  startsAt: Date;
  /** The confirmation to the customer, or null when confirmations are off. */
  replyBody: string | null;
  /** When the moved booking's reminder goes out, or null for none. */
  reminderSendAt: Date | null;
};

/** Everything an approval changes, worked out before anything is written. */
export function planRescheduleApproval(input: {
  newStartsAt: Date;
  customerName: string;
  serviceName: string;
  timeZone: string;
  automation: AutomationChoices;
  now: Date;
}): ApprovalPlan {
  return {
    startsAt: input.newStartsAt,
    replyBody: input.automation.confirmationsEnabled
      ? rescheduleConfirmation({
          customerName: input.customerName,
          serviceName: input.serviceName,
          startsAt: input.newStartsAt,
          timeZone: input.timeZone,
        })
      : null,
    reminderSendAt: reminderSendAt(
      input.newStartsAt,
      input.automation.reminders,
      input.now,
    ),
  };
}

/** The reply a customer gets when the owner declines their request. */
export function planRescheduleDecline(input: {
  understanding: RescheduleUnderstanding;
  currentStartsAt: Date;
  customerName: string;
  serviceName: string;
  timeZone: string;
  today: DateKey;
}): { replyBody: string } {
  return {
    replyBody: rescheduleDecline({
      customerName: input.customerName,
      serviceName: input.serviceName,
      currentStartsAt: input.currentStartsAt,
      requested: describeRequestedTime(input.understanding, input.today, {
        inSentence: true,
      }),
      timeZone: input.timeZone,
    }),
  };
}
