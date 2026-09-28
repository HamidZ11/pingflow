"use server";

import { refresh } from "next/cache";
import { checkSlot } from "@/domain/availability/engine";
import { explainSlotProblem } from "@/domain/availability/explain";
import {
  parsePhone,
  type Relationship,
  relationshipLabels,
} from "@/domain/contacts/phone";
import { firstName, serviceNoun } from "@/domain/messages/templates";
import { reminderSendAt } from "@/domain/reminders/policy";
import { formatDateTime, formatTimeRange } from "@/domain/time/format";
import {
  type ClockTime,
  type DateKey,
  dateKeyOf,
  isClockTime,
  isDateKey,
  minutesBetween,
  minutesOfDay,
  zonedInstant,
} from "@/domain/time/zoned";
import {
  loadAutomation,
  loadEngineContext,
} from "@/features/schedule/engine-context";
import { type Owner, requireOwner } from "@/lib/auth/session";
import { type ActionResult, friendlyError } from "@/lib/errors";

// Schedule changes the owner makes directly. Every change is checked by the
// availability engine first, then applied by one database function so the
// booking, its reminder and the activity record change together.

function parseInstant(value: string): Date | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type NewCustomer = {
  name: string;
  phone: string;
  relationship: Relationship;
  contactName: string;
};

export type BookingResult =
  | { ok: true; message: string }
  | { ok: false; error: string; slotTaken?: boolean };

// Everything both ways of booking need before writing: the service (active
// and this business's), the time checked by the availability engine, and
// the reminder. The database re-checks the time as it writes.
async function prepareBooking(
  owner: Owner,
  input: { serviceId: string; startsAt: string },
) {
  const tz = owner.business.timeZone;
  const startsAt = parseInstant(input.startsAt);
  if (!startsAt) return { ok: false as const, error: "Choose a time first." };

  const [serviceResult, context, automation] = await Promise.all([
    owner.supabase
      .from("services")
      .select("id, name, duration_minutes, buffer_minutes")
      .eq("business_id", owner.business.id)
      .eq("id", input.serviceId)
      .is("archived_at", null)
      .maybeSingle(),
    loadEngineContext(owner, dateKeyOf(startsAt, tz), 1),
    loadAutomation(owner),
  ]);
  const service = serviceResult.data;
  if (!service) return { ok: false as const, error: "Choose a service." };

  const now = new Date();
  const check = checkSlot(
    context,
    startsAt,
    {
      durationMinutes: service.duration_minutes,
      bufferMinutes: service.buffer_minutes,
    },
    { now },
  );
  if (!check.ok) {
    return {
      ok: false as const,
      error: `${formatDateTime(startsAt, tz)} isn’t free any more. ${explainSlotProblem(check.problem)} Choose another time; nothing was saved.`,
      slotTaken: true,
    };
  }
  return {
    ok: true as const,
    service,
    startsAt,
    reminderAt: reminderSendAt(startsAt, automation.reminders, now),
  };
}

function bookingFailure(
  error: { hint?: string | null; code?: string } | null,
  operation: string,
) {
  return {
    ok: false as const,
    error: friendlyError(error, operation),
    slotTaken: error?.hint === "slot_unavailable" || error?.code === "23P01",
  };
}

/** A booking for someone who is already a customer. */
export async function createBooking(input: {
  customerId: string;
  serviceId: string;
  startsAt: string;
}): Promise<BookingResult> {
  const owner = await requireOwner();
  const [prepared, customerResult] = await Promise.all([
    prepareBooking(owner, input),
    owner.supabase
      .from("customers")
      .select("full_name")
      .eq("business_id", owner.business.id)
      .eq("id", input.customerId)
      .maybeSingle(),
  ]);
  if (!prepared.ok) return prepared;
  const customer = customerResult.data;
  if (!customer) return { ok: false, error: "Choose a customer." };

  const { error } = await owner.supabase.rpc("create_booking", {
    p_customer_id: input.customerId,
    p_service_id: prepared.service.id,
    p_starts_at: prepared.startsAt.toISOString(),
    p_reminder_send_at: prepared.reminderAt?.toISOString(),
  });
  if (error) return bookingFailure(error, "createBooking");

  refresh();
  return {
    ok: true,
    message: `${prepared.service.name} booked for ${firstName(customer.full_name)}, ${formatDateTime(prepared.startsAt, owner.business.timeZone)}.`,
  };
}

/**
 * A new customer and their first booking, saved together in one
 * transaction (create_customer_booking): if the time has gone by the time
 * it's saved, the customer isn't saved either.
 */
export async function createCustomerAndBooking(input: {
  customer: NewCustomer;
  serviceId: string;
  startsAt: string;
}): Promise<BookingResult> {
  const owner = await requireOwner();
  const name = input.customer.name.trim();
  if (!name) return { ok: false, error: "Add the customer’s name." };
  if (name.length > 120) {
    return { ok: false, error: "Keep the name under 120 characters." };
  }
  if (!(input.customer.relationship in relationshipLabels)) {
    return { ok: false, error: "Choose who messages you." };
  }
  let phone: string | null = null;
  if (input.customer.phone.trim()) {
    phone = parsePhone(input.customer.phone);
    if (!phone) {
      return { ok: false, error: "That WhatsApp number doesn’t look right." };
    }
  }

  const prepared = await prepareBooking(owner, input);
  if (!prepared.ok) return prepared;

  const { error } = await owner.supabase.rpc("create_customer_booking", {
    p_full_name: name,
    p_service_id: prepared.service.id,
    p_starts_at: prepared.startsAt.toISOString(),
    p_phone_e164: phone ?? undefined,
    p_relationship: input.customer.relationship,
    p_contact_name: input.customer.contactName.trim() || undefined,
    p_reminder_send_at: prepared.reminderAt?.toISOString(),
  });
  if (error) return bookingFailure(error, "createCustomerAndBooking");

  refresh();
  return {
    ok: true,
    message: `${firstName(name)} added and booked in for ${formatDateTime(prepared.startsAt, owner.business.timeZone)}.`,
  };
}

export async function moveBooking(input: {
  bookingId: string;
  startsAt: string;
}): Promise<ActionResult> {
  const owner = await requireOwner();
  const tz = owner.business.timeZone;
  const startsAt = parseInstant(input.startsAt);
  if (!startsAt) return { ok: false, error: "Choose a time first." };

  const { data: booking } = await owner.supabase
    .from("bookings")
    .select(
      "id, starts_at, ends_at, buffer_minutes, status, customer:customers ( full_name ), service:services ( name )",
    )
    .eq("business_id", owner.business.id)
    .eq("id", input.bookingId)
    .maybeSingle();
  if (!booking || booking.status !== "confirmed") {
    return {
      ok: false,
      error: "That booking has been cancelled or no longer exists.",
    };
  }

  const now = new Date();
  const length = minutesBetween(
    new Date(booking.starts_at),
    new Date(booking.ends_at),
  );
  const context = await loadEngineContext(owner, dateKeyOf(startsAt, tz), 1);
  const check = checkSlot(
    context,
    startsAt,
    {
      durationMinutes: length,
      bufferMinutes: booking.buffer_minutes,
      ignoreBookingId: booking.id,
    },
    { now },
  );
  if (!check.ok) {
    return {
      ok: false,
      error: `${formatDateTime(startsAt, tz)} isn’t free. ${explainSlotProblem(check.problem)}`,
    };
  }

  const automation = await loadAutomation(owner);
  const { error } = await owner.supabase.rpc("move_booking", {
    p_booking_id: booking.id,
    p_starts_at: startsAt.toISOString(),
    p_reminder_send_at: reminderSendAt(
      startsAt,
      automation.reminders,
      now,
    )?.toISOString(),
  });
  if (error) return { ok: false, error: friendlyError(error, "moveBooking") };

  refresh();
  const who = booking.customer
    ? `${firstName(booking.customer.full_name)}’s `
    : "";
  return {
    ok: true,
    message: `Moved ${who}${serviceNoun(booking.service?.name ?? "booking")} to ${formatDateTime(startsAt, tz)}.`,
  };
}

export async function cancelBooking(bookingId: string): Promise<ActionResult> {
  const owner = await requireOwner();
  const { error } = await owner.supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
  });
  if (error) return { ok: false, error: friendlyError(error, "cancelBooking") };
  refresh();
  return { ok: true, message: "Booking cancelled. The time is free again." };
}

export async function blockTime(input: {
  date: DateKey;
  start: ClockTime;
  end: ClockTime;
  label: string;
}): Promise<ActionResult> {
  const owner = await requireOwner();
  const tz = owner.business.timeZone;
  if (
    !isDateKey(input.date) ||
    !isClockTime(input.start) ||
    !isClockTime(input.end)
  ) {
    return { ok: false, error: "Choose a day, a start and a finish." };
  }
  if (minutesOfDay(input.end) <= minutesOfDay(input.start)) {
    return { ok: false, error: "Finish after you start." };
  }
  const label = input.label.trim().slice(0, 80);
  const startsAt = zonedInstant(input.date, input.start, tz);
  const endsAt = zonedInstant(input.date, input.end, tz);
  if (endsAt <= new Date()) {
    return { ok: false, error: "That time has already passed." };
  }

  // Blocked time can't hide a booking: move or cancel it first.
  const context = await loadEngineContext(owner, input.date, 1);
  const clash = context.bookings.find(
    (b) => b.startsAt < endsAt && startsAt < b.endsAt,
  );
  if (clash) {
    return {
      ok: false,
      error: `That covers a booking at ${formatTimeRange(clash.startsAt, clash.endsAt, tz)}. Move or cancel it first.`,
    };
  }

  const { error } = await owner.supabase.rpc("add_schedule_block", {
    p_starts_at: startsAt.toISOString(),
    p_ends_at: endsAt.toISOString(),
    p_label: label || undefined,
  });
  if (error) return { ok: false, error: friendlyError(error, "blockTime") };

  refresh();
  return {
    ok: true,
    message: `Blocked ${formatDateTime(startsAt, tz)}–${input.end}. Pingflow won’t offer that time.`,
  };
}

export async function removeBlock(blockId: string): Promise<ActionResult> {
  const owner = await requireOwner();
  const { error } = await owner.supabase.rpc("remove_schedule_block", {
    p_block_id: blockId,
  });
  if (error) return { ok: false, error: friendlyError(error, "removeBlock") };
  refresh();
  return { ok: true, message: "That time is free again." };
}
