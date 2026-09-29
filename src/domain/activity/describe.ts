import { serviceNoun } from "@/domain/messages/templates";
import { readBookingUnderstanding } from "@/domain/requests/booking";
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
  | "automation_resumed"
  | "reply_needed";

export type ActivityActor = "contact" | "pingflow" | "owner";

export type ActivityRecord = {
  id: string;
  kind: ActivityKind;
  actor: ActivityActor;
  occurredAt: Date;
  details: Record<string, unknown>;
  customerName: string | null;
  /** The contact's name or number, when no one customer is linked. */
  contactName?: string | null;
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

/** Why a message was left for the owner to answer. */
function replyNeeded(reason: unknown, who: string): string {
  switch (reason) {
    case "clarification_exhausted":
      return `Pingflow wasn’t sure what ${who} meant and left it for you`;
    case "interpreter_unavailable":
      return `Pingflow couldn’t understand ${possessive(who)} message and left it for you`;
    case "identity_unknown":
      return `Pingflow doesn’t know this number, so it left the message for you`;
    case "not_linked":
      return `${who} asked about someone this number isn’t linked to. Pingflow shared nothing and left it for you`;
    case "new_contact":
      return `A new contact asked to book. Pingflow left it for you`;
    case "automation_off":
      return `Automatic replies are off, so Pingflow left ${possessive(who)} message for you`;
    case "business_question":
      return `${who} asked a question. It’s waiting for your reply`;
    case "no_booking_found":
      return `Pingflow couldn’t find the booking ${who} meant and left it for you`;
    default:
      return `${possessive(who)} message is waiting for your reply`;
  }
}

export function describeActivity(
  event: ActivityRecord,
  timeZone: string,
): ActivityLine {
  const d = event.details;
  const named = event.customerName ?? event.contactName ?? null;
  const who = named ?? "A customer";
  const whose = named ? possessive(named) : "A customer’s";
  const occurredOn = dateKeyOf(event.occurredAt, timeZone);
  const service = event.serviceName
    ? serviceNoun(event.serviceName)
    : "booking";
  const at = (key: string) => {
    const value = instant(d[key]);
    return value ? formatDateTime(value, timeZone) : "an earlier time";
  };
  const simulated = d.delivery === "simulated";

  // What a request_understood entry records, by what was asked.
  const understood = (details: Record<string, unknown>): string => {
    const reschedule = readRescheduleUnderstanding(details);
    if (reschedule) {
      const from = instant(details.booking_starts_at);
      const wants = describeRequestedTime(reschedule, occurredOn);
      return from
        ? `move ${possessive(who.split(" ")[0])} ${service} from ${formatDateTime(from, timeZone)} to ${wants}`
        : `${who} wants to move their ${service} to ${wants}`;
    }
    const booking = readBookingUnderstanding(details);
    if (booking) {
      return `${who} wants to book a ${serviceNoun(booking.serviceName || "booking")} for ${describeRequestedTime(booking, occurredOn, { inSentence: true })}`;
    }
    switch (details.intent) {
      case "cancellation": {
        const starts = instant(details.booking_starts_at);
        return starts
          ? `${who} wants to cancel the ${service} on ${formatDateTime(starts, timeZone)}`
          : `${who} wants to cancel a booking`;
      }
      case "next_booking_query":
        return `${who} asked when their next booking is`;
      case "availability_query":
        return typeof details.date === "string"
          ? `${who} asked what’s free on ${formatDate(details.date)}`
          : `${who} asked what’s free`;
      default:
        return `${possessive(who)} message`;
    }
  };
  const line = (text: string, quote: string | null = null): ActivityLine => ({
    text,
    quote,
    simulated,
  });

  switch (event.kind) {
    case "message_received":
      return line(`${named ?? "Someone"} sent a message`, event.messageBody);
    case "request_understood":
      return line(`Pingflow understood: ${understood(d)}`);
    case "time_proposed": {
      const starts = instant(d.starts_at);
      return line(
        starts
          ? `Pingflow found ${formatDate(dateKeyOf(starts, timeZone), "weekday")} ${formatTime(starts, timeZone)} free and proposed it`
          : "Pingflow proposed a new time",
      );
    }
    case "approval_requested":
      return line(
        d.request_kind === "booking_request"
          ? "Pingflow asked you to approve the booking"
          : d.request_kind === "cancellation_request"
            ? "Pingflow asked you to approve the cancellation"
            : "Pingflow asked you to approve the change",
      );
    case "owner_approved": {
      if (d.request_kind === "cancellation_request") {
        return line("You approved the cancellation");
      }
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
      if (d.reason === "superseded") {
        return line(`${whose} earlier request was replaced by a newer one`);
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
      if (event.actor === "owner") {
        return line(
          simulated ? `Your reply to ${who}` : `You replied to ${who}`,
          event.messageBody,
        );
      }
      if (d.reply_kind === "clarification") {
        return line(
          simulated ? `Question to ${who}` : `Question sent to ${who}`,
          event.messageBody,
        );
      }
      return line(
        simulated ? `Reply to ${who}` : `Reply sent to ${who}`,
        event.messageBody,
      );
    case "reply_needed":
      return line(replyNeeded(d.reason, named ?? "someone"));
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
