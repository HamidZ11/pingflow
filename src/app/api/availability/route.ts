import { type NextRequest, NextResponse } from "next/server";
import { availableDays } from "@/domain/availability/engine";
import {
  formatDate,
  formatDuration,
  formatRelativeDate,
  formatTime,
} from "@/domain/time/format";
import { dateKeyOf, isDateKey, minutesBetween } from "@/domain/time/zoned";
import type { AvailabilityResponse } from "@/features/schedule/availability";
import { loadEngineContext } from "@/features/schedule/engine-context";
import { getOwner } from "@/lib/auth/session";

// GET /api/availability?from=2026-10-02&days=7&service=<id>
// GET /api/availability?from=2026-10-02&days=7&booking=<id>   (moving a booking)
//
// Free start times from the availability engine, for the time pickers in
// Schedule and Attention. A booking being moved keeps its own length and
// buffer, and doesn't count against itself.
export async function GET(request: NextRequest) {
  const owner = await getOwner();
  if (!owner) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const tz = owner.business.timeZone;

  const params = request.nextUrl.searchParams;
  const from = params.get("from") ?? "";
  const days = Math.min(Math.max(Number(params.get("days") ?? 1), 1), 14);
  const serviceId = params.get("service");
  const bookingId = params.get("booking");
  if (!isDateKey(from) || (!serviceId && !bookingId)) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  let durationMinutes: number;
  let bufferMinutes: number;
  if (bookingId) {
    const { data } = await owner.supabase
      .from("bookings")
      .select("starts_at, ends_at, buffer_minutes")
      .eq("business_id", owner.business.id)
      .eq("id", bookingId)
      .maybeSingle();
    if (!data) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    durationMinutes = minutesBetween(
      new Date(data.starts_at),
      new Date(data.ends_at),
    );
    bufferMinutes = data.buffer_minutes;
  } else {
    const { data } = await owner.supabase
      .from("services")
      .select("duration_minutes, buffer_minutes")
      .eq("business_id", owner.business.id)
      .eq("id", serviceId!)
      .maybeSingle();
    if (!data) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    durationMinutes = data.duration_minutes;
    bufferMinutes = data.buffer_minutes;
  }

  const now = new Date();
  const today = dateKeyOf(now, tz);
  const context = await loadEngineContext(owner, from, days);
  const result = availableDays(
    context,
    from,
    days,
    {
      durationMinutes,
      bufferMinutes,
      ignoreBookingId: bookingId ?? undefined,
    },
    { now },
  );

  const body: AvailabilityResponse = {
    fitFor: bufferMinutes
      ? `${formatDuration(durationMinutes)}, with ${formatDuration(bufferMinutes)} travel after`
      : formatDuration(durationMinutes),
    days: result.map((day) => ({
      date: day.date,
      label: formatDate(day.date),
      relativeLabel: formatRelativeDate(day.date, today),
      slots: day.slots.map((slot) => ({
        startsAt: slot.startsAt.toISOString(),
        time: formatTime(slot.startsAt, tz),
      })),
    })),
  };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
