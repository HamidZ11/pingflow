import {
  bookingConfirmation,
  bookingDecline,
} from "@/domain/messages/templates";
import { reminderSendAt } from "@/domain/reminders/policy";
import {
  describeRequestedTime,
  type RequestedTime,
  readRequestedTime,
} from "@/domain/requests/requested-time";
import type {
  ApprovalPlan,
  AutomationChoices,
} from "@/domain/requests/reschedule";
import type { DateKey } from "@/domain/time/zoned";

// A customer's request for a new booking, as Pingflow understood it, and
// what happens when the owner answers it.

export type BookingUnderstanding = RequestedTime & {
  intent: "new_booking";
  serviceId: string;
  serviceName: string;
};

export function readBookingUnderstanding(
  value: unknown,
): BookingUnderstanding | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.intent !== "new_booking" || typeof v.service_id !== "string") {
    return null;
  }
  const requested = readRequestedTime(value);
  if (!requested) return null;
  return {
    intent: "new_booking",
    ...requested,
    serviceId: v.service_id,
    serviceName: typeof v.service_name === "string" ? v.service_name : "",
  };
}

export function planBookingApproval(input: {
  startsAt: Date;
  customerName: string;
  serviceName: string;
  timeZone: string;
  automation: AutomationChoices;
  now: Date;
}): ApprovalPlan {
  return {
    startsAt: input.startsAt,
    replyBody: input.automation.confirmationsEnabled
      ? bookingConfirmation({
          customerName: input.customerName,
          serviceName: input.serviceName,
          startsAt: input.startsAt,
          timeZone: input.timeZone,
        })
      : null,
    reminderSendAt: reminderSendAt(
      input.startsAt,
      input.automation.reminders,
      input.now,
    ),
  };
}

export function planBookingDecline(input: {
  understanding: BookingUnderstanding;
  customerName: string;
  today: DateKey;
}): { replyBody: string } {
  return {
    replyBody: bookingDecline({
      customerName: input.customerName,
      requested: describeRequestedTime(input.understanding, input.today, {
        inSentence: true,
      }),
    }),
  };
}
