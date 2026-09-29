import "server-only";
import {
  formatPhone,
  type Relationship,
  relationshipLabels,
} from "@/domain/contacts/phone";
import { describeSeries } from "@/domain/schedule/series";
import {
  formatDateTime,
  formatDateTimeRange,
  formatRelativeDateTime,
} from "@/domain/time/format";
import { dateKeyOf, type Weekday } from "@/domain/time/zoned";
import type { Owner } from "@/lib/auth/session";

// Customers: who they are, who messages for them, and their bookings. A
// customer receives the service; a contact is the WhatsApp number that
// messages (often the same person, sometimes a parent).

export type CustomerRow = {
  id: string;
  name: string;
  contact: string | null;
  nextBooking: string | null;
  regular: string | null;
  lastMessage: string | null;
  paused: boolean;
  search: string;
};

type Link = {
  relationship: Relationship;
  contact: {
    display_name: string | null;
    phone_e164: string;
    conversations?: {
      id: string;
      last_message_at: string | null;
      automation_paused_at: string | null;
    }[];
  } | null;
};

function contactLine(links: Link[]) {
  const link = links[0];
  if (!link?.contact) return null;
  const phone = formatPhone(link.contact.phone_e164);
  if (link.relationship === "self") return phone;
  return `${link.contact.display_name ?? "Contact"} (${relationshipLabels[link.relationship]}) · ${phone}`;
}

function conversationsOf(links: Link[]) {
  return links.flatMap((l) => l.contact?.conversations ?? []);
}

function activeSeries(
  series: {
    weekday: number;
    start_time: string;
    interval_weeks: number;
    ends_on: string | null;
  }[],
  today: string,
) {
  const live = series.filter((s) => !s.ends_on || s.ends_on >= today);
  return live.length
    ? live
        .map((s) =>
          describeSeries({
            weekday: s.weekday as Weekday,
            startTime: s.start_time,
            intervalWeeks: s.interval_weeks,
          }),
        )
        .join("; ")
    : null;
}

export async function loadCustomers(
  owner: Owner,
  now = new Date(),
): Promise<CustomerRow[]> {
  const tz = owner.business.timeZone;
  const today = dateKeyOf(now, tz);
  const { data, error } = await owner.supabase
    .from("customers")
    .select(
      `id, full_name,
       links:customer_contacts ( relationship,
         contact:contacts ( display_name, phone_e164,
           conversations ( id, last_message_at, automation_paused_at ) ) ),
       bookings ( starts_at, status ),
       series:booking_series ( weekday, start_time, interval_weeks, ends_on )`,
    )
    .eq("business_id", owner.business.id)
    .eq("bookings.status", "confirmed")
    .gt("bookings.starts_at", now.toISOString())
    .order("starts_at", { referencedTable: "bookings", ascending: true })
    .limit(1, { referencedTable: "bookings" })
    .order("full_name");
  if (error) throw error;

  return data.map((c) => {
    const links = (c.links ?? []) as Link[];
    const conversations = conversationsOf(links);
    const last = conversations
      .map((x) => x.last_message_at)
      .filter((x): x is string => Boolean(x))
      .sort()
      .at(-1);
    const next = c.bookings?.[0];
    return {
      id: c.id,
      name: c.full_name,
      contact: contactLine(links),
      nextBooking: next
        ? formatRelativeDateTime(new Date(next.starts_at), now, tz)
        : null,
      regular: activeSeries(c.series ?? [], today),
      lastMessage: last
        ? formatRelativeDateTime(new Date(last), now, tz)
        : null,
      paused: conversations.some((x) => x.automation_paused_at),
      search: [
        c.full_name,
        ...links.map(
          (l) =>
            `${l.contact?.display_name ?? ""} ${l.contact?.phone_e164 ?? ""}`,
        ),
      ]
        .join(" ")
        .toLowerCase(),
    };
  });
}

export type CustomerDetail = Awaited<ReturnType<typeof loadCustomer>>;

export async function loadCustomer(owner: Owner, id: string, now = new Date()) {
  const tz = owner.business.timeZone;
  const today = dateKeyOf(now, tz);
  const { data: c, error } = await owner.supabase
    .from("customers")
    .select(
      `id, full_name, notes, created_at,
       links:customer_contacts ( relationship,
         contact:contacts ( display_name, phone_e164,
           conversations ( id, last_message_at, automation_paused_at ) ) ),
       series:booking_series ( weekday, start_time, interval_weeks, ends_on )`,
    )
    .eq("business_id", owner.business.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!c) return null;

  const links = (c.links ?? []) as Link[];
  const conversations = conversationsOf(links);
  const conversationIds = conversations.map((x) => x.id);

  const [upcoming, past, messages, requests] = await Promise.all([
    owner.supabase
      .from("bookings")
      .select("id, starts_at, ends_at, service:services ( name )")
      .eq("business_id", owner.business.id)
      .eq("customer_id", id)
      .eq("status", "confirmed")
      .gt("ends_at", now.toISOString())
      .order("starts_at")
      .limit(8),
    owner.supabase
      .from("bookings")
      .select("id, starts_at, ends_at, status, service:services ( name )")
      .eq("business_id", owner.business.id)
      .eq("customer_id", id)
      .or(`ends_at.lte.${now.toISOString()},status.eq.cancelled`)
      .order("starts_at", { ascending: false })
      .limit(8),
    conversationIds.length
      ? owner.supabase
          .from("messages")
          .select("id, direction, author, body, delivery, source, sent_at")
          .eq("business_id", owner.business.id)
          .in("conversation_id", conversationIds)
          .order("sent_at", { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [], error: null }),
    owner.supabase
      .from("pending_actions")
      .select("id")
      .eq("business_id", owner.business.id)
      .eq("customer_id", id)
      .eq("status", "open"),
  ]);
  for (const r of [upcoming, past, messages, requests])
    if (r.error) throw r.error;

  const paused = conversations.find((x) => x.automation_paused_at);

  return {
    id: c.id,
    name: c.full_name,
    notes: c.notes,
    contacts: links
      .filter((l) => l.contact)
      .map((l) => ({
        name: l.contact!.display_name ?? c.full_name,
        phone: formatPhone(l.contact!.phone_e164),
        relationship: l.relationship,
        relationshipLabel:
          l.relationship === "self"
            ? "Messages for themselves"
            : `Their ${relationshipLabels[l.relationship]}`,
      })),
    regular: activeSeries(c.series ?? [], today),
    pausedConversationId: paused?.id ?? null,
    pausedSince: paused?.automation_paused_at
      ? formatRelativeDateTime(new Date(paused.automation_paused_at), now, tz)
      : null,
    openRequests: requests.data?.length ?? 0,
    upcoming: (upcoming.data ?? []).map((b) => ({
      id: b.id,
      when: formatDateTimeRange(new Date(b.starts_at), new Date(b.ends_at), tz),
      service: b.service?.name ?? "Booking",
    })),
    past: (past.data ?? []).map((b) => ({
      id: b.id,
      when: formatDateTime(new Date(b.starts_at), tz),
      service: b.service?.name ?? "Booking",
      cancelled: b.status === "cancelled",
    })),
    messages: (messages.data ?? [])
      .slice()
      .reverse()
      .map((m) => ({
        id: m.id,
        direction: m.direction,
        author: m.author,
        body: m.body,
        simulated: m.delivery === "simulated",
        /** Came from the development simulator, not a real WhatsApp message. */
        simulatedInbound: m.direction === "inbound" && m.source === "simulator",
        time: formatRelativeDateTime(new Date(m.sent_at), now, tz),
        dateTime: m.sent_at,
      })),
  };
}
