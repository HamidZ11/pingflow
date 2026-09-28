"use server";

import { refresh } from "next/cache";
import { reminderLeadOptions } from "@/domain/reminders/policy";
import { requireOwner } from "@/lib/auth/session";
import { type ActionResult, friendlyError } from "@/lib/errors";
import type { Database } from "@/lib/supabase/database.types";

const toggles = {
  reminders: "reminders_enabled",
  confirmations: "confirmations_enabled",
  availability: "availability_replies_enabled",
  bookingTime: "booking_time_replies_enabled",
  cancellations: "cancellation_acknowledgements_enabled",
} as const;

export type AutomationKey = keyof typeof toggles;

export async function setAutomation(
  key: AutomationKey,
  enabled: boolean,
): Promise<ActionResult> {
  const owner = await requireOwner();
  const column = toggles[key];
  if (!column) return { ok: false, error: "Unknown setting." };
  const row: Database["public"]["Tables"]["automation_settings"]["Insert"] = {
    business_id: owner.business.id,
  };
  row[column] = enabled;
  const { error } = await owner.supabase
    .from("automation_settings")
    .upsert(row, { onConflict: "business_id" });
  if (error) return { ok: false, error: friendlyError(error, "setAutomation") };
  refresh();
  return { ok: true };
}

export async function setReminderLead(minutes: number): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!reminderLeadOptions.some((o) => o.minutes === minutes)) {
    return { ok: false, error: "Choose one of the reminder times." };
  }
  const { error } = await owner.supabase
    .from("automation_settings")
    .upsert(
      { business_id: owner.business.id, reminder_lead_minutes: minutes },
      { onConflict: "business_id" },
    );
  if (error)
    return { ok: false, error: friendlyError(error, "setReminderLead") };
  refresh();
  return { ok: true };
}
