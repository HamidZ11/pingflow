import { resolveDateReference } from "@/domain/messages/dates";
import type { BookingReference } from "@/domain/messages/interpretation";
import { clockTimeOf, type DateKey, dateKeyOf } from "@/domain/time/zoned";

// Which of a customer's upcoming bookings a message is about ("tomorrow's
// lesson", "Friday", "my next one"), decided from their actual bookings.

export type CustomerBooking = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  bufferMinutes: number;
  serviceId: string;
  serviceName: string;
  seriesId: string | null;
};

export type BookingMatch =
  | { kind: "found"; booking: CustomerBooking }
  | { kind: "none" }
  | { kind: "several"; bookings: CustomerBooking[] };

function serviceMatches(booking: CustomerBooking, service: string | null) {
  if (!service) return true;
  const want = service.toLowerCase().replace(/[^a-z0-9]/g, "");
  const have = booking.serviceName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return have.includes(want) || want.includes(have);
}

/**
 * The booking a reference points to, among upcoming bookings (soonest
 * first). "Next" or no reference means the next one; a day narrows to that
 * day (and a time or service narrows further). More than one match is
 * reported, never guessed between.
 */
export function resolveBookingReference(
  ref: BookingReference,
  upcoming: CustomerBooking[],
  today: DateKey,
  timeZone: string,
  { preferSingleWhenUnspecified = false } = {},
): BookingMatch {
  if (upcoming.length === 0) return { kind: "none" };

  const byService = upcoming.filter((b) =>
    serviceMatches(b, ref?.service ?? null),
  );

  if (
    !ref ||
    ref.kind === "next" ||
    (ref.kind === "unspecified" && !ref.date)
  ) {
    if (
      ref?.kind === "unspecified" &&
      preferSingleWhenUnspecified &&
      byService.length > 1
    ) {
      return { kind: "several", bookings: byService.slice(0, 2) };
    }
    return byService[0]
      ? { kind: "found", booking: byService[0] }
      : { kind: "none" };
  }

  const day = resolveDateReference(ref.date, today);
  let candidates = byService;
  if (day?.kind === "day") {
    candidates = candidates.filter(
      (b) => dateKeyOf(b.startsAt, timeZone) === day.date,
    );
  } else if (day?.kind === "range") {
    const last = new Date(Date.parse(day.from) + (day.days - 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    candidates = candidates.filter((b) => {
      const d = dateKeyOf(b.startsAt, timeZone);
      return d >= day.from && d <= last;
    });
  }
  if (ref.time) {
    const timed = candidates.filter(
      (b) => clockTimeOf(b.startsAt, timeZone) === ref.time,
    );
    if (timed.length) candidates = timed;
  }

  if (candidates.length === 1) return { kind: "found", booking: candidates[0] };
  if (candidates.length === 0) return { kind: "none" };
  return { kind: "several", bookings: candidates.slice(0, 2) };
}
