import { describe, expect, it } from "vitest";
import { ownerCommand } from "@/domain/owner/command";
import {
  decideOwnerCommand,
  matchCustomers,
  type OwnerDecision,
} from "@/domain/owner/decide";
import { ownerCorpus } from "@/domain/owner/fixtures/corpus";
import { ownerInputFor, ownerWorld, TZ } from "@/domain/owner/fixtures/world";
import { clockTimeOf, dateKeyOf } from "@/domain/time/zoned";

const byId = (id: string) => ownerCorpus.find((c) => c.id === id)!;
const pendingOf = (d: OwnerDecision) => {
  if (!d.clarification || !("set" in d.clarification)) {
    throw new Error("Expected a question");
  }
  return { ...d.clarification.set, messageId: "m-0" };
};
const decide = (id: string) => {
  const c = byId(id);
  return decideOwnerCommand(
    ownerInputFor(c.gold, {
      world: c.world,
      pending: c.pending ? { ...c.pending, messageId: "m-0" } : null,
    }),
  );
};

describe("every owner corpus command reaches the expected outcome", () => {
  it.each(ownerCorpus.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    expect(decide(c.id).outcome).toBe(c.expected.outcome);
  });
});

describe("read-only answers come from the real schedule", () => {
  it("lists tomorrow's bookings", () => {
    expect(decide("sched-1").reply).toBe(
      [
        "Tomorrow:",
        "• 09:00–11:00 — Tom Reid — Two-hour lesson",
        "• 16:00–17:00 — Sarah Khan — Driving lesson",
      ].join("\n"),
    );
  });

  it("shows blocked time, and says when a day is free", () => {
    const wednesday = decideOwnerCommand(
      ownerInputFor(
        ownerCommand({
          intent: "owner_schedule_query",
          date: {
            kind: "weekday",
            weekday: "wednesday",
            week: null,
            day: null,
            month: null,
          },
        }),
      ),
    );
    expect(wednesday.reply).toContain("• 12:00–13:00 — Blocked: Lunch");
    const sunday = decideOwnerCommand(
      ownerInputFor(
        ownerCommand({
          intent: "owner_schedule_query",
          date: {
            kind: "weekday",
            weekday: "sunday",
            week: null,
            day: null,
            month: null,
          },
        }),
      ),
    );
    expect(sunday.reply).toBe("You’re free on Sunday 4 October.");
  });

  it("counts bookings, with the time they take", () => {
    expect(decide("count-1").reply).toBe(
      "You have 2 bookings tomorrow (3 hours).",
    );
  });

  it("answers when a customer is booked", () => {
    expect(decide("who-3").reply).toBe(
      "Omar Ali is booked Friday 2 October at 15:30 for a driving lesson.",
    );
    expect(decide("who-1").reply).toBe(
      [
        "Sarah Khan:",
        "• Tomorrow at 16:00 — Driving lesson",
        "• Tuesday 6 October at 16:00 — Driving lesson",
      ].join("\n"),
    );
  });

  it("says whether a time is free, and why not", () => {
    // 15:00 tomorrow: free until Sarah at 16:00.
    expect(decide("free-1").reply).toBe(
      "Yes — 15:00 tomorrow is free, until 16:00.",
    );
    // 17:00 Friday: Omar's lesson and travel finish at 16:45.
    expect(decide("free-6").reply).toBe(
      "Yes — 17:00 on Friday 2 October is free, until 19:00.",
    );
    const booked = decideOwnerCommand(
      ownerInputFor(
        ownerCommand({
          intent: "owner_availability_query",
          date: {
            kind: "weekday",
            weekday: "friday",
            week: null,
            day: null,
            month: null,
          },
          time: { constraint: "exact", time: "16:00" },
        }),
      ),
    );
    expect(booked.reply).toBe(
      "No — Omar Ali is booked 15:30–16:30 on Friday 2 October.",
    );
    const travel = decideOwnerCommand(
      ownerInputFor(
        ownerCommand({
          intent: "owner_availability_query",
          date: {
            kind: "weekday",
            weekday: "friday",
            week: null,
            day: null,
            month: null,
          },
          time: { constraint: "exact", time: "16:40" },
        }),
      ),
    );
    expect(travel.reply).toBe(
      "No — that’s travel time after Omar Ali’s booking, until 16:45.",
    );
    const evening = decideOwnerCommand(
      ownerInputFor(
        ownerCommand({
          intent: "owner_availability_query",
          date: {
            kind: "tomorrow",
            weekday: null,
            week: null,
            day: null,
            month: null,
          },
          time: { constraint: "exact", time: "20:00" },
        }),
      ),
    );
    expect(evening.reply).toBe(
      "No — 20:00 tomorrow is outside your working hours (09:00–19:00).",
    );
  });

  it("gives useful free windows, not dozens of slots", () => {
    // Friday afternoon: Aisha until 12:30 (+15 travel), Omar 15:30–16:30
    // (+15); the last 15 minutes before 17:00 aren't worth a mention.
    expect(decide("free-3").reply).toBe(
      "Friday 2 October afternoon you’re free 12:45–15:30.",
    );
  });
});

describe("changes happen only when everything is certain", () => {
  it("moves a booking to a free time, with its reminder", () => {
    const d = decide("move-2");
    expect(d.mutation).toMatchObject({
      kind: "reschedule",
      bookingId: "b-sarah-1",
    });
    if (d.mutation?.kind !== "reschedule") throw new Error();
    expect(dateKeyOf(d.mutation.startsAt, TZ)).toBe("2026-10-02");
    expect(clockTimeOf(d.mutation.startsAt, TZ)).toBe("17:00");
    expect(clockTimeOf(d.mutation.reminderSendAt!, TZ)).toBe("17:00");
    expect(d.reply).toBe(
      "Done. Sarah Khan’s driving lesson is now Friday 2 October at 17:00. Sarah hasn’t been messaged.",
    );
    expect(d.conflictReply).toMatch(/Nothing was changed\.$/);
  });

  it("never picks another time itself: it offers real ones", () => {
    const d = decide("move-1");
    expect(d.mutation).toBeNull();
    expect(d.reply).toBe(
      "Friday 2 October at 16:00 isn’t available. That time overlaps another booking. You’re free at 14:00, 17:00 or 18:00.",
    );
    expect(d.clarification).toMatchObject({
      set: { topic: "time", bookingIds: ["b-sarah-1"], date: "2026-10-02" },
    });
  });

  it("asks for a time when none is given", () => {
    expect(decide("move-3")).toMatchObject({
      outcome: "clarify",
      reply:
        "What time on Friday 2 October? You’re free at 09:00, 10:00 or 13:00.",
    });
  });

  it("carries on the same command after the answer", () => {
    const d = decide("move-6");
    expect(d.outcome).toBe("change");
    expect(d.mutation).toMatchObject({
      kind: "reschedule",
      bookingId: "b-sarah-1",
    });
    expect(d.clarification).toEqual({ clear: true });
  });

  it("asks which customer when a name fits more than one", () => {
    const d = decide("who-4");
    expect(d.reply).toBe(
      "I found 2 customers called Sarah: Sarah Khan and Sarah Ahmed. Which one?",
    );
    // …and uses the answer.
    const answered = decideOwnerCommand(
      ownerInputFor(
        ownerCommand({
          intent: "owner_customer_booking_query",
          person: "Sarah Ahmed",
        }),
        {
          world: "two-sarahs",
          pending: pendingOf(d),
        },
      ),
    );
    expect(answered.reply).toBe(
      "Sarah Ahmed is booked Thursday 1 October at 17:00 for a driving lesson.",
    );
  });

  it("asks which booking when two are close together", () => {
    expect(decide("cancel-3").reply).toBe(
      "Which of Priya Shah’s bookings: Thursday 1 October at 10:00 or Monday 5 October at 10:00?",
    );
    expect(decide("move-4").mutation).toBeNull();
  });

  it("asks only once, then hands back to the app", () => {
    const first = decide("cancel-3");
    const still = decideOwnerCommand(
      ownerInputFor(
        ownerCommand({ intent: "owner_unclear", confidence: "low" }),
        {
          pending: pendingOf(first),
        },
      ),
    );
    expect(still).toMatchObject({
      outcome: "refuse",
      reply:
        "I still can’t tell which booking you mean. Please update it in Pingflow.",
      mutation: null,
      clarification: { clear: true },
    });
  });

  it("a new command drops an open question", () => {
    const first = decide("cancel-3");
    const next = decideOwnerCommand(
      ownerInputFor(byId("sched-1").gold, {
        pending: pendingOf(first),
      }),
    );
    expect(next).toMatchObject({
      outcome: "answer",
      clarification: { clear: true },
    });
  });

  it("cancels the one plausible booking", () => {
    expect(decide("cancel-1")).toMatchObject({
      mutation: { kind: "cancel", bookingId: "b-sarah-1" },
      reply:
        "Cancelled Sarah Khan’s driving lesson tomorrow at 16:00. Sarah hasn’t been messaged.",
    });
    expect(decide("cancel-4").mutation).toMatchObject({
      kind: "cancel",
      bookingId: "b-tom-1",
    });
  });

  it("blocks a part of the day, and never over a booking", () => {
    const d = decide("block-1");
    expect(d.reply).toBe("Blocked Thursday 1 October 12:00–17:00.");
    expect(d.mutation).toMatchObject({ kind: "block", label: null });
    expect(decide("block-3").reply).toBe("Blocked tomorrow 14:00–16:00.");
    expect(decide("block-4")).toMatchObject({
      outcome: "refuse",
      mutation: null,
      reply:
        "I can’t block Friday 2 October 15:00–16:00: Omar Ali is booked at 15:30. Nothing was changed.",
    });
  });

  it("refuses a closed day and a start with no end", () => {
    const sunday = decideOwnerCommand(
      ownerInputFor(
        ownerCommand({
          intent: "owner_block_time",
          date: {
            kind: "weekday",
            weekday: "sunday",
            week: null,
            day: null,
            month: null,
          },
          time: { constraint: "afternoon", time: null },
        }),
      ),
    );
    expect(sunday.reply).toBe(
      "You don’t work on Sunday 4 October, so there’s nothing to block.",
    );
    const open = decideOwnerCommand(
      ownerInputFor(
        ownerCommand({
          intent: "owner_block_time",
          date: {
            kind: "tomorrow",
            weekday: null,
            week: null,
            day: null,
            month: null,
          },
          time: { constraint: "exact", time: "14:00" },
        }),
      ),
    );
    expect(open).toMatchObject({
      outcome: "clarify",
      reply: "Until what time?",
    });
  });

  it("a move outside working hours is refused with real alternatives", () => {
    const d = decideOwnerCommand(
      ownerInputFor(
        ownerCommand({
          intent: "owner_reschedule_booking",
          person: "Sarah",
          date: {
            kind: "weekday",
            weekday: "friday",
            week: null,
            day: null,
            month: null,
          },
          time: { constraint: "exact", time: "21:00" },
        }),
      ),
    );
    expect(d.mutation).toBeNull();
    expect(d.reply).toMatch(
      /^Friday 2 October at 21:00 isn’t available\. That’s outside your working hours\. You’re free at/,
    );
  });
});

describe("everything else", () => {
  it("does nothing for thanks, and says what it can't do", () => {
    expect(decide("ack-1")).toMatchObject({
      outcome: "no_action",
      reply: null,
    });
    expect(decide("other-1").reply).toMatch(/^I can’t do that from WhatsApp/);
  });

  it("never guesses when the message couldn't be read", () => {
    expect(decideOwnerCommand(ownerInputFor(null))).toMatchObject({
      outcome: "refuse",
      reply: "I couldn’t process that command. Nothing was changed.",
      mutation: null,
    });
  });

  it("an unknown name is refused, not guessed", () => {
    const d = decideOwnerCommand(
      ownerInputFor(
        ownerCommand({ intent: "owner_cancel_booking", person: "Bethany" }),
      ),
    );
    expect(d).toMatchObject({
      outcome: "refuse",
      reply: "I can’t find a customer called Bethany.",
      mutation: null,
    });
  });
});

describe("matching customer names", () => {
  const customers = ownerWorld("two-sarahs").customers;
  it("prefers the full name and matches whole words", () => {
    expect(matchCustomers(customers, "Sarah").map((c) => c.id)).toEqual([
      "c-sarah",
      "c-sarah-2",
    ]);
    expect(matchCustomers(customers, "sarah khan").map((c) => c.id)).toEqual([
      "c-sarah",
    ]);
    expect(matchCustomers(customers, "Khan").map((c) => c.id)).toEqual([
      "c-sarah",
    ]);
    expect(matchCustomers(customers, "Sar")).toEqual([]);
    expect(matchCustomers(customers, "  ")).toEqual([]);
  });
});
