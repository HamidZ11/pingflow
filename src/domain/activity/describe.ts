import { serviceNoun } from "@/domain/messages/templates";
import {
  describeRequestedTime,
  readRescheduleUnderstanding,
} from "@/domain/requests/reschedule";
import {
  formatDate,
  formatDateTime,
  formatDateTimeRange,
  formatTime,
} from "@/domain/time/format";
import { dateKeyOf } from "@/domain/time/zoned";

// Turns stored activity (structured facts) into the sentences the owner
// reads. All wording for the audit trail lives here.

export type ActivityKind =
  | "message_received"
  | "request_understood"
  | "time_proposed"
  | "approval_requested"
  | "owner_approved"
  | "owner_declined"
  | "owner_took_over"
  | "request_closed"
  | "booking_created"
  | "booking_moved"
  | "booking_cancelled"
  | "confirmation_sent"
  | "reply_sent"
  | "reminder_scheduled"
  | "reminder_rescheduled"
  | "reminder_cancelled"
  | "time_blocked"
  | "block_removed"
  | "customer_added"
  | "automation_resumed";

export type ActivityActor = "contact" | "pingflow" | "owner";

export type ActivityRecord = {
  id: string;
  kind: ActivityKind;
  actor: ActivityActor;
  occurredAt: Date;
  details: Record<string, unknown>;
  customerName: string | null;
  serviceName: string | null;
  messageBody: string | null;
};

export type ActivityLine = {
  text: string;
  /** A message's words, shown quoted under the line. */
  quote: string | null;
  /** An outbound message that was recorded but not really sent. */
  simulated: boolean;
};

function instant(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function possessive(name: string) {
  return name.endsWith("s") ? `${name}’` : `${name}’s`;
}

export function describeActivity(
  event: ActivityRecord,
  timeZone: string,
): ActivityLine {
  const d = event.details;
  const who = event.customerName ?? "A customer";
  const whose = event.customerName
    ? possessive(event.customerName)
    : "A customer’s";
  const service = event.serviceName
    ? serviceNoun(event.serviceName)
    : "booking";
  const at = (key: string) => {
    const value = instant(d[key]);
    return value ? formatDateTime(value, timeZone) : "an earlier time";
  };
  const simulated = d.delivery === "simulated";
  const line = (text: string, quote: string | null = null): ActivityLine => ({
    text,
    quote,
    simulated,
  });

  switch (event.kind) {
    case "message_received":
      return line(`${who} sent a message`, event.messageBody);
    case "request_understood": {
      const understanding = readRescheduleUnderstanding(d);
      const from = instant(d.booking_starts_at);
      const wants = understanding
        ? describeRequestedTime(
            understanding,
            dateKeyOf(event.occurredAt, timeZone),
          )
        : "another time";
      return line(
        from
          ? `Pingflow understood: move ${possessive(who.split(" ")[0])} ${service} from ${formatDateTime(from, timeZone)} to ${wants}`
          : `Pingflow understood: ${who} wants to move their ${service}`,
      );
    }
    case "time_proposed": {
      const starts = instant(d.starts_at);
      return line(
        starts
          ? `Pingflow found ${formatDate(dateKeyOf(starts, timeZone), "weekday")} ${formatTime(starts, timeZone)} free and proposed it`
          : "Pingflow proposed a new time",
      );
    }
    case "approval_requested":
      return line("Pingflow asked you to approve the change");
    case "owner_approved": {
      const chosen = instant(d.starts_at);
      const proposed = instant(d.proposed_starts_at);
      const other =
        chosen && proposed && chosen.getTime() !== proposed.getTime();
      return line(
        chosen
          ? `You approved ${formatDateTime(chosen, timeZone)}${other ? " instead of the proposed time" : ""}`
          : "You approved the change",
      );
    }
    case "owner_declined":
      return line(`You declined ${possessive(who)} request`);
    case "owner_took_over":
      return line(
        `You took over ${possessive(who)} request. Pingflow won’t reply to them until you let it.`,
      );
    case "request_closed":
      if (d.reason === "handled_by_owner") {
        return line(`You marked ${possessive(who)} message as handled`);
      }
      return line(
        `${whose} request was closed because you ${d.reason === "booking_cancelled" ? "cancelled" : "moved"} the booking`,
      );
    case "booking_created": {
      const starts = instant(d.starts_at);
      const ends = instant(d.ends_at);
      return line(
        starts && ends
          ? `${event.serviceName ?? "Booking"} booked for ${who}, ${formatDateTimeRange(starts, ends, timeZone)}`
          : `Booking added for ${who}`,
      );
    }
    case "booking_moved":
      return line(
        `${whose} ${service} moved from ${at("from_starts_at")} to ${at("to_starts_at")}`,
      );
    case "booking_cancelled":
      return line(`${whose} ${service} on ${at("starts_at")} was cancelled`);
    // A simulated message was written but not sent (WhatsApp isn't
    // connected), so it isn't described as sent.
    case "confirmation_sent":
      return line(
        simulated ? `Confirmation to ${who}` : `Confirmation sent to ${who}`,
        event.messageBody,
      );
    case "reply_sent":
      return line(
        simulated ? `Reply to ${who}` : `Reply sent to ${who}`,
        event.messageBody,
      );
    case "reminder_scheduled":
      return line(`Reminder set for ${at("send_at")}`);
    case "reminder_rescheduled":
      return line(
        `Reminder moved from ${at("from_send_at")} to ${at("send_at")}`,
      );
    case "reminder_cancelled":
      return line(`Reminder for ${at("send_at")} cancelled`);
    case "time_blocked": {
      const starts = instant(d.starts_at);
      const ends = instant(d.ends_at);
      const label = typeof d.label === "string" ? ` (${d.label})` : "";
      return line(
        starts && ends
          ? `You blocked ${formatDateTimeRange(starts, ends, timeZone)}${label}`
          : "You blocked some time",
      );
    }
    case "block_removed": {
      const starts = instant(d.starts_at);
      const ends = instant(d.ends_at);
      return line(
        starts && ends
          ? `You freed up ${formatDateTimeRange(starts, ends, timeZone)}`
          : "You removed blocked time",
      );
    }
    case "customer_added":
      return line(`${who} added as a customer`);
    case "automation_resumed":
      return line(`Pingflow is handling ${possessive(who)} messages again`);
  }
}
