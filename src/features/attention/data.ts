import "server-only";
import { checkSlot, freeIntervals } from "@/domain/availability/engine";
import {
  formatPhone,
  type Relationship,
  relationshipLabels,
} from "@/domain/contacts/phone";
import { firstName, serviceNoun } from "@/domain/messages/templates";
import {
  describeRequestedTime,
  describeRequestedTimeLong,
  planRescheduleDecline,
  readRescheduleUnderstanding,
} from "@/domain/requests/reschedule";
import { describeSeries } from "@/domain/schedule/series";
import {
  formatDate,
  formatDuration,
  formatRelativeDate,
  formatRelativeDateTime,
  formatTime,
  formatTimeRange,
} from "@/domain/time/format";
import {
  addMinutes,
  dateKeyOf,
  minutesBetween,
  type Weekday,
} from "@/domain/time/zoned";
import { loadEngineContext } from "@/features/schedule/engine-context";
import type { Owner } from "@/lib/auth/session";

// Attention: the open requests that need the owner, shaped for display.
// Everything is formatted here, on the server, in the business's time zone.

export async function countOpenRequests(owner: Owner): Promise<number> {
  const { count, error } = await owner.supabase
    .from("pending_actions")
    .select("id", { count: "exact", head: true })
    .eq("business_id", owner.business.id)
    .eq("status", "open");
  if (error) throw error;
  return count ?? 0;
}

type ContactRow = {
  relationship: Relationship;
  contact: { display_name: string | null; phone_e164: string } | null;
};

/** "+44 7700 900123", or "Dana Marsh, parent · +44 7700 900567". */
export function describeContact(links: ContactRow[] | null | undefined) {
  const link = links?.[0];
  if (!link?.contact) return null;
  const phone = formatPhone(link.contact.phone_e164);
  if (link.relationship === "self") return phone;
  const who = link.contact.display_name ?? "Contact";
  return `${who}, ${relationshipLabels[link.relationship]} · ${phone}`;
}

/** "tomorrow’s driving lesson", "Friday’s driving lesson", "the driving lesson on Mon 12 Oct" */
function whichBooking(date: string, today: string, noun: string) {
  const day = formatRelativeDate(date, today);
  if (["Today", "Tomorrow", "Yesterday"].includes(day)) {
    return `${day.toLowerCase()}’s ${noun}`;
  }
  if (!/\d/.test(day)) return `${day}’s ${noun}`;
  return `the ${noun} on ${day}`;
}

export type DayEntry = {
  key: string;
  time: string;
  label: string;
  kind: "booking" | "travel" | "blocked" | "free" | "proposal" | "current";
};

export type RescheduleItem = {
  type: "reschedule";
  id: string;
  receivedAt: string;
  receivedLabel: string;
  customer: {
    id: string;
    name: string;
    firstName: string;
    contact: string | null;
  };
  message: { body: string; time: string; dateTime: string } | null;
  headline: string;
  service: { name: string; length: string; buffer: string | null };
  series: string | null;
  current: { day: string; relativeDay: string; time: string };
  bookingId: string;
  requested: {
    short: string;
    long: string;
    date: string;
    day: string;
    earliestTime: string | null;
  };
  proposal: {
    startsAt: string;
    day: string;
    weekday: string;
    weekdayShort: string;
    start: string;
    time: string;
    stillFree: boolean;
    reason: string;
  } | null;
  requestedDay: { label: string; entries: DayEntry[] };
  declineReply: string;
};

export type NoteItem = {
  type: "note";
  id: string;
  category: "reply" | "failed";
  receivedLabel: string;
  customer: { id: string; name: string } | null;
  title: string;
  body: string | null;
};

export type AttentionItem = RescheduleItem | NoteItem;

export async function loadAttention(
  owner: Owner,
  now = new Date(),
): Promise<AttentionItem[]> {
  const tz = owner.business.timeZone;
  const today = dateKeyOf(now, tz);

  const { data, error } = await owner.supabase
    .from("pending_actions")
    .select(
      `id, kind, understood, proposed_starts_at, proposed_ends_at, created_at,
       customer:customers (
         id, full_name,
         links:customer_contacts ( relationship, contact:contacts ( display_name, phone_e164 ) )
       ),
       booking:bookings (
         id, starts_at, ends_at, buffer_minutes, status,
         series:booking_series ( weekday, start_time, interval_weeks ),
         service:services ( name, duration_minutes )
       ),
       message:messages ( body, sent_at )`,
    )
    .eq("business_id", owner.business.id)
    .eq("status", "open")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const items: AttentionItem[] = [];
  for (const row of data) {
    const receivedLabel = formatRelativeDateTime(
      new Date(row.created_at),
      now,
      tz,
    );

    if (row.kind !== "reschedule_request") {
      const understood = (row.understood ?? {}) as Record<string, unknown>;
      items.push({
        type: "note",
        id: row.id,
        category: row.kind === "failure" ? "failed" : "reply",
        receivedLabel,
        customer: row.customer
          ? { id: row.customer.id, name: row.customer.full_name }
          : null,
        title:
          typeof understood.summary === "string"
            ? understood.summary
            : row.kind === "failure"
              ? "Something didn’t go through"
              : "A message needs your reply",
        body: row.message?.body ?? null,
      });
      continue;
    }

    const understanding = readRescheduleUnderstanding(row.understood);
    const booking = row.booking;
    const customer = row.customer;
    if (!understanding || !booking || !customer || !booking.service) continue;

    const startsAt = new Date(booking.starts_at);
    const endsAt = new Date(booking.ends_at);
    const lengthMinutes = minutesBetween(startsAt, endsAt);
    const currentDate = dateKeyOf(startsAt, tz);
    const noun = serviceNoun(booking.service.name);

    // Look at the requested day as it is now, not as it was when the
    // customer asked: the proposal may have been taken since.
    const context = await loadEngineContext(
      owner,
      understanding.preferredDate,
      1,
    );
    const proposedStart = row.proposed_starts_at
      ? new Date(row.proposed_starts_at)
      : null;
    const names = await customerNamesFor(
      owner,
      context.bookings.map((b) => b.id),
    );
    const stillFree = proposedStart
      ? checkSlot(
          context,
          proposedStart,
          {
            durationMinutes: lengthMinutes,
            bufferMinutes: booking.buffer_minutes,
            ignoreBookingId: booking.id,
          },
          { now },
        ).ok
      : false;

    const requestedShort = describeRequestedTime(understanding, today);
    const proposal = proposedStart
      ? {
          startsAt: proposedStart.toISOString(),
          day: formatDate(dateKeyOf(proposedStart, tz)),
          weekday: formatDate(dateKeyOf(proposedStart, tz), "weekday"),
          weekdayShort: formatDate(
            dateKeyOf(proposedStart, tz),
            "weekday-short",
          ),
          start: formatTime(proposedStart, tz),
          time: formatTimeRange(
            proposedStart,
            addMinutes(proposedStart, lengthMinutes),
            tz,
          ),
          stillFree,
          reason: `It’s the first free ${lengthMinutes === 60 ? "hour" : "slot"} ${understanding.earliestTime ? `after ${understanding.earliestTime}` : "that day"}, allowing travel time.`,
        }
      : null;

    items.push({
      type: "reschedule",
      id: row.id,
      receivedAt: row.created_at,
      receivedLabel,
      customer: {
        id: customer.id,
        name: customer.full_name,
        firstName: firstName(customer.full_name),
        contact: describeContact(customer.links as ContactRow[]),
      },
      message: row.message
        ? {
            body: row.message.body,
            time: formatRelativeDateTime(
              new Date(row.message.sent_at),
              now,
              tz,
            ),
            dateTime: row.message.sent_at,
          }
        : null,
      headline: `${customer.full_name} wants to move ${whichBooking(currentDate, today, noun)}`,
      service: {
        name: booking.service.name,
        length: formatDuration(lengthMinutes),
        buffer: booking.buffer_minutes
          ? `${formatDuration(booking.buffer_minutes)} after for travel`
          : null,
      },
      series: booking.series
        ? describeSeries({
            weekday: booking.series.weekday as Weekday,
            startTime: booking.series.start_time,
            intervalWeeks: booking.series.interval_weeks,
          })
        : null,
      current: {
        day: formatDate(currentDate),
        relativeDay: formatRelativeDate(currentDate, today),
        time: formatTimeRange(startsAt, endsAt, tz),
      },
      bookingId: booking.id,
      requested: {
        short: requestedShort,
        long: describeRequestedTimeLong(understanding),
        date: understanding.preferredDate,
        day: formatDate(understanding.preferredDate, "long"),
        earliestTime: understanding.earliestTime,
      },
      proposal,
      requestedDay: {
        label: formatDate(understanding.preferredDate, "long"),
        entries: requestedDayEntries(
          context,
          names,
          understanding.preferredDate,
          booking.id,
          proposedStart,
          lengthMinutes,
          stillFree,
        ),
      },
      declineReply: planRescheduleDecline({
        understanding,
        currentStartsAt: startsAt,
        customerName: customer.full_name,
        serviceName: booking.service.name,
        timeZone: tz,
        today,
      }).replyBody,
    });
  }
  return items;
}

// The requested day at a glance, for the context sheet: other bookings with
// their travel time, blocked time, free time, and the proposal.
async function customerNamesFor(owner: Owner, bookingIds: string[]) {
  if (bookingIds.length === 0) return new Map<string, string>();
  const { data, error } = await owner.supabase
    .from("bookings")
    .select("id, customer:customers ( full_name )")
    .eq("business_id", owner.business.id)
    .in("id", bookingIds);
  if (error) throw error;
  return new Map(data.map((b) => [b.id, b.customer?.full_name ?? "Booked"]));
}

function requestedDayEntries(
  context: Awaited<ReturnType<typeof loadEngineContext>>,
  names: Map<string, string>,
  date: string,
  bookingId: string,
  proposedStart: Date | null,
  lengthMinutes: number,
  stillFree: boolean,
): DayEntry[] {
  const tz = context.timeZone;
  const entries: (DayEntry & { at: number })[] = [];
  const onDay = (d: Date) => dateKeyOf(d, tz) === date;

  for (const b of context.bookings) {
    if (!onDay(b.startsAt)) continue;
    const isThis = b.id === bookingId;
    entries.push({
      key: b.id,
      at: b.startsAt.getTime(),
      time: formatTimeRange(b.startsAt, b.endsAt, tz),
      label: isThis
        ? `${names.get(b.id) ?? "This booking"}, where it is now`
        : (names.get(b.id) ?? "Booked"),
      kind: isThis ? "current" : "booking",
    });
    if (b.bufferMinutes && !isThis) {
      const until = addMinutes(b.endsAt, b.bufferMinutes);
      entries.push({
        key: `${b.id}-travel`,
        at: b.endsAt.getTime(),
        time: formatTimeRange(b.endsAt, until, tz),
        label: "Travel time",
        kind: "travel",
      });
    }
  }
  for (const block of context.blocks) {
    entries.push({
      key: block.id,
      at: block.startsAt.getTime(),
      time: formatTimeRange(block.startsAt, block.endsAt, tz),
      label: "Blocked",
      kind: "blocked",
    });
  }
  if (proposedStart && stillFree) {
    const proposedEnd = addMinutes(proposedStart, lengthMinutes);
    entries.push({
      key: "proposal",
      at: proposedStart.getTime(),
      time: formatTimeRange(proposedStart, proposedEnd, tz),
      label: "Proposed",
      kind: "proposal",
    });
  }
  // Free time, treating the proposal as taken so the two don't overlap.
  const asIfProposed = {
    ...context,
    bookings: [
      ...context.bookings.filter((b) => b.id !== bookingId),
      ...(proposedStart && stillFree
        ? [
            {
              id: "proposal",
              startsAt: proposedStart,
              endsAt: addMinutes(proposedStart, lengthMinutes),
              bufferMinutes: 0,
            },
          ]
        : []),
    ],
  };
  for (const free of freeIntervals(asIfProposed, date)) {
    entries.push({
      key: `free-${free.startsAt.getTime()}`,
      at: free.startsAt.getTime(),
      time: formatTimeRange(free.startsAt, free.endsAt, tz),
      label: "Free",
      kind: "free",
    });
  }
  return entries
    .sort((a, b) => a.at - b.at)
    .map((entry) => ({
      key: entry.key,
      time: entry.time,
      label: entry.label,
      kind: entry.kind,
    }));
}
