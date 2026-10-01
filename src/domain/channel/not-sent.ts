// When a message Pingflow meant to send didn't go: how it's put to the
// owner. Plain words, no provider codes.

type Purpose = "reply" | "confirmation" | "owner_reply" | "reminder" | string;

export function describeNotSent(input: {
  purpose: Purpose | null;
  cause: string | null;
  /** The customer's name, or "them". */
  who: string;
}): { title: string; explanation: string } {
  const title =
    input.purpose === "confirmation"
      ? `Pingflow couldn’t send the confirmation to ${input.who}`
      : input.purpose === "owner_reply"
        ? `Your reply to ${input.who} wasn’t sent`
        : input.purpose === "reminder"
          ? `The reminder to ${input.who} wasn’t sent`
          : `Pingflow couldn’t send its reply to ${input.who}`;
  return { title, explanation: notSentReason(input.cause) };
}

/** Why, in a sentence, with what to do. */
export function notSentReason(cause: string | null): string {
  switch (cause) {
    case "template_required":
      return "It’s been more than 24 hours since they last messaged, so WhatsApp only allows an approved template. Send it from WhatsApp instead.";
    case "connection_unavailable":
      return "WhatsApp needs attention in Settings. Send it from WhatsApp instead.";
    case "recipient_unavailable":
      return "WhatsApp couldn’t deliver to this number.";
    case "outcome_unknown":
      return "Pingflow couldn’t confirm whether it went. Check WhatsApp before sending it again.";
    case "template_rejected":
    case "template_misconfigured":
      return "WhatsApp didn’t accept the template. Send it from WhatsApp instead.";
    default:
      return "WhatsApp didn’t deliver it. Send it from WhatsApp instead.";
  }
}

/** Why a reminder didn't go, for Activity: "needs an approved template". */
export function reminderNotSentReason(reason: string | null): string {
  switch (reason) {
    case "template_required":
      return "WhatsApp needs an approved reminder template outside the 24-hour window";
    case "not_on_whatsapp":
      return "they haven’t messaged you on WhatsApp yet";
    case "not_connected":
      return "WhatsApp isn’t connected";
    case "simulated":
      return "it’s a simulated conversation, so it was recorded instead";
    case "connection_unavailable":
      return "WhatsApp needs attention";
    case "too_late":
      return "the booking had already started or was cancelled";
    case "no_number":
      return "there’s no number for them";
    case "outcome_unknown":
      return "Pingflow couldn’t confirm whether it went";
    default:
      return "WhatsApp didn’t deliver it";
  }
}
