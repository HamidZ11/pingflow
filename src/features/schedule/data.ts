import "server-only";
import {
  freeIntervals,
  type ScheduleContext,
  type ScheduleMode,
  workingWindows,
} from "@/domain/availability/engine";
import { serviceNoun } from "@/domain/messages/templates";
import {
  describeRequestedTime,
  readRescheduleUnderstanding,
} from "@/domain/requests/reschedule";
import { gridRange, place } from "@/domain/schedule/grid";
import { describeSeries } from "@/domain/schedule/series";
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatRelativeDate,
  formatTimeRange,
  formatWeekRange,
} from "@/domain/time/format";
import {
  addDays,
  addMinutes,
  type DateKey,
  dateKeyOf,
  isDateKey,
  minutesBetween,
  startOfWeek,
  type Weekday,
  zonedInstant,
} from "@/domain/time/zoned";
import { describeContact } from "@/features/attention/data";
import { loadWorkingHours } from "@/features/schedule/engine-context";
import type { Owner } from "@/lib/auth/session";

// The Schedule screen's data: one week around the selected date, laid out
// for the time grid, with every label formatted in the business's zone.

export type ScheduleViewParam = "day" | "week" | null;

export type BookingDetail = {
  id: string;
  date: DateKey;
  customerId: string;
  customerName: string;
  contact: string | null;
  serviceName: string;
  day: string;
  time: string;
  length: string;
  buffer: string | null;
  series: string | null;
  reminder: string | null;
  past: boolean;
  request: { summary: string } | null;
  movedFrom: string | null;
};

export type GridBooking = {
  id: string;
  top: number;
  height: number;
  bufferHeight: number;
  customerName: string;
  serviceName: string;
  time: string;
  past: boolean;
  requested: boolean;
  moved: boolean;
  detail: BookingDetail;
};

export type GridBlock = {
  id: string;
  top: number;
  height: number;
  label: string;
  time: string;
  day: string;
  past: boolean;
};

export type GridFree = {
  key: string;
  top: number;
  height: number;
  time: string;
};

export type GridDay = {
  date: DateKey;
  weekdayShort: string;
  dayOfMonth: string;
  label: string;
  relativeLabel: string;
  isToday: boolean;
  isPast: boolean;
  closed: boolean;
  windows: { top: number; height: number }[];
  hours: string | null;
  bookings: GridBooking[];
  blocks: GridBlock[];
  free: GridFree[];
};

export type ScheduleData = {
  mode: ScheduleMode;
  view: ScheduleViewParam;
  date: DateKey;
  today: DateKey;
  weekStart: DateKey;
  weekLabel: string;
  dayLabel: string;
  range: { start: number; end: number };
  hourLabels: { minute: number; label: string }[];
  days: GridDay[];
  services: { id: string; name: string; length: string }[];
  customers: { id: string; name: string }[];
};

export function parseScheduleParams(params: {
  view?: string | string[];
  date?: string | string[];
}) {
  const view =
    params.view === "day" || params.view === "week" ? params.view : null;
  const date =
    typeof params.date === "string" && isDateKey(params.date)
      ? params.date
      : null;
  return { view, date } as { view: ScheduleViewParam; date: DateKey | null };
}

export async function loadSchedule(
  owner: Owner,
  params: { view: ScheduleViewParam; date: DateKey | null },
  now = new Date(),
): Promise<ScheduleData> {
  const tz = owner.business.timeZone;
  const today = dateKeyOf(now, tz);
  const date = params.date ?? today;
  const weekStart = startOfWeek(date);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = zonedInstant(weekStart, "00:00", tz);
  const to = zonedInstant(addDays(weekStart, 7), "00:00", tz);
  const businessId = owner.business.id;

  const [
    workingHours,
    bookingsResult,
    blocksResult,
    servicesResult,
    customersResult,
    movesResult,
  ] = await Promise.all([
    loadWorkingHours(owner),
    owner.supabase
      .from("bookings")
      .select(
        `id, starts_at, ends_at, buffer_minutes, customer_id,
           customer:customers ( full_name,
             links:customer_contacts ( relationship, contact:contacts ( display_name, phone_e164 ) ) ),
           service:services ( name ),
           series:booking_series ( weekday, start_time, interval_weeks ),
           reminders ( send_at, status ),
           requests:pending_actions ( status, understood )`,
      )
      .eq("business_id", businessId)
      .eq("status", "confirmed")
      .lt("starts_at", to.toISOString())
      .gt("ends_at", from.toISOString())
      .order("starts_at"),
    owner.supabase
      .from("schedule_blocks")
      .select("id, starts_at, ends_at, label")
      .eq("business_id", businessId)
      .lt("starts_at", to.toISOString())
      .gt("ends_at", from.toISOString())
      .order("starts_at"),
    owner.supabase
      .from("services")
      .select("id, name, duration_minutes")
      .eq("business_id", businessId)
      .is("archived_at", null)
      .order("position"),
    owner.supabase
      .from("customers")
      .select("id, full_name")
      .eq("business_id", businessId)
      .order("full_name"),
    owner.supabase
      .from("activity_events")
      .select("booking_id, details, occurred_at")
      .eq("business_id", businessId)
      .eq("kind", "booking_moved")
      .gt("occurred_at", addMinutes(now, -24 * 60).toISOString())
      .order("occurred_at", { ascending: false }),
  ]);
  for (const r of [
    bookingsResult,
    blocksResult,
    servicesResult,
    customersResult,
    movesResult,
  ]) {
    if (r.error) throw r.error;
  }
  const bookings = bookingsResult.data ?? [];
  const blocks = blocksResult.data ?? [];

  const movedFrom = new Map<string, string>();
  for (const move of movesResult.data ?? []) {
    const details = move.details as Record<string, unknown>;
    if (
      move.booking_id &&
      !movedFrom.has(move.booking_id) &&
      typeof details.from_starts_at === "string"
    ) {
      movedFrom.set(
        move.booking_id,
        formatDateTime(new Date(details.from_starts_at), tz),
      );
    }
  }

  const mode = owner.business.scheduleMode;
  const context: ScheduleContext = {
    timeZone: tz,
    mode,
    workingHours,
    bookings: bookings.map((b) => ({
      id: b.id,
      startsAt: new Date(b.starts_at),
      endsAt: new Date(b.ends_at),
      bufferMinutes: b.buffer_minutes,
    })),
    blocks: blocks.map((b) => ({
      id: b.id,
      startsAt: new Date(b.starts_at),
      endsAt: new Date(b.ends_at),
    })),
  };

  const range = gridRange(
    [
      ...dates.flatMap((d) =>
        workingWindows(context, d).map((interval) => ({ date: d, interval })),
      ),
      ...context.bookings.map((b) => ({
        date: dateKeyOf(b.startsAt, tz),
        interval: {
          startsAt: b.startsAt,
          endsAt: addMinutes(b.endsAt, b.bufferMinutes),
        },
      })),
      ...context.blocks.map((b) => ({
        date: dateKeyOf(b.startsAt, tz),
        interval: b,
      })),
    ],
    tz,
    { marginMinutes: mode === "flexible" ? 0 : 60 },
  );

  const days: GridDay[] = dates.map((d) => {
    const windows = workingWindows(context, d);
    const isPast = d < today;
    const dayBookings = bookings.filter(
      (b) => dateKeyOf(new Date(b.starts_at), tz) === d,
    );
    const dayBlocks = blocks.filter(
      (b) => dateKeyOf(new Date(b.starts_at), tz) === d,
    );

    return {
      date: d,
      weekdayShort: formatDate(d, "weekday-short"),
      dayOfMonth: formatDate(d, "day-of-month"),
      label: formatDate(d, "long"),
      relativeLabel: formatRelativeDate(d, today),
      isToday: d === today,
      isPast,
      closed: windows.length === 0,
      windows: windows.map((w) => place(w, d, range, tz)),
      hours:
        mode === "flexible"
          ? "Flexible"
          : windows.length
            ? windows
                .map((w) => formatTimeRange(w.startsAt, w.endsAt, tz))
                .join(", ")
            : null,
      bookings: dayBookings.map((b) => {
        const startsAt = new Date(b.starts_at);
        const endsAt = new Date(b.ends_at);
        const past = endsAt <= now;
        const box = place({ startsAt, endsAt }, d, range, tz);
        const buffer = place(
          { startsAt: endsAt, endsAt: addMinutes(endsAt, b.buffer_minutes) },
          d,
          range,
          tz,
        );
        const openRequest = b.requests?.find((r) => r.status === "open");
        const understanding = openRequest
          ? readRescheduleUnderstanding(openRequest.understood)
          : null;
        const reminder = b.reminders?.find((r) => r.status === "scheduled");
        const serviceName = b.service?.name ?? "Booking";
        const customerName = b.customer?.full_name ?? "Customer";
        return {
          id: b.id,
          top: box.top,
          height: box.height,
          bufferHeight: buffer.height,
          customerName,
          serviceName,
          time: formatTimeRange(startsAt, endsAt, tz),
          past,
          requested: Boolean(openRequest),
          moved: movedFrom.has(b.id),
          detail: {
            id: b.id,
            date: d,
            customerId: b.customer_id,
            customerName,
            contact: describeContact(b.customer?.links),
            serviceName,
            day: formatDate(d, "long"),
            time: formatTimeRange(startsAt, endsAt, tz),
            length: formatDuration(minutesBetween(startsAt, endsAt)),
            buffer: b.buffer_minutes
              ? `${formatDuration(b.buffer_minutes)} after for travel`
              : null,
            series: b.series
              ? describeSeries({
                  weekday: b.series.weekday as Weekday,
                  startTime: b.series.start_time,
                  intervalWeeks: b.series.interval_weeks,
                })
              : null,
            reminder: reminder
              ? formatDateTime(new Date(reminder.send_at), tz)
              : null,
            past,
            request: openRequest
              ? {
                  summary: understanding
                    ? `${customerName.split(" ")[0]} asked to move this ${serviceNoun(serviceName)} to ${describeRequestedTime(understanding, today, { inSentence: true })}.`
                    : `${customerName.split(" ")[0]} asked to change this booking.`,
                }
              : null,
            movedFrom: movedFrom.get(b.id) ?? null,
          },
        };
      }),
      blocks: dayBlocks.map((b) => {
        const startsAt = new Date(b.starts_at);
        const endsAt = new Date(b.ends_at);
        return {
          id: b.id,
          ...place({ startsAt, endsAt }, d, range, tz),
          label: b.label ?? "Blocked",
          time: formatTimeRange(startsAt, endsAt, tz),
          day: formatDate(d, "long"),
          past: endsAt <= now,
        };
      }),
      // Free time only matters from now on. A flexible schedule is free
      // unless something is in it, so it isn't outlined there.
      free:
        isPast || mode === "flexible"
          ? []
          : freeIntervals(context, d)
              .map((f) =>
                d === today && f.startsAt < now
                  ? { ...f, startsAt: nextHalfHour(now) }
                  : f,
              )
              .filter((f) => minutesBetween(f.startsAt, f.endsAt) >= 30)
              .map((f) => ({
                key: `${d}-${f.startsAt.getTime()}`,
                ...place(f, d, range, tz),
                time: formatTimeRange(f.startsAt, f.endsAt, tz),
              })),
    };
  });

  const hourLabels = [];
  for (let m = range.start; m <= range.end; m += 60) {
    hourLabels.push({
      minute: m - range.start,
      label: `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:00`,
    });
  }

  return {
    mode,
    view: params.view,
    date,
    today,
    weekStart,
    weekLabel: formatWeekRange(weekStart),
    dayLabel: formatDate(date, "long"),
    range,
    hourLabels,
    days,
    services: (servicesResult.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      length: formatDuration(s.duration_minutes),
    })),
    customers: (customersResult.data ?? []).map((c) => ({
      id: c.id,
      name: c.full_name,
    })),
  };
}

function nextHalfHour(now: Date) {
  const d = new Date(now);
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  d.setMinutes(m < 30 ? 30 : 60);
  return d;
}
