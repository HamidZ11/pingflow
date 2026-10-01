import type {
  DateReference,
  TimeReference,
  WeekdayName,
} from "@/domain/messages/interpretation";
import {
  type OwnerCommand,
  ownerCommand,
  type OwnerIntent,
} from "@/domain/owner/command";
import type { OwnerDecision, OwnerPending } from "@/domain/owner/decide";
import type { OwnerWorldName } from "@/domain/owner/fixtures/world";

// Owner commands as an instructor would type them on WhatsApp, each with
// the reading a good interpreter should give ("gold") and what Pingflow
// must then do. The unit tests run the gold readings; `pnpm ai:eval
// --owner` sends the texts to the real model.

export type OwnerEvalCase = {
  id: string;
  text: string;
  world: OwnerWorldName;
  pending?: Omit<OwnerPending, "messageId"> & { originalText: string };
  gold: OwnerCommand;
  expected: {
    intent: OwnerIntent;
    outcome: OwnerDecision["outcome"];
    /** Checked when set. */
    person?: string | null;
  };
};

const day = (weekday: WeekdayName, week: "this" | "next" | null = null) =>
  ({ kind: "weekday", weekday, week, day: null, month: null }) as const;
const rel = (kind: "today" | "tomorrow" | "this_week") =>
  ({ kind, weekday: null, week: null, day: null, month: null }) as const;
const exact = (time: string): TimeReference => ({ constraint: "exact", time });
const part = (
  constraint: "morning" | "afternoon" | "evening",
): TimeReference => ({
  constraint,
  time: null,
});

function c(
  id: string,
  text: string,
  gold: Partial<OwnerCommand> & Pick<OwnerCommand, "intent">,
  outcome: OwnerDecision["outcome"],
  options: {
    world?: OwnerWorldName;
    person?: string | null;
    pending?: OwnerEvalCase["pending"];
  } = {},
): OwnerEvalCase {
  const g = ownerCommand({ short_reason: "fixture", ...gold });
  return {
    id,
    text,
    world: options.world ?? "driving",
    pending: options.pending,
    gold: g,
    expected: {
      intent: g.intent,
      outcome,
      ...(options.person !== undefined ? { person: options.person } : {}),
    },
  };
}

const d = (x: DateReference) => x;

export const ownerCorpus: OwnerEvalCase[] = [
  // What's on
  c(
    "sched-1",
    "Who have I got tomorrow?",
    { intent: "owner_schedule_query", date: d(rel("tomorrow")) },
    "answer",
  ),
  c(
    "sched-2",
    "who've i got tomorrow",
    { intent: "owner_schedule_query", date: d(rel("tomorrow")) },
    "answer",
  ),
  c(
    "sched-3",
    "What have I got Friday?",
    { intent: "owner_schedule_query", date: d(day("friday")) },
    "answer",
  ),
  c(
    "sched-4",
    "whats on friday",
    { intent: "owner_schedule_query", date: d(day("friday")) },
    "answer",
  ),
  c(
    "sched-5",
    "anything on today?",
    { intent: "owner_schedule_query", date: d(rel("today")) },
    "answer",
  ),
  c(
    "sched-6",
    "what does my week look like",
    { intent: "owner_schedule_query", date: d(rel("this_week")) },
    "answer",
  ),

  // How many
  c(
    "count-1",
    "How many lessons have I got tomorrow?",
    { intent: "owner_booking_count_query", date: d(rel("tomorrow")) },
    "answer",
  ),
  c(
    "count-2",
    "how many bookings friday",
    { intent: "owner_booking_count_query", date: d(day("friday")) },
    "answer",
  ),

  // A customer's bookings
  c(
    "who-1",
    "When is Sarah booked?",
    { intent: "owner_customer_booking_query", person: "Sarah" },
    "answer",
    { person: "Sarah" },
  ),
  c(
    "who-2",
    "when have i got sarah",
    { intent: "owner_customer_booking_query", person: "Sarah" },
    "answer",
    { person: "Sarah" },
  ),
  c(
    "who-3",
    "When's Omar's next lesson?",
    { intent: "owner_customer_booking_query", person: "Omar" },
    "answer",
    { person: "Omar" },
  ),
  c(
    "who-4",
    "When is Sarah booked?",
    { intent: "owner_customer_booking_query", person: "Sarah" },
    "clarify",
    { world: "two-sarahs", person: "Sarah" },
  ),

  // Free time
  c(
    "free-1",
    "Am I free at 3 tomorrow?",
    {
      intent: "owner_availability_query",
      date: d(rel("tomorrow")),
      time: exact("15:00"),
    },
    "answer",
  ),
  c(
    "free-2",
    "am i free 3 tomorrow",
    {
      intent: "owner_availability_query",
      date: d(rel("tomorrow")),
      time: exact("15:00"),
    },
    "answer",
  ),
  c(
    "free-3",
    "Am I free Friday afternoon?",
    {
      intent: "owner_availability_query",
      date: d(day("friday")),
      time: part("afternoon"),
    },
    "answer",
  ),
  c(
    "free-4",
    "What's free Thursday?",
    { intent: "owner_availability_query", date: d(day("thursday")) },
    "answer",
  ),
  c(
    "free-5",
    "Am I free at 3?",
    { intent: "owner_availability_query", time: exact("15:00") },
    "answer",
  ),
  c(
    "free-6",
    "am i free friday at 5",
    {
      intent: "owner_availability_query",
      date: d(day("friday")),
      time: exact("17:00"),
    },
    "answer",
  ),

  // Moving a booking
  c(
    "move-1",
    "Move Sarah to Friday at 4",
    {
      intent: "owner_reschedule_booking",
      person: "Sarah",
      date: d(day("friday")),
      time: exact("16:00"),
    },
    "clarify",
    { person: "Sarah" },
  ),
  c(
    "move-2",
    "move sarah friday 5",
    {
      intent: "owner_reschedule_booking",
      person: "Sarah",
      date: d(day("friday")),
      time: exact("17:00"),
    },
    "change",
    { person: "Sarah" },
  ),
  c(
    "move-3",
    "Move Sarah Friday",
    {
      intent: "owner_reschedule_booking",
      person: "Sarah",
      date: d(day("friday")),
      clarification_needed: true,
    },
    "clarify",
    { person: "Sarah" },
  ),
  c(
    "move-4",
    "Can you move Priya to Wednesday at 2",
    {
      intent: "owner_reschedule_booking",
      person: "Priya",
      date: d(day("wednesday")),
      time: exact("14:00"),
    },
    "clarify",
    { person: "Priya" },
  ),
  c(
    "move-5",
    "Move Sarah's Tuesday lesson to Thursday at 11",
    {
      intent: "owner_reschedule_booking",
      person: "Sarah",
      booking_date: d(day("tuesday")),
      date: d(day("thursday")),
      time: exact("11:00"),
    },
    "clarify",
    { person: "Sarah" },
  ),
  c(
    "move-6",
    "5",
    { intent: "owner_reschedule_booking", time: exact("17:00") },
    "change",
    {
      pending: {
        kind: "owner",
        intent: "owner_reschedule_booking",
        topic: "time",
        question:
          "What time on Friday 2 October? You’re free at 14:00, 17:00 or 18:00.",
        turns: 1,
        customerIds: ["c-sarah"],
        bookingIds: ["b-sarah-1"],
        date: "2026-10-02",
        originalText: "Move Sarah Friday",
      },
    },
  ),

  // Cancelling
  c(
    "cancel-1",
    "Cancel Sarah's lesson",
    { intent: "owner_cancel_booking", person: "Sarah" },
    "change",
    { person: "Sarah" },
  ),
  c(
    "cancel-2",
    "cancel sarah",
    { intent: "owner_cancel_booking", person: "Sarah" },
    "change",
    { person: "Sarah" },
  ),
  c(
    "cancel-3",
    "Cancel Priya",
    { intent: "owner_cancel_booking", person: "Priya" },
    "clarify",
    { person: "Priya" },
  ),
  c(
    "cancel-4",
    "cancel tom tomorrow",
    {
      intent: "owner_cancel_booking",
      person: "Tom",
      booking_date: d(rel("tomorrow")),
    },
    "change",
    { person: "Tom" },
  ),

  // Blocking time
  c(
    "block-1",
    "Block Thursday afternoon",
    {
      intent: "owner_block_time",
      date: d(day("thursday")),
      time: part("afternoon"),
    },
    "change",
  ),
  c(
    "block-2",
    "block thursday afternoon",
    {
      intent: "owner_block_time",
      date: d(day("thursday")),
      time: part("afternoon"),
    },
    "change",
  ),
  c(
    "block-3",
    "Block tomorrow 2-4",
    {
      intent: "owner_block_time",
      date: d(rel("tomorrow")),
      time: exact("14:00"),
      end_time: "16:00",
    },
    "change",
  ),
  c(
    "block-4",
    "Block Friday at 3 for an hour",
    {
      intent: "owner_block_time",
      date: d(day("friday")),
      time: exact("15:00"),
      duration_minutes: 60,
    },
    "refuse",
  ),

  // Everything else
  c("ack-1", "thanks", { intent: "owner_acknowledgement" }, "no_action"),
  c("ack-2", "👍", { intent: "owner_acknowledgement" }, "no_action"),
  c(
    "unclear-1",
    "the thing",
    { intent: "owner_unclear", confidence: "low", clarification_needed: true },
    "clarify",
  ),
  c(
    "other-1",
    "Send Sarah an invoice",
    { intent: "owner_unsupported", person: "Sarah" },
    "refuse",
  ),
  c(
    "other-2",
    "Text all my customers that I'm off next week",
    { intent: "owner_unsupported" },
    "refuse",
  ),
];
