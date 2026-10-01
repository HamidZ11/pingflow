import { z } from "zod";

// What a customer's message appears to mean: the output of the language
// interpreter, and nothing more. It never says what Pingflow should do;
// the decision policy works that out from this plus real business data.
//
// One schema serves two purposes: it becomes the strict JSON Schema the
// model must answer in (Structured Outputs), and it validates whatever
// comes back before anything trusts it. Every field is present in every
// answer (strict mode requires it); fields that don't apply are null.

export const intents = [
  "next_booking_query",
  "availability_query",
  "new_booking_request",
  "reschedule_request",
  "cancellation_request",
  "simple_business_question",
  "acknowledgement",
  "unclear",
  "unsupported",
] as const;

export type Intent = (typeof intents)[number];

const weekday = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

export type WeekdayName = z.infer<typeof weekday>;

export const dateReferenceSchema = z
  .object({
    kind: z
      .enum([
        "today",
        "tomorrow",
        "day_after_tomorrow",
        "weekday",
        "calendar_date",
        "this_week",
        "next_week",
        "later_today",
      ])
      .describe("How the customer referred to the day."),
    weekday: weekday.nullable().describe("For kind weekday."),
    week: z
      .enum(["this", "next"])
      .nullable()
      .describe(
        '"this Friday" is this, "next Friday" is next, plain "Friday" is null.',
      ),
    day: z
      .number()
      .int()
      .nullable()
      .describe("Day of month, for calendar_date."),
    month: z
      .number()
      .int()
      .nullable()
      .describe("Month 1-12, for calendar_date."),
  })
  .nullable();

export type DateReference = z.infer<typeof dateReferenceSchema>;

export const timeConstraints = [
  "exact",
  "around",
  "before",
  "after",
  "morning",
  "afternoon",
  "evening",
  "anytime",
  "same_time",
  "later",
  "earlier",
] as const;

export type TimeConstraint = (typeof timeConstraints)[number];

export const timeReferenceSchema = z
  .object({
    constraint: z.enum(timeConstraints),
    time: z
      .string()
      .nullable()
      .describe(
        '24-hour "HH:MM" for exact, around, before and after; else null.',
      ),
  })
  .nullable();

export type TimeReference = z.infer<typeof timeReferenceSchema>;

export const bookingReferenceSchema = z
  .object({
    kind: z
      .enum(["next", "on_date", "unspecified"])
      .describe("Which existing booking the message is about."),
    date: dateReferenceSchema,
    time: z
      .string()
      .nullable()
      .describe('"HH:MM" if the booking time is mentioned.'),
    service: z.string().nullable(),
  })
  .nullable();

export type BookingReference = z.infer<typeof bookingReferenceSchema>;

export const interpretationSchema = z.object({
  intent: z.enum(intents),
  confidence: z.enum(["high", "medium", "low"]),
  customer_language: z
    .string()
    .nullable()
    .describe('Language of the message as a code, e.g. "en".'),
  person_reference: z
    .string()
    .nullable()
    .describe(
      "A person the message is about, by name (e.g. a child). Null if none.",
    ),
  referenced_booking: bookingReferenceSchema.describe(
    "The existing booking being asked about, moved or cancelled.",
  ),
  requested_date: dateReferenceSchema.describe(
    "The day being asked for or suggested.",
  ),
  requested_time: timeReferenceSchema.describe(
    "The time being asked for or suggested.",
  ),
  service_reference: z
    .string()
    .nullable()
    .describe("A service named in the message, as written."),
  cancellation_scope: z.enum(["single", "all_future", "unclear"]).nullable(),
  business_question_topic: z
    .enum(["service_length", "price", "location", "opening_hours", "other"])
    .nullable(),
  clarification_needed: z
    .boolean()
    .describe(
      "True only if the request can't be acted on without more detail.",
    ),
  clarification_question: z.string().nullable(),
  short_reason: z.string().describe("A few words; no personal details."),
});

export type Interpretation = z.infer<typeof interpretationSchema>;

// ---------------------------------------------------------------------------
// Checking an interpretation
//
// The schema guarantees shape; these checks catch values the schema can't
// express (a "25:99" time, a weekday reference with no weekday). A field
// that fails is treated as missing, never guessed at.
// ---------------------------------------------------------------------------

export const clockPattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export type InterpretationIssue =
  | "invalid_requested_date"
  | "invalid_requested_time"
  | "invalid_booking_reference"
  | "inconsistent_intent";

export function dateOk(ref: DateReference): boolean {
  if (!ref) return true;
  if (ref.kind === "weekday") return ref.weekday !== null;
  if (ref.kind === "calendar_date") {
    return (
      ref.day !== null &&
      ref.month !== null &&
      ref.day >= 1 &&
      ref.day <= 31 &&
      ref.month >= 1 &&
      ref.month <= 12
    );
  }
  return true;
}

export function timeOk(ref: TimeReference): boolean {
  if (!ref) return true;
  const needsTime = ["exact", "around", "before", "after"].includes(
    ref.constraint,
  );
  if (needsTime) return ref.time !== null && clockPattern.test(ref.time);
  return ref.time === null || clockPattern.test(ref.time);
}

export type CheckedInterpretation = {
  interpretation: Interpretation;
  issues: InterpretationIssue[];
};

/**
 * Parses untrusted output and blanks any field that doesn't hold up, so
 * later steps see "missing" rather than something wrong. Returns null if
 * the output isn't an interpretation at all.
 */
export function checkInterpretation(
  value: unknown,
): CheckedInterpretation | null {
  const parsed = interpretationSchema.safeParse(value);
  if (!parsed.success) return null;
  const i = { ...parsed.data };
  const issues: InterpretationIssue[] = [];

  if (!dateOk(i.requested_date)) {
    issues.push("invalid_requested_date");
    i.requested_date = null;
  }
  if (!timeOk(i.requested_time)) {
    issues.push("invalid_requested_time");
    i.requested_time = null;
  }
  if (
    i.referenced_booking &&
    (!dateOk(i.referenced_booking.date) ||
      (i.referenced_booking.time !== null &&
        !clockPattern.test(i.referenced_booking.time)))
  ) {
    issues.push("invalid_booking_reference");
    i.referenced_booking = { ...i.referenced_booking, date: null, time: null };
  }
  if (i.intent === "acknowledgement" && i.clarification_needed) {
    issues.push("inconsistent_intent");
  }
  return { interpretation: i, issues };
}

/** A blank interpretation to build fixtures and tests from. */
export function interpretation(
  overrides: Partial<Interpretation> & Pick<Interpretation, "intent">,
): Interpretation {
  return {
    confidence: "high",
    customer_language: "en",
    person_reference: null,
    referenced_booking: null,
    requested_date: null,
    requested_time: null,
    service_reference: null,
    cancellation_scope: null,
    business_question_topic: null,
    clarification_needed: false,
    clarification_question: null,
    short_reason: "",
    ...overrides,
  };
}
