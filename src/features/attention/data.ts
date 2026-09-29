import "server-only";
import { checkSlot, freeIntervals } from "@/domain/availability/engine";
import {
  formatPhone,
  type Relationship,
  relationshipLabels,
} from "@/domain/contacts/phone";
import { type ContentType, contentTypes } from "@/domain/channel/inbound";
import { describeNotSent } from "@/domain/channel/not-sent";
import { serviceWindow } from "@/domain/channel/window";
import type { Intent } from "@/domain/messages/interpretation";
import { firstName, serviceNoun } from "@/domain/messages/templates";
import {
  planBookingDecline,
  readBookingUnderstanding,
} from "@/domain/requests/booking";
import {
  planCancellationApproval,
  planCancellationDecline,
  readCancellationUnderstanding,
} from "@/domain/requests/cancellation";
import { describeOwnerTask } from "@/domain/requests/owner-task";
import {
  describeProposalReason,
  describeRequestedTime,
  describeRequestedTimeLong,
  type RequestedTime,
} from "@/domain/requests/requested-time";
import {
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
  clockTimeOf,
  dateKeyOf,
  minutesBetween,
  type Weekday,
} from "@/domain/time/zoned";
import {
  loadAutomation,
  loadEngineContext,
} from "@/features/schedule/engine-context";
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

type Customer = {
  id: string;
  name: string;
  firstName: string;
  contact: string | null;
};

type InboundMessage = { body: string; time: string; dateTime: string };

type ServiceSummary = { name: string; length: string; buffer: string | null };

type Requested = {
  short: string;
  long: string;
  date: string;
  day: string;
  earliestTime: string | null;
};

export type Proposal = {
  startsAt: string;
  day: string;
  weekday: string;
  weekdayShort: string;
  start: string;
  time: string;
  stillFree: boolean;
  reason: string;
};

/**
 * Where a reply to this conversation goes: recorded only (WhatsApp isn't
 * connected, or it came from the simulator), or WhatsApp, where free text
 * is only allowed within 24 hours of their last message.
 */
export type ReplyChannel =
  { kind: "simulated" } | { kind: "whatsapp"; windowOpen: boolean };

type RequestBase = {
  id: string;
  receivedAt: string;
  receivedLabel: string;
  customer: Customer;
  message: InboundMessage | null;
  headline: string;
  channel: ReplyChannel;
};

export type RescheduleItem = RequestBase & {
  type: "reschedule";
  service: ServiceSummary;
  series: string | null;
  current: { day: string; relativeDay: string; time: string };
  bookingId: string;
  requested: Requested;
  proposal: Proposal | null;
  requestedDay: { label: string; entries: DayEntry[] };
  declineReply: string;
};

export type BookingRequestItem = RequestBase & {
  type: "booking";
  service: ServiceSummary & { id: string };
  requested: Requested;
  proposal: Proposal | null;
  requestedDay: { label: string; entries: DayEntry[] };
  declineReply: string;
};

export type CancellationItem = RequestBase & {
  type: "cancellation";
  service: ServiceSummary;
  series: string | null;
  booking: { day: string; time: string; active: boolean };
  /** They may have meant more than this one booking. */
  scopeNote: string | null;
  confirmReply: string | null;
  declineReply: string;
};

/** A request with a time to approve: moving a booking or making one. */
export type TimedRequestItem = RescheduleItem | BookingRequestItem;

export type ReplyItem = {
  type: "reply";
  id: string;
  receivedAt: string;
  receivedLabel: string;
  customer: { id: string; name: string } | null;
  /** Who sent it: a customer's first name, a contact's name or a number. */
  sender: { name: string; detail: string };
  title: string;
  explanation: string | null;
  message: InboundMessage | null;
  draft: string | null;
  channel: ReplyChannel;
};

export type NoteItem = {
  type: "note";
  id: string;
  category: "reply" | "failed";
  receivedLabel: string;
  customer: { id: string; name: string } | null;
  title: string;
  explanation: string | null;
  body: string | null;
};

export type AttentionItem =
  RescheduleItem | BookingRequestItem | CancellationItem | ReplyItem | NoteItem;

export async function loadAttention(
  owner: Owner,
  now = new Date(),
): Promise<AttentionItem[]> {
  const tz = owner.business.timeZone;
  const today = dateKeyOf(now, tz);

  const { data, error } = await owner.supabase
    .from("pending_actions")
    .select(
      `id, kind, understood, proposed_starts_at, proposed_ends_at, created_at, conversation_id,
       customer:customers (
         id, full_name,
         links:customer_contacts ( relationship, contact:contacts ( display_name, phone_e164 ) )
       ),
       booking:bookings (
         id, starts_at, ends_at, buffer_minutes, status,
         series:booking_series ( weekday, start_time, interval_weeks ),
         service:services ( name, duration_minutes )
       ),
       conversation:conversations ( contact:contacts ( display_name, phone_e164 ) ),
       message:messages ( body, sent_at )`,
    )
    .eq("business_id", owner.business.id)
    .eq("status", "open")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const channels = await loadChannels(
    owner,
    data.flatMap((row) => (row.conversation_id ? [row.conversation_id] : [])),
    now,
  );
  const channelOf = (conversationId: string | null): ReplyChannel =>
    (conversationId && channels.get(conversationId)) || { kind: "simulated" };

  const needsServices = data.some((row) => row.kind === "booking_request");
  const services = needsServices ? await loadServices(owner) : new Map();
  const automation = data.some((row) => row.kind === "cancellation_request")
    ? await loadAutomation(owner)
    : null;

  const items: AttentionItem[] = [];
  for (const row of data) {
    const receivedLabel = formatRelativeDateTime(
      new Date(row.created_at),
      now,
      tz,
    );
    const customer = row.customer
      ? {
          id: row.customer.id,
          name: row.customer.full_name,
          firstName: firstName(row.customer.full_name),
          contact: describeContact(row.customer.links as ContactRow[]),
        }
      : null;
    const message = row.message
      ? {
          body: row.message.body,
          time: formatRelativeDateTime(new Date(row.message.sent_at), now, tz),
          dateTime: row.message.sent_at,
        }
      : null;
    const base = {
      id: row.id,
      receivedAt: row.created_at,
      receivedLabel,
      message,
      channel: channelOf(row.conversation_id),
    };

    if (row.kind === "reply_needed") {
      const understood = (row.understood ?? {}) as Record<string, unknown>;
      // Older notes carry their own summary.
      if (typeof understood.summary === "string") {
        items.push(note(row, receivedLabel, understood.summary));
        continue;
      }
      const contact = row.conversation?.contact ?? null;
      const phone = contact ? formatPhone(contact.phone_e164) : null;
      const who =
        customer?.firstName ?? contact?.display_name ?? phone ?? "Someone";
      const draft =
        typeof understood.draft === "string" && understood.draft.trim()
          ? understood.draft
          : null;
      const described = describeOwnerTask({
        reason:
          typeof understood.reason === "string" ? understood.reason : null,
        intent: (understood.intent as Intent | null) ?? null,
        who,
        noun: serviceNoun(services.values().next().value?.name ?? "booking"),
        hasDraft: Boolean(draft),
        contentType: contentTypes.includes(
          understood.content_type as ContentType,
        )
          ? (understood.content_type as ContentType)
          : null,
      });
      items.push({
        type: "reply",
        ...base,
        customer: customer ? { id: customer.id, name: customer.name } : null,
        sender: {
          name:
            customer?.firstName ?? contact?.display_name ?? phone ?? "Unknown",
          detail: customer
            ? (customer.contact ?? customer.name)
            : [contact?.display_name, phone].filter(Boolean).join(" · ") ||
              "Unknown number",
        },
        title: described.title,
        explanation: described.explanation,
        draft,
      });
      continue;
    }

    if (row.kind === "failure") {
      const understood = (row.understood ?? {}) as Record<string, unknown>;
      if (understood.reason === "message_not_sent") {
        const contact = row.conversation?.contact ?? null;
        const described = describeNotSent({
          purpose:
            typeof understood.purpose === "string" ? understood.purpose : null,
          cause: typeof understood.cause === "string" ? understood.cause : null,
          who:
            customer?.firstName ??
            contact?.display_name ??
            (contact ? formatPhone(contact.phone_e164) : "them"),
        });
        items.push({
          ...note(row, receivedLabel, described.title),
          explanation: described.explanation,
        });
      } else {
        items.push(
          note(
            row,
            receivedLabel,
            typeof understood.summary === "string"
              ? understood.summary
              : undefined,
          ),
        );
      }
      continue;
    }
    if (!customer) {
      items.push(note(row, receivedLabel));
      continue;
    }

    if (row.kind === "booking_request") {
      const understanding = readBookingUnderstanding(row.understood);
      const service = understanding
        ? services.get(understanding.serviceId)
        : undefined;
      if (!understanding || !service) {
        items.push(note(row, receivedLabel));
        continue;
      }
      const timed = await timedRequest(owner, {
        requested: understanding,
        proposedStartsAt: row.proposed_starts_at,
        lengthMinutes: service.duration_minutes,
        bufferMinutes: service.buffer_minutes,
        bookingId: null,
        today,
        now,
      });
      items.push({
        type: "booking",
        ...base,
        customer,
        headline: `${customer.name} wants to book a ${serviceNoun(service.name)}`,
        service: {
          id: service.id,
          ...summariseService(
            service.name,
            service.duration_minutes,
            service.buffer_minutes,
          ),
        },
        ...timed,
        declineReply: planBookingDecline({
          understanding,
          customerName: customer.name,
          today,
        }).replyBody,
      });
      continue;
    }

    const booking = row.booking;
    if (!booking?.service) {
      items.push(note(row, receivedLabel));
      continue;
    }
    const startsAt = new Date(booking.starts_at);
    const endsAt = new Date(booking.ends_at);
    const lengthMinutes = minutesBetween(startsAt, endsAt);
    const currentDate = dateKeyOf(startsAt, tz);
    const noun = serviceNoun(booking.service.name);
    const service = summariseService(
      booking.service.name,
      lengthMinutes,
      booking.buffer_minutes,
    );
    const series = booking.series
      ? describeSeries({
          weekday: booking.series.weekday as Weekday,
          startTime: booking.series.start_time,
          intervalWeeks: booking.series.interval_weeks,
        })
      : null;

    if (row.kind === "cancellation_request") {
      const understanding = readCancellationUnderstanding(row.understood);
      if (!understanding) {
        items.push(note(row, receivedLabel));
        continue;
      }
      const facts = {
        customerName: customer.name,
        serviceName: booking.service.name,
        startsAt,
        timeZone: tz,
      };
      items.push({
        type: "cancellation",
        ...base,
        customer,
        headline: `${customer.name} wants to cancel ${whichBooking(currentDate, today, noun)}`,
        service,
        series,
        booking: {
          day: formatDate(currentDate),
          time: formatTimeRange(startsAt, endsAt, tz),
          active: booking.status === "confirmed" && startsAt > now,
        },
        scopeNote:
          understanding.scope === "single" || !series
            ? null
            : `They may mean every ${noun}. Approving cancels this one only; the rest stay booked.`,
        confirmReply: planCancellationApproval({
          ...facts,
          confirmationsEnabled: automation?.confirmationsEnabled ?? true,
        }).replyBody,
        declineReply: planCancellationDecline(facts).replyBody,
      });
      continue;
    }

    const understanding = readRescheduleUnderstanding(row.understood);
    if (!understanding) {
      items.push(note(row, receivedLabel));
      continue;
    }
    const timed = await timedRequest(owner, {
      requested: understanding,
      proposedStartsAt: row.proposed_starts_at,
      lengthMinutes,
      bufferMinutes: booking.buffer_minutes,
      bookingId: booking.id,
      today,
      now,
    });
    items.push({
      type: "reschedule",
      ...base,
      customer,
      headline: `${customer.name} wants to move ${whichBooking(currentDate, today, noun)}`,
      service,
      series,
      current: {
        day: formatDate(currentDate),
        relativeDay: formatRelativeDate(currentDate, today),
        time: formatTimeRange(startsAt, endsAt, tz),
      },
      bookingId: booking.id,
      ...timed,
      declineReply: planRescheduleDecline({
        understanding,
        currentStartsAt: startsAt,
        customerName: customer.name,
        serviceName: booking.service.name,
        timeZone: tz,
        today,
      }).replyBody,
    });
  }
  return items;
}

type Row = {
  id: string;
  kind: string;
  conversation_id: string | null;
  customer: { id: string; full_name: string } | null;
  message: { body: string } | null;
};

function note(row: Row, receivedLabel: string, summary?: string): NoteItem {
  return {
    type: "note",
    id: row.id,
    category: row.kind === "failure" ? "failed" : "reply",
    receivedLabel,
    customer: row.customer
      ? { id: row.customer.id, name: row.customer.full_name }
      : null,
    title:
      summary ??
      (row.kind === "failure"
        ? "Something didn’t go through"
        : "A message needs your reply"),
    explanation: null,
    body: row.message?.body ?? null,
  };
}

/**
 * The reply channel for each conversation: WhatsApp when the business is
 * connected and the conversation's latest message came in on WhatsApp
 * (with the 24-hour window worked out from it), otherwise recorded only.
 */
async function loadChannels(
  owner: Owner,
  conversationIds: string[],
  now: Date,
): Promise<Map<string, ReplyChannel>> {
  const channels = new Map<string, ReplyChannel>();
  if (conversationIds.length === 0) return channels;
  const { data: connection, error } = await owner.supabase
    .from("whatsapp_connections")
    .select("status")
    .eq("business_id", owner.business.id)
    .in("status", ["connected", "needs_attention"])
    .maybeSingle();
  if (error) throw error;
  if (!connection) return channels;

  const { data: inbound, error: inboundError } = await owner.supabase
    .from("messages")
    .select("conversation_id, source, sent_at")
    .eq("business_id", owner.business.id)
    .eq("direction", "inbound")
    .in("conversation_id", [...new Set(conversationIds)])
    .order("sent_at", { ascending: false })
    .limit(1000);
  if (inboundError) throw inboundError;
  const latest = new Map<
    string,
    { source: string; lastWhatsApp: Date | null }
  >();
  for (const m of inbound) {
    const seen = latest.get(m.conversation_id);
    if (!seen) {
      latest.set(m.conversation_id, {
        source: m.source,
        lastWhatsApp: m.source === "whatsapp" ? new Date(m.sent_at) : null,
      });
    } else if (!seen.lastWhatsApp && m.source === "whatsapp") {
      seen.lastWhatsApp = new Date(m.sent_at);
    }
  }
  for (const id of conversationIds) {
    const l = latest.get(id);
    channels.set(
      id,
      !l || l.source === "whatsapp"
        ? {
            kind: "whatsapp",
            windowOpen: serviceWindow(l?.lastWhatsApp ?? null, now).open,
          }
        : { kind: "simulated" },
    );
  }
  return channels;
}

function summariseService(
  name: string,
  lengthMinutes: number,
  bufferMinutes: number,
): ServiceSummary {
  return {
    name,
    length: formatDuration(lengthMinutes),
    buffer: bufferMinutes
      ? `${formatDuration(bufferMinutes)} after for travel`
      : null,
  };
}

async function loadServices(owner: Owner) {
  const { data, error } = await owner.supabase
    .from("services")
    .select("id, name, duration_minutes, buffer_minutes")
    .eq("business_id", owner.business.id);
  if (error) throw error;
  return new Map(data.map((s) => [s.id, s]));
}

/**
 * The asked-for day as it is now, not as it was when the customer asked:
 * the proposal may have been taken since.
 */
async function timedRequest(
  owner: Owner,
  input: {
    requested: RequestedTime;
    proposedStartsAt: string | null;
    lengthMinutes: number;
    bufferMinutes: number;
    bookingId: string | null;
    today: string;
    now: Date;
  },
) {
  const tz = owner.business.timeZone;
  const { requested, lengthMinutes } = input;
  const context = await loadEngineContext(owner, requested.preferredDate, 1);
  const proposedStart = input.proposedStartsAt
    ? new Date(input.proposedStartsAt)
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
          bufferMinutes: input.bufferMinutes,
          ignoreBookingId: input.bookingId ?? undefined,
        },
        { now: input.now },
      ).ok
    : false;

  const proposal: Proposal | null = proposedStart
    ? {
        startsAt: proposedStart.toISOString(),
        day: formatDate(dateKeyOf(proposedStart, tz)),
        weekday: formatDate(dateKeyOf(proposedStart, tz), "weekday"),
        weekdayShort: formatDate(dateKeyOf(proposedStart, tz), "weekday-short"),
        start: formatTime(proposedStart, tz),
        time: formatTimeRange(
          proposedStart,
          addMinutes(proposedStart, lengthMinutes),
          tz,
        ),
        stillFree,
        reason: describeProposalReason(
          requested,
          clockTimeOf(proposedStart, tz),
          lengthMinutes,
        ),
      }
    : null;

  return {
    requested: {
      short: describeRequestedTime(requested, input.today),
      long: describeRequestedTimeLong(requested),
      date: requested.preferredDate,
      day: formatDate(requested.preferredDate, "long"),
      earliestTime: requested.earliestTime,
    },
    proposal,
    requestedDay: {
      label: formatDate(requested.preferredDate, "long"),
      entries: requestedDayEntries(
        context,
        names,
        requested.preferredDate,
        input.bookingId,
        proposedStart,
        lengthMinutes,
        stillFree,
      ),
    },
  };
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
  bookingId: string | null,
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
