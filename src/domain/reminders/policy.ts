import { addMinutes } from "@/domain/time/zoned";

export type ReminderSettings = {
  enabled: boolean;
  /** How long before the appointment the reminder goes out. */
  leadMinutes: number;
};

/** The reminder timings an owner can choose from. */
export const reminderLeadOptions = [
  { minutes: 1440, label: "1 day before" },
  { minutes: 120, label: "2 hours before" },
  { minutes: 2880, label: "2 days before" },
] as const;

export const DEFAULT_REMINDER_LEAD_MINUTES = 1440;

/**
 * When a booking's reminder should go out, or null for no reminder:
 * reminders are off, or it is already too late to send one on time.
 */
export function reminderSendAt(
  startsAt: Date,
  settings: ReminderSettings,
  now: Date,
): Date | null {
  if (!settings.enabled) return null;
  const sendAt = addMinutes(startsAt, -settings.leadMinutes);
  return sendAt > now ? sendAt : null;
}
