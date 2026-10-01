import {
  cancellationConfirmation,
  cancellationDecline,
} from "@/domain/messages/templates";

// A customer's request to cancel a booking, and the replies when the owner
// answers it. Approving cancels that one booking (never the whole series).

export type CancellationUnderstanding = {
  intent: "cancellation";
  bookingStartsAt: Date | null;
  scope: "single" | "all_future" | "unclear";
};

export function readCancellationUnderstanding(
  value: unknown,
): CancellationUnderstanding | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.intent !== "cancellation") return null;
  const starts =
    typeof v.booking_starts_at === "string"
      ? new Date(v.booking_starts_at)
      : null;
  return {
    intent: "cancellation",
    bookingStartsAt: starts && !Number.isNaN(starts.getTime()) ? starts : null,
    scope:
      v.scope === "all_future" || v.scope === "unclear" ? v.scope : "single",
  };
}

type BookingFacts = {
  customerName: string;
  serviceName: string;
  startsAt: Date;
  timeZone: string;
};

/** The confirmation, or null when confirmations are off. */
export function planCancellationApproval(
  input: BookingFacts & { confirmationsEnabled: boolean },
): { replyBody: string | null } {
  return {
    replyBody: input.confirmationsEnabled
      ? cancellationConfirmation(input)
      : null,
  };
}

export function planCancellationDecline(input: BookingFacts): {
  replyBody: string;
} {
  return { replyBody: cancellationDecline(input) };
}
