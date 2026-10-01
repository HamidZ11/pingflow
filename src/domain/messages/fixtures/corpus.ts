import type {
  DateReference,
  Intent,
  Interpretation,
  TimeReference,
  WeekdayName,
} from "@/domain/messages/interpretation";
import { interpretation } from "@/domain/messages/interpretation";
import type {
  OpenRequest,
  Outcome,
  PendingClarification,
} from "@/domain/messages/policy";
import type { Sender, WorldName } from "@/domain/messages/fixtures/world";

// The evaluation corpus: realistic UK WhatsApp messages (casual, with
// typos), each with the interpretation a good interpreter should produce
// ("gold") and the outcome Pingflow should reach. CI uses the gold
// interpretations through the fixture interpreter; `pnpm ai:eval` sends the
// same texts to the real model and compares.

export type EvalCase = {
  id: string;
  text: string;
  sender: Sender;
  world: WorldName;
  /** An open clarifying question this message answers. */
  pending?: Omit<PendingClarification, "messageId" | "customerId"> & {
    originalText: string;
  };
  /** A request of the sender's still waiting for the owner. */
  openRequest?: Omit<OpenRequest, "id" | "customerId"> & {
    originalText: string;
  };
  gold: Interpretation;
  expected: {
    intent: Intent;
    outcome: Outcome;
    /** Checked when set: what an interpreter must get right. */
    date?: {
      kind: NonNullable<DateReference>["kind"];
      weekday?: WeekdayName;
      week?: "this" | "next" | null;
    } | null;
    time?: {
      constraint: NonNullable<TimeReference>["constraint"];
      time?: string | null;
    } | null;
    person?: string | null;
  };
};

export const date = {
  today: { kind: "today", weekday: null, week: null, day: null, month: null },
  tomorrow: {
    kind: "tomorrow",
    weekday: null,
    week: null,
    day: null,
    month: null,
  },
  nextWeek: {
    kind: "next_week",
    weekday: null,
    week: null,
    day: null,
    month: null,
  },
  weekday: (weekday: WeekdayName, week: "this" | "next" | null = null) => ({
    kind: "weekday" as const,
    weekday,
    week,
    day: null,
    month: null,
  }),
} satisfies Record<
  string,
  NonNullable<DateReference> | ((...a: never[]) => NonNullable<DateReference>)
>;

export const time = (
  constraint: NonNullable<TimeReference>["constraint"],
  t: string | null = null,
): NonNullable<TimeReference> => ({ constraint, time: t });

export function c(
  id: string,
  text: string,
  gold: Partial<Interpretation> & Pick<Interpretation, "intent">,
  outcome: Outcome,
  options: Partial<
    Pick<EvalCase, "sender" | "world" | "pending" | "openRequest">
  > & {
    check?: Omit<EvalCase["expected"], "intent" | "outcome">;
  } = {},
): EvalCase {
  const g = interpretation({ short_reason: "fixture", ...gold });
  return {
    id,
    text,
    sender: options.sender ?? "sarah",
    world: options.world ?? "driving",
    pending: options.pending,
    openRequest: options.openRequest,
    gold: g,
    expected: { intent: g.intent, outcome, ...options.check },
  };
}

export const corpus: EvalCase[] = [
  // When is my booking?
  c(
    "next-1",
    "When's my next lesson?",
    {
      intent: "next_booking_query",
      referenced_booking: {
        kind: "next",
        date: null,
        time: null,
        service: "lesson",
      },
    },
    "auto_reply",
  ),
  c(
    "next-2",
    "What time have I got you tomorrow?",
    {
      intent: "next_booking_query",
      referenced_booking: {
        kind: "on_date",
        date: date.tomorrow,
        time: null,
        service: null,
      },
    },
    "auto_reply",
  ),
  c(
    "next-3",
    "when am i booked in mate",
    { intent: "next_booking_query" },
    "auto_reply",
  ),
  c(
    "next-4",
    "wen am i booked",
    { intent: "next_booking_query" },
    "auto_reply",
  ),

  // Availability
  c(
    "avail-1",
    "You free Thursday?",
    { intent: "availability_query", requested_date: date.weekday("thursday") },
    "auto_reply",
    { check: { date: { kind: "weekday", weekday: "thursday" } } },
  ),
  c(
    "avail-2",
    "anything friday aft?",
    {
      intent: "availability_query",
      requested_date: date.weekday("friday"),
      requested_time: time("afternoon"),
    },
    "auto_reply",
    {
      check: {
        date: { kind: "weekday", weekday: "friday" },
        time: { constraint: "afternoon" },
      },
    },
  ),
  c(
    "avail-3",
    "got anything after 4 tomorrow?",
    {
      intent: "availability_query",
      requested_date: date.tomorrow,
      requested_time: time("after", "16:00"),
    },
    "auto_reply",
    {
      check: {
        date: { kind: "tomorrow" },
        time: { constraint: "after", time: "16:00" },
      },
    },
  ),
  c(
    "avail-4",
    "when can u fit me in",
    { intent: "availability_query" },
    "auto_reply",
    { check: { date: null } },
  ),
  c(
    "avail-5",
    "Are you free Thursday afternoon?",
    {
      intent: "availability_query",
      requested_date: date.weekday("thursday"),
      requested_time: time("afternoon"),
    },
    "auto_reply",
    {
      check: {
        date: { kind: "weekday", weekday: "thursday" },
        time: { constraint: "afternoon" },
      },
    },
  ),
  c(
    "avail-6",
    "any chance of something frday morning",
    {
      intent: "availability_query",
      requested_date: date.weekday("friday"),
      requested_time: time("morning"),
    },
    "auto_reply",
    {
      check: {
        date: { kind: "weekday", weekday: "friday" },
        time: { constraint: "morning" },
      },
    },
  ),
  c(
    "avail-7",
    "Anything after 4 Friday?",
    {
      intent: "availability_query",
      requested_date: date.weekday("friday"),
      requested_time: time("after", "16:00"),
    },
    "auto_reply",
    {
      check: {
        date: { kind: "weekday", weekday: "friday" },
        time: { constraint: "after", time: "16:00" },
      },
    },
  ),

  // New bookings
  c(
    "book-1",
    "Can I book Friday at 3?",
    {
      intent: "new_booking_request",
      requested_date: date.weekday("friday"),
      requested_time: time("exact", "15:00"),
    },
    "request_clarification",
    {
      check: {
        date: { kind: "weekday", weekday: "friday" },
        time: { constraint: "exact", time: "15:00" },
      },
    },
  ),
  c(
    "book-2",
    "Any chance I can get a full groom next Tuesday?",
    {
      intent: "new_booking_request",
      requested_date: date.weekday("tuesday", "next"),
      service_reference: "full groom",
    },
    "create_approval",
    {
      sender: "bella",
      world: "groomer",
      check: { date: { kind: "weekday", weekday: "tuesday", week: "next" } },
    },
  ),
  c(
    "book-3",
    "Could I book a two hour lesson Saturday morning?",
    {
      intent: "new_booking_request",
      requested_date: date.weekday("saturday"),
      requested_time: time("morning"),
      service_reference: "two hour lesson",
    },
    "create_approval",
    {
      check: {
        date: { kind: "weekday", weekday: "saturday" },
        time: { constraint: "morning" },
      },
    },
  ),

  // Moving a booking
  c(
    "move-1",
    "Can we move tomorrow's lesson to Friday after 4?",
    {
      intent: "reschedule_request",
      referenced_booking: {
        kind: "on_date",
        date: date.tomorrow,
        time: null,
        service: "lesson",
      },
      requested_date: date.weekday("friday"),
      requested_time: time("after", "16:00"),
    },
    "create_approval",
    {
      check: {
        date: { kind: "weekday", weekday: "friday" },
        time: { constraint: "after", time: "16:00" },
      },
    },
  ),
  c(
    "move-2",
    "Can we move tomorrow to Friday?",
    {
      intent: "reschedule_request",
      referenced_booking: {
        kind: "on_date",
        date: date.tomorrow,
        time: null,
        service: null,
      },
      requested_date: date.weekday("friday"),
    },
    "create_approval",
    { check: { date: { kind: "weekday", weekday: "friday" } } },
  ),
  c(
    "move-3",
    "same lesson but later?",
    {
      intent: "reschedule_request",
      referenced_booking: {
        kind: "next",
        date: null,
        time: null,
        service: "lesson",
      },
      requested_time: time("later"),
      clarification_needed: true,
    },
    "request_clarification",
    { check: { time: { constraint: "later" } } },
  ),
  c(
    "move-4",
    "can u do after 4 instead",
    {
      intent: "reschedule_request",
      referenced_booking: {
        kind: "next",
        date: null,
        time: null,
        service: null,
      },
      requested_time: time("after", "16:00"),
    },
    "create_approval",
    { check: { time: { constraint: "after", time: "16:00" } } },
  ),
  c(
    "move-5",
    "can we rescedule",
    { intent: "reschedule_request", clarification_needed: true },
    "request_clarification",
  ),

  // Cancelling
  c(
    "cancel-1",
    "Need to cancel tomorrow sorry",
    {
      intent: "cancellation_request",
      referenced_booking: {
        kind: "on_date",
        date: date.tomorrow,
        time: null,
        service: null,
      },
      cancellation_scope: "single",
    },
    "create_approval",
  ),
  c(
    "cancel-2",
    "can't make Friday",
    {
      intent: "cancellation_request",
      referenced_booking: {
        kind: "on_date",
        date: date.weekday("friday"),
        time: null,
        service: null,
      },
      cancellation_scope: "single",
    },
    "create_approval",
    { sender: "omar" },
  ),

  // Unclear
  c(
    "unclear-1",
    "Can we do later?",
    {
      intent: "reschedule_request",
      confidence: "medium",
      requested_time: time("later"),
      clarification_needed: true,
    },
    "request_clarification",
  ),
  c(
    "unclear-2",
    "Move it please",
    {
      intent: "reschedule_request",
      confidence: "medium",
      referenced_booking: {
        kind: "next",
        date: null,
        time: null,
        service: null,
      },
      clarification_needed: true,
    },
    "request_clarification",
  ),
  c(
    "unclear-3",
    "what about Friday",
    {
      intent: "unclear",
      confidence: "low",
      requested_date: date.weekday("friday"),
      clarification_needed: true,
    },
    "request_clarification",
  ),

  // Acknowledgements
  c("ack-1", "thanks", { intent: "acknowledgement" }, "no_action"),
  c("ack-2", "perfect mate", { intent: "acknowledgement" }, "no_action"),
  c("ack-3", "👍", { intent: "acknowledgement" }, "no_action"),
  c(
    "ack-4",
    "Cheers, see you then",
    { intent: "acknowledgement" },
    "no_action",
  ),

  // Outside what Pingflow handles
  c(
    "other-1",
    "Can you send me an invoice?",
    { intent: "unsupported" },
    "unsupported",
  ),
  c(
    "other-2",
    "I wasn't happy with my last lesson",
    { intent: "unsupported" },
    "unsupported",
  ),
  c(
    "question-1",
    "How long is a lesson?",
    {
      intent: "simple_business_question",
      business_question_topic: "service_length",
      service_reference: "lesson",
    },
    "owner_reply_task",
  ),
  c(
    "question-2",
    "How much is a two hour lesson?",
    {
      intent: "simple_business_question",
      business_question_topic: "price",
      service_reference: "two hour lesson",
    },
    "owner_reply_task",
  ),
  c(
    "question-3",
    "Do you do gift vouchers?",
    { intent: "simple_business_question", business_question_topic: "other" },
    "owner_reply_task",
  ),

  // Who's asking
  c(
    "privacy-1",
    "When is Sarah booked?",
    { intent: "next_booking_query", person_reference: "Sarah" },
    "privacy_hold",
    { sender: "unknown", check: { person: "Sarah" } },
  ),
  c(
    "privacy-2",
    "Hi, do you have anything free next week?",
    { intent: "availability_query", requested_date: date.nextWeek },
    "owner_reply_task",
    { sender: "unknown", check: { date: { kind: "next_week" } } },
  ),
  c(
    "privacy-3",
    "Can I book a lesson?",
    { intent: "new_booking_request", service_reference: "lesson" },
    "owner_reply_task",
    { sender: "unknown" },
  ),
  c(
    "privacy-4",
    "When is Omar's lesson?",
    { intent: "next_booking_query", person_reference: "Omar" },
    "privacy_hold",
    { check: { person: "Omar" } },
  ),

  // A parent with two learners
  c(
    "parent-1",
    "When is Adam booked?",
    { intent: "next_booking_query", person_reference: "Adam" },
    "auto_reply",
    { sender: "parent", check: { person: "Adam" } },
  ),
  c(
    "parent-2",
    "When is the lesson?",
    { intent: "next_booking_query" },
    "request_clarification",
    { sender: "parent", check: { person: null } },
  ),

  // Answers to a question Pingflow asked
  c(
    "reply-1",
    "Friday",
    {
      intent: "reschedule_request",
      referenced_booking: {
        kind: "next",
        date: null,
        time: null,
        service: null,
      },
      requested_date: date.weekday("friday"),
    },
    "create_approval",
    {
      pending: {
        intent: "reschedule_request",
        topic: "later",
        question: "Do you mean later today, or a different day?",
        turns: 1,
        originalText: "Can we do later?",
      },
      check: { date: { kind: "weekday", weekday: "friday" } },
    },
  ),
  c(
    "reply-2",
    "dunno really",
    { intent: "unclear", confidence: "low" },
    "owner_reply_task",
    {
      pending: {
        intent: "reschedule_request",
        topic: "later",
        question: "Do you mean later today, or a different day?",
        turns: 1,
        originalText: "Can we do later?",
      },
    },
  ),
];
