import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ScheduleContext,
  ScheduleMode,
  WorkingHoursRule,
} from "@/domain/availability/engine";
import {
  addDays,
  addMinutes,
  type DateKey,
  type Weekday,
  zonedInstant,
} from "@/domain/time/zoned";
import type { Database } from "@/lib/supabase/database.types";

// Loads what the availability engine needs for a stretch of days (working
// hours, confirmed bookings, blocked time) and the automation settings,
// with any client: the signed-in owner's (row level security applies), or
// the server's when processing a customer message. Every query names the
// business explicitly.

type Db = SupabaseClient<Database>;

export type BusinessRef = {
  id: string;
  timeZone: string;
  scheduleMode: ScheduleMode;
};

/** The longest buffer a booking can carry (see the bookings table). */
const MAX_BUFFER_MINUTES = 240;

export async function loadWorkingHoursFor(
  db: Db,
  businessId: string,
): Promise<WorkingHoursRule[]> {
  const { data, error } = await db
    .from("working_hours")
    .select("weekday, start_time, end_time")
    .eq("business_id", businessId)
    .order("weekday")
    .order("start_time");
  if (error) throw error;
  return data.map((row) => ({
    weekday: row.weekday as Weekday,
    start: row.start_time.slice(0, 5),
    end: row.end_time.slice(0, 5),
  }));
}

export async function loadScheduleContext(
  db: Db,
  business: BusinessRef,
  from: DateKey,
  days: number,
): Promise<ScheduleContext> {
  const tz = business.timeZone;
  const start = zonedInstant(from, "00:00", tz);
  const end = zonedInstant(addDays(from, days), "00:00", tz);
  // A booking just before the range can still reach into it with its buffer.
  const reachBack = addMinutes(start, -MAX_BUFFER_MINUTES);

  const [workingHours, bookings, blocks] = await Promise.all([
    loadWorkingHoursFor(db, business.id),
    db
      .from("bookings")
      .select("id, starts_at, ends_at, buffer_minutes")
      .eq("business_id", business.id)
      .eq("status", "confirmed")
      .lt("starts_at", end.toISOString())
      .gt("ends_at", reachBack.toISOString()),
    db
      .from("schedule_blocks")
      .select("id, starts_at, ends_at")
      .eq("business_id", business.id)
      .lt("starts_at", end.toISOString())
      .gt("ends_at", start.toISOString()),
  ]);
  if (bookings.error) throw bookings.error;
  if (blocks.error) throw blocks.error;

  return {
    timeZone: tz,
    mode: business.scheduleMode,
    workingHours,
    bookings: bookings.data.map((b) => ({
      id: b.id,
      startsAt: new Date(b.starts_at),
      endsAt: new Date(b.ends_at),
      bufferMinutes: b.buffer_minutes,
    })),
    blocks: blocks.data.map((b) => ({
      id: b.id,
      startsAt: new Date(b.starts_at),
      endsAt: new Date(b.ends_at),
    })),
  };
}

export async function loadAutomationFor(db: Db, businessId: string) {
  const { data, error } = await db
    .from("automation_settings")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  return {
    confirmationsEnabled: data?.confirmations_enabled ?? true,
    reminders: {
      enabled: data?.reminders_enabled ?? true,
      leadMinutes: data?.reminder_lead_minutes ?? 1440,
    },
    availabilityRepliesEnabled: data?.availability_replies_enabled ?? true,
    bookingTimeRepliesEnabled: data?.booking_time_replies_enabled ?? true,
    cancellationAcknowledgementsEnabled:
      data?.cancellation_acknowledgements_enabled ?? true,
  };
}
