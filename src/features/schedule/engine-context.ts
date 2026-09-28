import "server-only";
import type {
  ScheduleContext,
  WorkingHoursRule,
} from "@/domain/availability/engine";
import {
  addDays,
  addMinutes,
  type DateKey,
  type Weekday,
  zonedInstant,
} from "@/domain/time/zoned";
import type { Owner } from "@/lib/auth/session";

// Loads what the availability engine needs for a stretch of days: working
// hours, confirmed bookings and blocked time. Row level security limits every
// query to the owner's business; the business filter states it explicitly.

/** The longest buffer a booking can carry (see the bookings table). */
const MAX_BUFFER_MINUTES = 240;

export async function loadWorkingHours(
  owner: Owner,
): Promise<WorkingHoursRule[]> {
  const { data, error } = await owner.supabase
    .from("working_hours")
    .select("weekday, start_time, end_time")
    .eq("business_id", owner.business.id)
    .order("weekday")
    .order("start_time");
  if (error) throw error;
  return data.map((row) => ({
    weekday: row.weekday as Weekday,
    start: row.start_time.slice(0, 5),
    end: row.end_time.slice(0, 5),
  }));
}

export async function loadEngineContext(
  owner: Owner,
  from: DateKey,
  days: number,
): Promise<ScheduleContext> {
  const tz = owner.business.timeZone;
  const start = zonedInstant(from, "00:00", tz);
  const end = zonedInstant(addDays(from, days), "00:00", tz);
  // A booking just before the range can still reach into it with its buffer.
  const reachBack = addMinutes(start, -MAX_BUFFER_MINUTES);

  const [workingHours, bookings, blocks] = await Promise.all([
    loadWorkingHours(owner),
    owner.supabase
      .from("bookings")
      .select("id, starts_at, ends_at, buffer_minutes")
      .eq("business_id", owner.business.id)
      .eq("status", "confirmed")
      .lt("starts_at", end.toISOString())
      .gt("ends_at", reachBack.toISOString()),
    owner.supabase
      .from("schedule_blocks")
      .select("id, starts_at, ends_at")
      .eq("business_id", owner.business.id)
      .lt("starts_at", end.toISOString())
      .gt("ends_at", start.toISOString()),
  ]);
  if (bookings.error) throw bookings.error;
  if (blocks.error) throw blocks.error;

  return {
    timeZone: tz,
    mode: owner.business.scheduleMode,
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

export async function loadAutomation(owner: Owner) {
  const { data, error } = await owner.supabase
    .from("automation_settings")
    .select("*")
    .eq("business_id", owner.business.id)
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
