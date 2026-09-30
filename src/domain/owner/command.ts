import { z } from "zod";
import {
  clockPattern,
  type DateReference,
  dateOk,
  dateReferenceSchema,
  type TimeReference,
  timeOk,
  timeReferenceSchema,
} from "@/domain/messages/interpretation";

// What the owner's WhatsApp message asks for, as a model reads it. Like a
// customer's message, it is only words turned into fields: which customer,
// which booking, whether a time is free and what may change are all decided
// afterwards, in code (decide.ts).

export const ownerIntents = [
  "owner_schedule_query",
  "owner_customer_booking_query",
  "owner_availability_query",
  "owner_booking_count_query",
  "owner_reschedule_booking",
  "owner_cancel_booking",
  "owner_block_time",
  "owner_acknowledgement",
  "owner_unclear",
  "owner_unsupported",
] as const;

export type OwnerIntent = (typeof ownerIntents)[number];

export const ownerCommandSchema = z.object({
  intent: z.enum(ownerIntents),
  confidence: z.enum(["high", "medium", "low"]),
  date: dateReferenceSchema.describe(
    "The day the command is about: the day to show, count or check, the day to move a booking to, or the day to block.",
  ),
  time: timeReferenceSchema.describe(
    "The time the command is about: the time to check, move to, or start blocking from; or a part of the day.",
  ),
  end_time: z
    .string()
    .nullable()
    .describe('24-hour "HH:MM" end of a range ("2-4" ends 16:00), else null.'),
  duration_minutes: z
    .number()
    .int()
    .nullable()
    .describe('A length given in words ("for an hour" is 60), else null.'),
  person: z
    .string()
    .nullable()
    .describe("A customer's name exactly as written, without possessives."),
  booking_date: dateReferenceSchema.describe(
    'When the booking to move or cancel is now, if the owner says ("Sarah\'s Tuesday lesson").',
  ),
  booking_time: z
    .string()
    .nullable()
    .describe('24-hour "HH:MM" of the booking to move or cancel, if said.'),
  clarification_needed: z.boolean(),
  short_reason: z.string(),
});

export type OwnerCommand = z.infer<typeof ownerCommandSchema>;

export type OwnerCommandIssue =
  | "invalid_date"
  | "invalid_time"
  | "invalid_end_time"
  | "invalid_duration"
  | "invalid_booking_reference";

/**
 * Parses untrusted output; anything that doesn't hold up is blanked so
 * later steps see "missing", never something wrong. Null if it isn't a
 * command at all.
 */
export function checkOwnerCommand(
  value: unknown,
): { command: OwnerCommand; issues: OwnerCommandIssue[] } | null {
  const parsed = ownerCommandSchema.safeParse(value);
  if (!parsed.success) return null;
  const c = { ...parsed.data };
  const issues: OwnerCommandIssue[] = [];
  if (!dateOk(c.date)) {
    issues.push("invalid_date");
    c.date = null;
  }
  if (!timeOk(c.time)) {
    issues.push("invalid_time");
    c.time = null;
  }
  if (c.end_time !== null && !clockPattern.test(c.end_time)) {
    issues.push("invalid_end_time");
    c.end_time = null;
  }
  if (
    c.duration_minutes !== null &&
    (c.duration_minutes < 5 || c.duration_minutes > 24 * 60)
  ) {
    issues.push("invalid_duration");
    c.duration_minutes = null;
  }
  if (
    !dateOk(c.booking_date) ||
    (c.booking_time !== null && !clockPattern.test(c.booking_time))
  ) {
    issues.push("invalid_booking_reference");
    c.booking_date = null;
    c.booking_time = null;
  }
  const person = c.person?.trim();
  c.person = person ? person.slice(0, 80) : null;
  return { command: c, issues };
}

/** A blank command to build fixtures and tests from. */
export function ownerCommand(
  overrides: Partial<OwnerCommand> & Pick<OwnerCommand, "intent">,
): OwnerCommand {
  return {
    confidence: "high",
    date: null,
    time: null,
    end_time: null,
    duration_minutes: null,
    person: null,
    booking_date: null,
    booking_time: null,
    clarification_needed: false,
    short_reason: "test",
    ...overrides,
  };
}

export type { DateReference, TimeReference };
