import {
  type ContentType,
  contentNoun,
  contentPlural,
} from "@/domain/channel/inbound";
import type { Intent } from "@/domain/messages/interpretation";
import type { OwnerTaskReason } from "@/domain/messages/policy";

// How a message that needs the owner's reply is described in Attention. The
// wording says what happened and what Pingflow did (or didn't) share; it
// never mentions how the message was read.

export type OwnerTaskDescription = {
  title: string;
  /** One line on why it's here, or null when the title says it all. */
  explanation: string | null;
};

const privateIntents: (Intent | null)[] = [
  "next_booking_query",
  "reschedule_request",
  "cancellation_request",
];

export function describeOwnerTask(input: {
  reason: OwnerTaskReason | string | null;
  intent: Intent | null;
  /** The customer's first name, the contact's name, or their number. */
  who: string;
  /** "driving lesson", for "asked when the next driving lesson is". */
  noun: string;
  hasDraft: boolean;
  /** For a message Pingflow couldn't read (a photo, a voice note). */
  contentType?: ContentType | null;
}): OwnerTaskDescription {
  const { who, intent } = input;
  const drafted = input.hasDraft
    ? "Pingflow has drafted a reply for you to check."
    : null;

  switch (input.reason) {
    case "clarification_exhausted":
      return {
        title: `Pingflow isn’t sure what ${who} means`,
        explanation:
          "It asked once and still wasn’t sure, so it’s over to you.",
      };
    case "interpreter_unavailable":
      return {
        title: "Pingflow couldn’t understand this message",
        explanation: "Nothing was sent. Reply yourself, or mark it handled.",
      };
    case "identity_unknown":
      if (intent === "availability_query") {
        return {
          title: `${who} asked what’s free`,
          explanation:
            `Pingflow only replies by itself to customers it knows. ${drafted ?? ""}`.trim(),
        };
      }
      if (intent === "simple_business_question") {
        return { title: `${who} asked a question`, explanation: drafted };
      }
      if (privateIntents.includes(intent)) {
        return {
          title: "A number Pingflow doesn’t know asked about a booking",
          explanation: "Pingflow didn’t share any booking details.",
        };
      }
      return {
        title: "A message from a number Pingflow doesn’t know",
        explanation: null,
      };
    case "not_linked":
      return {
        title: `${who} asked about someone else`,
        explanation:
          "This number isn’t linked to the person they named, so Pingflow didn’t share any booking details.",
      };
    case "new_contact":
      return {
        title: "A new contact wants to book",
        explanation:
          "Pingflow doesn’t know this number yet. Add them as a customer, or reply yourself.",
      };
    case "automation_off":
      return {
        title:
          intent === "next_booking_query"
            ? `${who} asked when the next ${input.noun} is`
            : `${who} asked what’s free`,
        explanation:
          `Automatic replies for this are off. ${drafted ?? ""}`.trim(),
      };
    case "business_question":
      return { title: `${who} asked a question`, explanation: drafted };
    case "unsupported_content": {
      const type = input.contentType ?? "unknown";
      return {
        title: `${who} sent ${contentNoun(type)}`,
        explanation: `Pingflow can’t handle ${contentPlural(type)} yet, so it’s over to you.`,
      };
    }
    case "no_booking_found":
      return {
        title: `${who} asked about a booking Pingflow can’t find`,
        explanation: "There’s no upcoming booking that matches.",
      };
    default:
      return { title: `${who} needs a reply`, explanation: null };
  }
}
