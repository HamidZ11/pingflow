import type { ScheduleMode } from "@/domain/availability/engine";
import {
  type BusinessType,
  isBusinessType,
  type ServiceDraft,
} from "@/domain/onboarding/business-types";
import { DEFAULT_REMINDER_LEAD_MINUTES } from "@/domain/reminders/policy";
import {
  type ClockTime,
  clockTimeFromMinutes,
  DEFAULT_TIME_ZONE,
  isClockTime,
  minutesOfDay,
  type Weekday,
} from "@/domain/time/zoned";

// What onboarding asks, its defaults, and how answers are checked before they
// become a business. The UI holds a draft; this file decides what's valid.

export {
  type BusinessType,
  businessTypeLabel,
  businessTypes,
  bufferHintFor,
  isBusinessType,
  type ServiceDraft,
  servicePlaceholderFor,
  servicesAfterChoosingType,
  suggestedServicesFor,
} from "@/domain/onboarding/business-types";

export const durationOptions = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240];
export const bufferOptions = [0, 5, 10, 15, 20, 30, 45, 60];

export type DayHours = { open: boolean; start: ClockTime; end: ClockTime };
export type WeekHours = Record<Weekday, DayHours>;

export const weekdays: { weekday: Weekday; label: string; short: string }[] = [
  { weekday: 1, label: "Monday", short: "Mon" },
  { weekday: 2, label: "Tuesday", short: "Tue" },
  { weekday: 3, label: "Wednesday", short: "Wed" },
  { weekday: 4, label: "Thursday", short: "Thu" },
  { weekday: 5, label: "Friday", short: "Fri" },
  { weekday: 6, label: "Saturday", short: "Sat" },
  { weekday: 7, label: "Sunday", short: "Sun" },
];

export function defaultWeekHours(): WeekHours {
  const open = { open: true, start: "09:00", end: "17:00" };
  const closed = { open: false, start: "09:00", end: "17:00" };
  return {
    1: { ...open },
    2: { ...open },
    3: { ...open },
    4: { ...open },
    5: { ...open },
    6: { ...closed },
    7: { ...closed },
  };
}

/** Every half hour of the day, for time pickers: "00:00" … "23:30". */
export const halfHours: ClockTime[] = Array.from({ length: 48 }, (_, i) =>
  clockTimeFromMinutes(i * 30),
);

export type SetupDraft = {
  businessType: BusinessType | null;
  name: string;
  services: ServiceDraft[];
  /** Regular: bookable inside the weekly hours. Flexible: any time that's free. */
  scheduleMode: ScheduleMode;
  /** Kept in flexible mode too, so switching back to regular restores them. */
  hours: WeekHours;
  remindersEnabled: boolean;
  reminderLeadMinutes: number;
  availabilityRepliesEnabled: boolean;
};

export function emptyDraft(): SetupDraft {
  return {
    businessType: null,
    name: "",
    services: [],
    scheduleMode: "regular",
    hours: defaultWeekHours(),
    remindersEnabled: true,
    reminderLeadMinutes: DEFAULT_REMINDER_LEAD_MINUTES,
    availabilityRepliesEnabled: true,
  };
}

export type ServiceErrors = { name?: string }[];

export function validateServices(services: ServiceDraft[]): {
  errors: ServiceErrors;
  summary?: string;
} {
  const errors = services.map((s) => {
    const name = s.name.trim();
    if (!name) return { name: "Give this service a name." };
    if (name.length > 80) return { name: "Keep the name under 80 characters." };
    return {};
  });
  const seen = new Set<string>();
  services.forEach((s, i) => {
    const key = s.name.trim().toLowerCase();
    if (key && seen.has(key) && !errors[i].name) {
      errors[i] = { name: "You already have a service with this name." };
    }
    seen.add(key);
  });
  const summary =
    services.length === 0 ? "Add at least one service." : undefined;
  return { errors, summary };
}

export function validateHours(hours: WeekHours): {
  errors: Partial<Record<Weekday, string>>;
  summary?: string;
} {
  const errors: Partial<Record<Weekday, string>> = {};
  for (const { weekday } of weekdays) {
    const day = hours[weekday];
    if (!day.open) continue;
    if (!isClockTime(day.start) || !isClockTime(day.end)) {
      errors[weekday] = "Choose a start and end time.";
    } else if (minutesOfDay(day.end) <= minutesOfDay(day.start)) {
      errors[weekday] = "Finish after you start.";
    }
  }
  const anyOpen = weekdays.some(({ weekday }) => hours[weekday].open);
  return {
    errors,
    summary: anyOpen ? undefined : "Choose at least one working day.",
  };
}

export function isStepValid(
  step: "type" | "services" | "hours",
  draft: SetupDraft,
) {
  if (step === "type") return draft.businessType !== null;
  if (step === "services") {
    const { errors, summary } = validateServices(draft.services);
    return !summary && errors.every((e) => !e.name);
  }
  if (draft.scheduleMode === "flexible") return true;
  return hoursAreValid(draft.hours);
}

function hoursAreValid(hours: WeekHours) {
  const { errors, summary } = validateHours(hours);
  return !summary && Object.keys(errors).length === 0;
}

/** Open days as rows for the database. */
export function hoursToRows(hours: WeekHours) {
  return weekdays
    .filter(({ weekday }) => hours[weekday].open)
    .map(({ weekday }) => ({
      weekday,
      start_time: hours[weekday].start,
      end_time: hours[weekday].end,
    }));
}

/** The payload `complete_onboarding` takes. */
export function toSetupPayload(draft: SetupDraft) {
  if (!draft.businessType) throw new Error("Business type missing");
  return {
    name: draft.name.trim() || null,
    business_type: draft.businessType,
    timezone: DEFAULT_TIME_ZONE,
    services: draft.services.map((s) => ({
      name: s.name.trim(),
      duration_minutes: s.durationMinutes,
      buffer_minutes: s.bufferMinutes,
    })),
    schedule_mode: draft.scheduleMode,
    // In flexible mode the weekly pattern is only kept if it's a usable one.
    working_hours:
      draft.scheduleMode === "regular" || hoursAreValid(draft.hours)
        ? hoursToRows(draft.hours)
        : [],
    automation: {
      reminders_enabled: draft.remindersEnabled,
      reminder_lead_minutes: draft.reminderLeadMinutes,
      availability_replies_enabled: draft.availabilityRepliesEnabled,
    },
  };
}

/** Server-side check of a submitted draft (the client can't be trusted). */
export function parseSetupDraft(value: unknown): SetupDraft | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<SetupDraft>;
  if (!isBusinessType(v.businessType)) return null;
  if (!Array.isArray(v.services) || v.services.length > 20) return null;
  const services = v.services.map((s) => ({
    name: String(s?.name ?? ""),
    durationMinutes: Number(s?.durationMinutes),
    bufferMinutes: Number(s?.bufferMinutes),
  }));
  if (
    services.some(
      (s) =>
        !durationOptions.includes(s.durationMinutes) ||
        !bufferOptions.includes(s.bufferMinutes),
    )
  ) {
    return null;
  }
  if (!v.hours || typeof v.hours !== "object") return null;
  const hours = defaultWeekHours();
  for (const { weekday } of weekdays) {
    const day = (v.hours as Record<string, DayHours | undefined>)[weekday];
    if (!day) return null;
    hours[weekday] = {
      open: Boolean(day.open),
      start: String(day.start),
      end: String(day.end),
    };
  }
  if (v.scheduleMode !== "regular" && v.scheduleMode !== "flexible") {
    return null;
  }
  const draft: SetupDraft = {
    businessType: v.businessType,
    name: String(v.name ?? "").slice(0, 120),
    services,
    scheduleMode: v.scheduleMode,
    hours,
    remindersEnabled: Boolean(v.remindersEnabled),
    reminderLeadMinutes: [120, 1440, 2880].includes(
      Number(v.reminderLeadMinutes),
    )
      ? Number(v.reminderLeadMinutes)
      : DEFAULT_REMINDER_LEAD_MINUTES,
    availabilityRepliesEnabled: Boolean(v.availabilityRepliesEnabled),
  };
  if (!isStepValid("services", draft) || !isStepValid("hours", draft)) {
    return null;
  }
  return draft;
}
