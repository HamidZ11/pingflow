import type { BookingReference } from "@/domain/messages/interpretation";
import {
  c,
  date,
  type EvalCase,
  time,
} from "@/domain/messages/fixtures/corpus";

// The customer automation corpus: the booking loop end to end (new
// bookings, moves, cancellations, availability, one question then the
// owner, and follow-ups that revise a request still waiting for the owner).
// Same worlds and harness as the main corpus; `pnpm ai:eval --automation`
// sends these texts to the real model.

type Ref = NonNullable<BookingReference>;

const on = (d: Ref["date"]): Ref => ({
  kind: "on_date",
  date: d,
  time: null,
  service: null,
});
const next: Ref = {
  kind: "next",
  date: null,
  time: null,
  service: null,
};
const calendar = (day: number) => ({
  kind: "calendar_date" as const,
  weekday: null,
  week: null,
  day,
  month: null,
});

// Sarah asked to move tomorrow's lesson to Friday after 4; still waiting.
const openMove = {
  kind: "reschedule_request" as const,
  bookingId: "b-sarah-1",
  preferredDate: "2026-10-02",
  serviceId: null,
  originalText: "Can we move tomorrow's lesson to Friday after 4?",
};
// Sarah asked for a new driving lesson on Friday at 5; still waiting.
const openBooking = {
  kind: "booking_request" as const,
  bookingId: null,
  preferredDate: "2026-10-02",
  serviceId: "svc-lesson",
  originalText: "Can I book a driving lesson Friday at 5?",
};

export const automationCorpus: EvalCase[] = [
  // New bookings
  c(
    "ab-book-1",
    "Can I book a driving lesson Friday at 5?",
    {
      intent: "new_booking_request",
      requested_date: date.weekday("friday"),
      requested_time: time("exact", "17:00"),
      service_reference: "driving lesson",
    },
    "create_approval",
    {
      check: {
        date: { kind: "weekday", weekday: "friday" },
        time: { constraint: "exact", time: "17:00" },
      },
    },
  ),
  c(
    "ab-book-2",
    "Can I have a lesson tomorrow afternoon?",
    {
      intent: "new_booking_request",
      requested_date: date.tomorrow,
      requested_time: time("afternoon"),
      service_reference: "lesson",
    },
    "request_clarification",
    {
      check: {
        date: { kind: "tomorrow" },
        time: { constraint: "afternoon" },
      },
    },
  ),
  c(
    "ab-book-3",
    "Any chance of 5pm Thursday for a two hour lesson?",
    {
      intent: "new_booking_request",
      requested_date: date.weekday("thursday"),
      requested_time: time("exact", "17:00"),
      service_reference: "two hour lesson",
    },
    "create_approval",
    {
      check: {
        date: { kind: "weekday", weekday: "thursday" },
        time: { constraint: "exact", time: "17:00" },
      },
    },
  ),
  c(
    "ab-book-4",
    "Can I book a driving lesson next week?",
    {
      intent: "new_booking_request",
      requested_date: date.nextWeek,
      service_reference: "driving lesson",
    },
    "request_clarification",
    { check: { date: { kind: "next_week" } } },
  ),
  c(
    "ab-book-5",
    "Could I book a wash and tidy Wednesday morning?",
    {
      intent: "new_booking_request",
      requested_date: date.weekday("wednesday"),
      requested_time: time("morning"),
      service_reference: "wash and tidy",
    },
    "create_approval",
    {
      sender: "bella",
      world: "groomer",
      check: {
        date: { kind: "weekday", weekday: "wednesday" },
        time: { constraint: "morning" },
      },
    },
  ),
  c(
    "ab-book-6",
    "Hi, can I book a driving lesson on Saturday?",
    {
      intent: "new_booking_request",
      requested_date: date.weekday("saturday"),
      service_reference: "driving lesson",
    },
    "owner_reply_task",
    { sender: "unknown" },
  ),
  c(
    "ab-book-7",
    "can i book in for 6 friday, driving lesson",
    {
      intent: "new_booking_request",
      requested_date: date.weekday("friday"),
      requested_time: time("exact", "18:00"),
      service_reference: "driving lesson",
    },
    "create_approval",
    { check: { time: { constraint: "exact", time: "18:00" } } },
  ),
  c(
    "ab-book-8",
    "Is there any chance I could squeeze in an extra driving lesson this week?",
    {
      intent: "new_booking_request",
      requested_date: {
        kind: "this_week",
        weekday: null,
        week: null,
        day: null,
        month: null,
      },
      service_reference: "driving lesson",
    },
    "request_clarification",
    { check: { date: { kind: "this_week" } } },
  ),

  // Moving a booking
  c(
    "ab-move-1",
    "Can I move Friday to 5?",
    {
      intent: "reschedule_request",
      referenced_booking: on(date.weekday("friday")),
      requested_time: time("exact", "17:00"),
    },
    "create_approval",
    {
      sender: "omar",
      check: { time: { constraint: "exact", time: "17:00" } },
    },
  ),
  c(
    "ab-move-2",
    "Can we do Saturday instead?",
    {
      intent: "reschedule_request",
      referenced_booking: next,
      requested_date: date.weekday("saturday"),
    },
    "create_approval",
    { check: { date: { kind: "weekday", weekday: "saturday" } } },
  ),
  c(
    "ab-move-3",
    "Move my lesson tomorrow please",
    {
      intent: "reschedule_request",
      referenced_booking: { ...on(date.tomorrow), service: "lesson" },
      clarification_needed: true,
    },
    "request_clarification",
  ),
  c(
    "ab-move-4",
    "Can I move my lesson?",
    {
      intent: "reschedule_request",
      referenced_booking: { ...next, kind: "unspecified", service: "lesson" },
      clarification_needed: true,
    },
    "request_clarification",
  ),
  c(
    "ab-move-5",
    "Can I swap my lesson on the 6th to the 8th, same time?",
    {
      intent: "reschedule_request",
      referenced_booking: { ...on(calendar(6)), service: "lesson" },
      requested_date: calendar(8),
      requested_time: time("same_time"),
    },
    "create_approval",
    { check: { time: { constraint: "same_time" } } },
  ),
  c(
    "ab-move-6",
    "can we do earlier tomorrow",
    {
      intent: "reschedule_request",
      referenced_booking: on(date.tomorrow),
      requested_date: date.tomorrow,
      requested_time: time("earlier"),
    },
    "create_approval",
    { check: { time: { constraint: "earlier" } } },
  ),
  c(
    "ab-move-7",
    "Actually 6 would be better",
    {
      intent: "reschedule_request",
      referenced_booking: on(date.tomorrow),
      requested_date: date.weekday("friday"),
      requested_time: time("exact", "18:00"),
    },
    "create_approval",
    {
      openRequest: openMove,
      check: { time: { constraint: "exact", time: "18:00" } },
    },
  ),
  c(
    "ab-move-8",
    "Actually can we make it Saturday morning instead?",
    {
      intent: "reschedule_request",
      referenced_booking: on(date.tomorrow),
      requested_date: date.weekday("saturday"),
      requested_time: time("morning"),
    },
    "create_approval",
    {
      openRequest: openMove,
      check: {
        date: { kind: "weekday", weekday: "saturday" },
        time: { constraint: "morning" },
      },
    },
  ),

  // Cancelling
  c(
    "ab-cancel-1",
    "Can you cancel tomorrow?",
    {
      intent: "cancellation_request",
      referenced_booking: on(date.tomorrow),
      cancellation_scope: "single",
    },
    "create_approval",
  ),
  c(
    "ab-cancel-2",
    "Won't be able to make Friday, sorry mate",
    {
      intent: "cancellation_request",
      referenced_booking: on(date.weekday("friday")),
      cancellation_scope: "single",
    },
    "create_approval",
    { sender: "omar" },
  ),
  c(
    "ab-cancel-3",
    "Cancel my next lesson",
    {
      intent: "cancellation_request",
      referenced_booking: { ...next, service: "lesson" },
      cancellation_scope: "single",
    },
    "create_approval",
  ),
  c(
    "ab-cancel-4",
    "I need to cancel my lesson",
    {
      intent: "cancellation_request",
      referenced_booking: { ...next, kind: "unspecified", service: "lesson" },
      cancellation_scope: "single",
    },
    "request_clarification",
  ),
  c(
    "ab-cancel-5",
    "Leo can't make his lesson on Wednesday",
    {
      intent: "cancellation_request",
      person_reference: "Leo",
      referenced_booking: {
        ...on(date.weekday("wednesday")),
        service: "lesson",
      },
      cancellation_scope: "single",
    },
    "create_approval",
    { sender: "parent", check: { person: "Leo" } },
  ),
  c(
    "ab-cancel-6",
    "Actually just cancel it, sorry",
    {
      intent: "cancellation_request",
      referenced_booking: on(date.tomorrow),
      cancellation_scope: "single",
    },
    "create_approval",
    { openRequest: openMove },
  ),

  // What's free
  c(
    "ab-avail-1",
    "Are you free Friday at 4?",
    {
      intent: "availability_query",
      requested_date: date.weekday("friday"),
      requested_time: time("exact", "16:00"),
    },
    "auto_reply",
    {
      check: {
        date: { kind: "weekday", weekday: "friday" },
        time: { constraint: "exact", time: "16:00" },
      },
    },
  ),
  c(
    "ab-avail-2",
    "Any spaces Thursday afternoon?",
    {
      intent: "availability_query",
      requested_date: date.weekday("thursday"),
      requested_time: time("afternoon"),
    },
    "auto_reply",
    { check: { time: { constraint: "afternoon" } } },
  ),
  c(
    "ab-avail-3",
    "Have you got anything Saturday morning?",
    {
      intent: "availability_query",
      requested_date: date.weekday("saturday"),
      requested_time: time("morning"),
    },
    "auto_reply",
    { check: { date: { kind: "weekday", weekday: "saturday" } } },
  ),
  c(
    "ab-avail-4",
    "what times have you got next week",
    { intent: "availability_query", requested_date: date.nextWeek },
    "auto_reply",
    { check: { date: { kind: "next_week" } } },
  ),
  c(
    "ab-avail-5",
    "Is 10am Wednesday free?",
    {
      intent: "availability_query",
      requested_date: date.weekday("wednesday"),
      requested_time: time("exact", "10:00"),
    },
    "auto_reply",
    { check: { time: { constraint: "exact", time: "10:00" } } },
  ),
  c(
    "ab-avail-6",
    "Are you free Friday at 4?",
    {
      intent: "availability_query",
      requested_date: date.weekday("friday"),
      requested_time: time("exact", "16:00"),
    },
    "owner_reply_task",
    { sender: "unknown" },
  ),
  c(
    "ab-avail-7",
    "when are you free?",
    { intent: "availability_query" },
    "auto_reply",
  ),

  // One question, then the owner
  c(
    "ab-clar-1",
    "Friday works best for me",
    {
      intent: "reschedule_request",
      referenced_booking: { ...next, kind: "unspecified", service: "lesson" },
      requested_date: date.weekday("friday"),
    },
    "create_approval",
    {
      pending: {
        intent: "reschedule_request",
        topic: "date",
        question: "What day would suit you?",
        turns: 1,
        originalText: "Can I move my lesson?",
      },
      check: { date: { kind: "weekday", weekday: "friday" } },
    },
  ),
  c(
    "ab-clar-2",
    "not sure yet tbh",
    { intent: "unclear", confidence: "low" },
    "owner_reply_task",
    {
      pending: {
        intent: "reschedule_request",
        topic: "date",
        question: "What day would suit you?",
        turns: 1,
        originalText: "Can I move my lesson?",
      },
    },
  ),
  c(
    "ab-clar-3",
    "the one tomorrow",
    {
      intent: "cancellation_request",
      referenced_booking: on(date.tomorrow),
      cancellation_scope: "single",
    },
    "create_approval",
    {
      pending: {
        intent: "cancellation_request",
        topic: "booking",
        question:
          "Which driving lesson do you mean: tomorrow at 16:00 or Tuesday 6 October at 16:00?",
        turns: 1,
        originalText: "I need to cancel my lesson",
      },
    },
  ),
  c(
    "ab-clar-4",
    "When's their next lesson?",
    { intent: "next_booking_query", service_reference: "lesson" },
    "request_clarification",
    { sender: "parent", check: { person: null } },
  ),
  c(
    "ab-clar-5",
    "Adam",
    { intent: "next_booking_query", person_reference: "Adam" },
    "auto_reply",
    {
      sender: "parent",
      pending: {
        intent: "next_booking_query",
        topic: "person",
        question: "Is this about Adam or Leo?",
        turns: 1,
        originalText: "When's their next lesson?",
      },
      check: { person: "Adam" },
    },
  ),
  c(
    "ab-clar-6",
    "Can I change my booking",
    {
      intent: "reschedule_request",
      referenced_booking: { ...next, kind: "unspecified" },
      clarification_needed: true,
    },
    "request_clarification",
  ),

  // Follow-ups to a new booking request still waiting for the owner
  c(
    "ab-rev-1",
    "Actually could I do 6 instead?",
    {
      intent: "new_booking_request",
      requested_date: date.weekday("friday"),
      requested_time: time("exact", "18:00"),
      service_reference: "driving lesson",
    },
    "create_approval",
    {
      openRequest: openBooking,
      check: { time: { constraint: "exact", time: "18:00" } },
    },
  ),
  c(
    "ab-rev-2",
    "Sorry, can we make that Saturday morning instead?",
    {
      intent: "new_booking_request",
      requested_date: date.weekday("saturday"),
      requested_time: time("morning"),
      service_reference: "driving lesson",
    },
    "create_approval",
    {
      openRequest: openBooking,
      check: { date: { kind: "weekday", weekday: "saturday" } },
    },
  ),
  c("ab-rev-3", "thanks!", { intent: "acknowledgement" }, "no_action", {
    openRequest: openMove,
  }),
  c(
    "ab-rev-4",
    "When is my next lesson booked for?",
    { intent: "next_booking_query", service_reference: "lesson" },
    "auto_reply",
    { openRequest: openBooking },
  ),
  c(
    "ab-ack-1",
    "Brilliant, thank you",
    { intent: "acknowledgement" },
    "no_action",
  ),
];
