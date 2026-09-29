import "server-only";
import type {
  ScheduleContext,
  WorkingHoursRule,
} from "@/domain/availability/engine";
import type { DateKey } from "@/domain/time/zoned";
import {
  loadAutomationFor,
  loadScheduleContext,
  loadWorkingHoursFor,
} from "@/features/schedule/load-schedule";
import type { Owner } from "@/lib/auth/session";

// The signed-in owner's schedule and settings (see load-schedule.ts). Row
// level security limits every query to the owner's business.

export function loadWorkingHours(owner: Owner): Promise<WorkingHoursRule[]> {
  return loadWorkingHoursFor(owner.supabase, owner.business.id);
}

export function loadEngineContext(
  owner: Owner,
  from: DateKey,
  days: number,
): Promise<ScheduleContext> {
  return loadScheduleContext(owner.supabase, owner.business, from, days);
}

export function loadAutomation(owner: Owner) {
  return loadAutomationFor(owner.supabase, owner.business.id);
}
