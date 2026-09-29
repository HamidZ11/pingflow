import {
  rescheduleConfirmation,
  rescheduleDecline,
} from "@/domain/messages/templates";
import {
  type ReminderSettings,
  reminderSendAt,
} from "@/domain/reminders/policy";
import {
  describeRequestedTime,
  describeRequestedTimeLong,
  type RequestedTime,
  readRequestedTime,
} from "@/domain/requests/requested-time";
import type { DateKey } from "@/domain/time/zoned";

// A customer's request to move a booking, as Pingflow understood it, and
// what happens when the owner answers it.

export type RescheduleUnderstanding = RequestedTime & { intent: "reschedule" };

/** Reads the structured interpretation stored with a request. */
export function readRescheduleUnderstanding(
  value: unknown,
): RescheduleUnderstanding | null {
  if (!value || typeof value !== "object") return null;
  if ((value as Record<string, unknown>).intent !== "reschedule") return null;
  const requested = readRequestedTime(value);
  return requested ? { intent: "reschedule", ...requested } : null;
}

export { describeRequestedTime, describeRequestedTimeLong };

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
