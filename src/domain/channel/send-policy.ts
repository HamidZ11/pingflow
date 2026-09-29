import type { ServiceWindow } from "@/domain/channel/window";

// Whether and how a message Pingflow has decided to send may go out on
// WhatsApp. It runs after the decision about what to say, and never
// changes the words: only the route.
//
//   window open             send the text
//   window closed           send the approved template for this purpose,
//                           if there is one; otherwise don't send

/** Why the message exists (worked out from the record, not the text). */
export type SendPurpose = "reply" | "confirmation" | "owner_reply" | "reminder";

/** The approved-template slots Pingflow knows how to fill. */
export type TemplatePurpose =
  "booking_confirmation" | "cancellation_confirmation" | "appointment_reminder";

export type ApprovedTemplate = {
  purpose: TemplatePurpose;
  name: string;
  language: string;
  /** Body parameters, in order, as Pingflow field names. */
  parameters: string[];
};

export type SendDecision =
  | { action: "send_text" }
  | { action: "send_template"; template: ApprovedTemplate }
  | { action: "block"; reason: "template_required" };

/** Which template a purpose falls back to outside the window, if any. */
export function templatePurposeFor(
  purpose: SendPurpose,
  booking: { status: string } | null,
): TemplatePurpose | null {
  if (purpose === "reminder") return "appointment_reminder";
  if (purpose === "confirmation" && booking) {
    return booking.status === "cancelled"
      ? "cancellation_confirmation"
      : "booking_confirmation";
  }
  // Replies and the owner's own words have no template: outside the window
  // they're for the owner to send from WhatsApp.
  return null;
}

export function decideSend(input: {
  purpose: SendPurpose;
  booking: { status: string } | null;
  window: ServiceWindow;
  /** Approved templates for this connection, by purpose. */
  templates: Partial<Record<TemplatePurpose, ApprovedTemplate>>;
}): SendDecision {
  if (input.window.open) return { action: "send_text" };
  const wanted = templatePurposeFor(input.purpose, input.booking);
  const template = wanted ? input.templates[wanted] : undefined;
  return template
    ? { action: "send_template", template }
    : { action: "block", reason: "template_required" };
}
