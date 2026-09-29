import "server-only";
import {
  type ActivityActor,
  type ActivityKind,
  describeActivity,
} from "@/domain/activity/describe";
import { formatPhone } from "@/domain/contacts/phone";
import {
  formatDate,
  formatRelativeDate,
  formatTime,
} from "@/domain/time/format";
import { addMinutes, dateKeyOf } from "@/domain/time/zoned";
import type { Owner } from "@/lib/auth/session";

export type ActivityEntry = {
  id: string;
  time: string;
  dateTime: string;
  actor: ActivityActor;
  text: string;
  quote: string | null;
  simulated: boolean;
  customerId: string | null;
};

export type ActivityDay = {
  date: string;
  label: string;
  entries: ActivityEntry[];
};

export const ACTIVITY_DAYS = 30;

/** "Dana Marsh", or "+44 7700 900111" for a number with no name. */
function contactName(
  contact: { display_name: string | null; phone_e164: string } | null,
) {
  if (!contact) return null;
  return contact.display_name ?? formatPhone(contact.phone_e164);
}

// The audit trail: the last 30 days, newest day first, and within a day in
// the order things happened so a request reads as a story.
export async function loadActivity(
  owner: Owner,
  now = new Date(),
): Promise<ActivityDay[]> {
  const tz = owner.business.timeZone;
  const today = dateKeyOf(now, tz);
  const { data, error } = await owner.supabase
    .from("activity_events")
    .select(
      `id, kind, actor, occurred_at, seq, details, customer_id,
       customer:customers ( full_name ),
       booking:bookings ( service:services ( name ) ),
       message:messages (
         body,
         conversation:conversations ( contact:contacts ( display_name, phone_e164 ) )
       ),
       action:pending_actions (
         conversation:conversations ( contact:contacts ( display_name, phone_e164 ) )
       )`,
    )
    .eq("business_id", owner.business.id)
    .gt("occurred_at", addMinutes(now, -ACTIVITY_DAYS * 24 * 60).toISOString())
    .order("occurred_at", { ascending: false })
    .order("seq", { ascending: false })
    .limit(400);
  if (error) throw error;

  const days = new Map<string, ActivityEntry[]>();
  for (const e of data.slice().reverse()) {
    const occurredAt = new Date(e.occurred_at);
    const line = describeActivity(
      {
        id: e.id,
        kind: e.kind as ActivityKind,
        actor: e.actor,
        occurredAt,
        details: (e.details ?? {}) as Record<string, unknown>,
        customerName: e.customer?.full_name ?? null,
        contactName: contactName(
          e.message?.conversation?.contact ??
            e.action?.conversation?.contact ??
            null,
        ),
        serviceName: e.booking?.service?.name ?? null,
        messageBody: e.message?.body ?? null,
      },
      tz,
    );
    const date = dateKeyOf(occurredAt, tz);
    const list = days.get(date) ?? [];
    list.push({
      id: e.id,
      time: formatTime(occurredAt, tz),
      dateTime: e.occurred_at,
      actor: e.actor,
      text: line.text,
      quote: line.quote,
      simulated: line.simulated,
      customerId: e.customer_id,
    });
    days.set(date, list);
  }

  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, entries]) => {
      const relative = formatRelativeDate(date, today);
      const long = formatDate(date, "long");
      return {
        date,
        label:
          relative === long || !["Today", "Yesterday"].includes(relative)
            ? long
            : `${relative} · ${long}`,
        entries,
      };
    });
}
