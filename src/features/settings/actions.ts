"use server";

import { refresh } from "next/cache";
import type { ScheduleMode } from "@/domain/availability/engine";
import {
  hoursToRows,
  isBusinessType,
  validateHours,
  type WeekHours,
} from "@/domain/onboarding/setup";
import {
  parseServiceList,
  toServiceListPayload,
} from "@/domain/services/service-list";
import { requireOwner } from "@/lib/auth/session";
import { type ActionResult, friendlyError } from "@/lib/errors";

export async function updateBusiness(input: {
  name: string;
  businessType: string;
}): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!isBusinessType(input.businessType))
    return { ok: false, error: "Choose what you do." };
  const name = input.name.trim().slice(0, 120) || null;
  const { error } = await owner.supabase
    .from("businesses")
    .update({ name, business_type: input.businessType })
    .eq("id", owner.business.id);
  if (error)
    return { ok: false, error: friendlyError(error, "updateBusiness") };
  refresh();
  return { ok: true, message: "Business details saved." };
}

// Settings → Services: the whole list in one transaction (save_services).
// Removing a service archives it, so past bookings keep their service; a
// service with bookings still to come can't be removed.
export async function saveServices(input: unknown): Promise<ActionResult> {
  const owner = await requireOwner();
  const check = parseServiceList(input);
  if (!check.ok) return { ok: false, error: check.error };

  const { error } = await owner.supabase.rpc("save_services", {
    p_services: toServiceListPayload(check.services),
  });
  if (error) return { ok: false, error: friendlyError(error, "saveServices") };
  refresh();
  return { ok: true, message: "Services saved." };
}

// Settings → Working hours: regular hours (with the weekly pattern) or
// flexible hours. Switching to flexible keeps the weekly pattern stored.
export async function saveSchedule(input: {
  mode: ScheduleMode;
  hours: WeekHours;
}): Promise<ActionResult> {
  const owner = await requireOwner();
  if (input.mode !== "regular" && input.mode !== "flexible") {
    return { ok: false, error: "Choose how you work." };
  }
  const check = validateHours(input.hours);
  const hoursValid = !check.summary && Object.keys(check.errors).length === 0;
  if (input.mode === "regular" && !hoursValid) {
    return { ok: false, error: check.summary ?? "Check your working hours." };
  }

  const { error } = await owner.supabase.rpc("set_schedule", {
    p_mode: input.mode,
    // In flexible mode, an unusable pattern is left as it was.
    p_hours: hoursValid ? hoursToRows(input.hours) : undefined,
  });
  if (error) return { ok: false, error: friendlyError(error, "saveSchedule") };
  refresh();
  return {
    ok: true,
    message:
      input.mode === "flexible"
        ? "Saved. Any time is free unless it’s booked or blocked."
        : "Working hours saved. Existing bookings stay where they are.",
  };
}
