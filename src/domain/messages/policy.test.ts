import { describe, expect, it } from "vitest";
import { corpus } from "@/domain/messages/fixtures/corpus";
import {
  interpreterRequestFor,
  policyInputFor,
  scoreCase,
} from "@/domain/messages/fixtures/harness";
import { NOW, TZ, worlds } from "@/domain/messages/fixtures/world";
import { interpretation } from "@/domain/messages/interpretation";
import { decide } from "@/domain/messages/policy";
import { clockTimeOf, dateKeyOf } from "@/domain/time/zoned";
import { FixtureMessageInterpreter } from "@/lib/ai/fixture-interpreter";

const inputFor = policyInputFor;

const sarah = { sender: "sarah", world: "driving" } as const;
const byId = (id: string) => corpus.find((c) => c.id === id)!;

describe("every corpus message reaches the expected outcome", () => {
  it.each(corpus.map((c) => [c.id, c] as const))("%s", (_id, testCase) => {
    const decision = decide(inputFor(testCase, testCase.gold));
    expect(decision.outcome).toBe(testCase.expected.outcome);
  });
});

describe("automatic answers use real data", () => {
  it("answers when the next lesson is, from the actual booking", () => {
    const d = decide(inputFor(sarah, byId("next-1").gold));
    expect(d.outcome).toBe("auto_reply");
    expect(d.reply?.body).toBe(
      "Your next driving lesson is tomorrow at 16:00.",
    );
    expect(d.approval).toBeNull();
    expect(d.ownerTask).toBeNull();
  });

  it("offers at most three real, non-overlapping free times", () => {
    const d = decide(inputFor(sarah, byId("avail-7").gold));
    // Friday: Omar 15:30–16:30 plus travel, so after 16:00 the first free
    // time is 17:00, then 18:00 (one lesson apart).
    expect(d.reply?.body).toBe("I’ve got 17:00 or 18:00 free on Friday.");
    const afternoon = decide(inputFor(sarah, byId("avail-5").gold));
    expect(afternoon.reply?.body).toMatch(
      /^I’ve got \d\d:\d\d, \d\d:\d\d or \d\d:\d\d free on Thursday\.$/,
    );
  });

  it("says so when nothing is free, without inventing times", () => {
    const booked = interpretation({
      intent: "availability_query",
      requested_date: {
        kind: "weekday",
        weekday: "sunday",
        week: null,
        day: null,
        month: null,
      },
    });
    const d = decide(inputFor(sarah, booked));
    expect(d.reply?.body).toBe("I don’t have anything free on Sunday.");
  });

  it("answers an exact time directly", () => {
    const at3 = interpretation({
      intent: "availability_query",
      requested_date: {
        kind: "weekday",
        weekday: "friday",
        week: null,
        day: null,
        month: null,
      },
      requested_time: { constraint: "exact", time: "15:30" },
    });
    const d = decide(inputFor(sarah, at3));
    expect(d.reply?.body).toMatch(/^15:30 isn’t free on Friday, but I’ve got/);
  });
});

describe("the owner's automation settings are respected", () => {
  it("“When is my booking?” replies off: the owner gets a draft instead", () => {
    const d = decide(
      inputFor(sarah, byId("next-1").gold, {
        automation: {
          availabilityReplies: true,
          bookingTimeReplies: false,
          cancellationAcknowledgements: true,
        },
      }),
    );
    expect(d.outcome).toBe("owner_reply_task");
    expect(d.reply).toBeNull();
    expect(d.ownerTask).toEqual({
      reason: "automation_off",
      intent: "next_booking_query",
      draft: "Your next driving lesson is tomorrow at 16:00.",
    });
  });

  it("availability replies off: nothing is sent", () => {
    const d = decide(
      inputFor(sarah, byId("avail-1").gold, {
        automation: {
          availabilityReplies: false,
          bookingTimeReplies: true,
          cancellationAcknowledgements: true,
        },
      }),
    );
    expect(d.outcome).toBe("owner_reply_task");
    expect(d.reply).toBeNull();
    expect(d.ownerTask?.draft).toMatch(/free on Thursday/);
  });

  it("cancellation acknowledgement off: the request waits, silently", () => {
    const on = decide(inputFor(sarah, byId("cancel-1").gold));
    expect(on.reply?.body).toBe(
      "I’ve got your cancellation request. I’ll confirm it shortly.",
    );
    const off = decide(
      inputFor(sarah, byId("cancel-1").gold, {
        automation: {
          availabilityReplies: true,
          bookingTimeReplies: true,
          cancellationAcknowledgements: false,
        },
      }),
    );
    expect(off.outcome).toBe("create_approval");
    expect(off.reply).toBeNull();
  });
});

describe("bookings, moves and cancellations always wait for the owner", () => {
  it("proposes Friday 17:00 for Sarah, and changes nothing", () => {
    const d = decide(inputFor(sarah, byId("move-1").gold));
    expect(d.outcome).toBe("create_approval");
    expect(d.reply).toBeNull();
    expect(d.approval).toMatchObject({
      kind: "reschedule_request",
      customerId: "c-sarah",
      bookingId: "b-sarah-1",
      understood: {
        intent: "reschedule",
        preferred_date: "2026-10-02",
        earliest_time: "16:00",
      },
    });
    expect(clockTimeOf(d.approval!.proposal!.startsAt, TZ)).toBe("17:00");
    expect(d.activity.map((a) => a.kind)).toEqual([
      "request_understood",
      "time_proposed",
      "approval_requested",
    ]);
  });

  it("“after 4 instead” means the same day, and never the slot it's already in", () => {
    const d = decide(inputFor(sarah, byId("move-4").gold));
    expect(dateKeyOf(d.approval!.proposal!.startsAt, TZ)).toBe("2026-09-29");
    expect(clockTimeOf(d.approval!.proposal!.startsAt, TZ)).toBe("16:30");
  });

  it("a new booking for a named service proposes a real free time", () => {
    const d = decide(
      inputFor({ sender: "bella", world: "groomer" }, byId("book-2").gold),
    );
    expect(d.approval).toMatchObject({
      kind: "booking_request",
      bookingId: null,
      understood: { service_name: "Full groom", preferred_date: "2026-10-06" },
    });
    expect(clockTimeOf(d.approval!.proposal!.startsAt, TZ)).toBe("09:00");
  });

  it("asks which service when there's more than one and it matters", () => {
    const d = decide(inputFor(sarah, byId("book-1").gold));
    expect(d.reply?.body).toBe(
      "Which would you like: Driving lesson or Two-hour lesson?",
    );
  });

  it("uses the only service when there's just one, and proposes the nearest free time", () => {
    const d = decide(
      inputFor(sarah, byId("book-1").gold, {
        services: [worlds.driving.services[0]],
      }),
    );
    expect(d.outcome).toBe("create_approval");
    // 15:00 would overlap Omar's 15:30 lesson; 14:00 is the nearest free.
    expect(d.approval?.understood).toMatchObject({
      time_constraint: "exact",
      time: "15:00",
    });
    expect(clockTimeOf(d.approval!.proposal!.startsAt, TZ)).toBe("14:00");
  });

  it("cancels the booking that was meant, and asks when it isn't clear", () => {
    const tomorrow = decide(inputFor(sarah, byId("cancel-1").gold));
    expect(tomorrow.approval).toMatchObject({
      kind: "cancellation_request",
      bookingId: "b-sarah-1",
    });
    const vague = decide(
      inputFor(
        sarah,
        interpretation({
          intent: "cancellation_request",
          cancellation_scope: "single",
        }),
      ),
    );
    expect(vague.outcome).toBe("request_clarification");
    expect(vague.reply?.body).toBe(
      "Which driving lesson do you mean: tomorrow at 16:00 or Tue 6 Oct at 16:00?",
    );
  });
});

describe("one clarifying question, then the owner", () => {
  it("asks once, and remembers what it asked", () => {
    const d = decide(inputFor(sarah, byId("unclear-1").gold));
    expect(d.outcome).toBe("request_clarification");
    expect(d.reply?.body).toBe("Do you mean later today, or a different day?");
    expect(d.clarification).toEqual({
      set: expect.objectContaining({
        intent: "reschedule_request",
        topic: "later",
        turns: 1,
        messageId: "m-1",
      }),
    });
  });

  it("a clear answer carries on, and the question is closed", () => {
    const d = decide(
      inputFor(
        { ...sarah, pending: byId("reply-1").pending },
        byId("reply-1").gold,
      ),
    );
    expect(d.outcome).toBe("create_approval");
    expect(d.clarification).toEqual({ clear: true });
  });

  it("a second unclear answer goes to the owner rather than asking again", () => {
    const d = decide(
      inputFor(
        { ...sarah, pending: byId("reply-2").pending },
        byId("reply-2").gold,
      ),
    );
    expect(d.outcome).toBe("owner_reply_task");
    expect(d.ownerTask?.reason).toBe("clarification_exhausted");
    // One fixed message saying so, never another question.
    expect(d.reply).toEqual({
      kind: "handoff",
      body: "I still can’t tell when you’d like instead. I’ve passed this to the owner.",
    });
    expect(d.activity.map((a) => a.kind)).toEqual([
      "reply_needed",
      "reply_sent",
    ]);
    expect(d.clarification).toEqual({ clear: true });
  });

  it("the hand-over names what's still missing", () => {
    // Asked which day; the answer named a day but still no usable time.
    const stillNoTime = interpretation({
      intent: "new_booking_request",
      service_reference: "driving lesson",
      requested_date: {
        kind: "weekday",
        weekday: "friday",
        week: null,
        day: null,
        month: null,
      },
      requested_time: { constraint: "exact", time: null },
    });
    const d = decide(
      inputFor(
        {
          ...sarah,
          pending: {
            intent: "new_booking_request",
            topic: "date",
            question: "What day would suit you?",
            turns: 1,
            originalText: "Can I book a driving lesson?",
          },
        },
        stillNoTime,
      ),
    );
    expect(d.reply?.body).toBe(
      "I still can’t tell which time you mean. I’ve passed this to the owner.",
    );
  });

  it("a thank-you doesn't close an open question", () => {
    const d = decide(
      inputFor(
        { ...sarah, pending: byId("reply-2").pending },
        byId("ack-1").gold,
      ),
    );
    expect(d.outcome).toBe("no_action");
    expect(d.clarification).toBeNull();
  });
});

describe("earlier and later", () => {
  const tomorrow = {
    kind: "tomorrow",
    weekday: null,
    week: null,
    day: null,
    month: null,
  } as const;

  it("“earlier tomorrow”, about tomorrow's lesson, means earlier that day", () => {
    const d = decide(
      inputFor(
        sarah,
        interpretation({
          intent: "reschedule_request",
          referenced_booking: {
            kind: "unspecified",
            date: tomorrow,
            time: null,
            service: null,
          },
          requested_time: { constraint: "earlier", time: null },
        }),
      ),
    );
    expect(d.outcome).toBe("create_approval");
    const proposal = d.approval!.proposal!.startsAt;
    expect(dateKeyOf(proposal, TZ)).toBe("2026-09-29");
    expect(clockTimeOf(proposal, TZ) < "16:00").toBe(true);
  });

  it("with no day, “earlier” is asked about in its own words", () => {
    const d = decide(
      inputFor(
        sarah,
        interpretation({
          intent: "reschedule_request",
          requested_time: { constraint: "earlier", time: null },
        }),
      ),
    );
    expect(d.reply?.body).toBe(
      "Do you mean earlier that day, or a different day?",
    );
  });
});

describe("a follow-up revises the request still waiting for the owner", () => {
  const friday = {
    kind: "weekday",
    weekday: "friday",
    week: null,
    day: null,
    month: null,
  } as const;
  const openMove = {
    kind: "reschedule_request" as const,
    bookingId: "b-sarah-2",
    preferredDate: "2026-10-02",
    serviceId: null,
    originalText: "Can we move my lesson on the 6th to Friday after 4?",
  };
  const justATime = interpretation({
    intent: "reschedule_request",
    requested_time: { constraint: "exact", time: "18:00" },
  });
  const proposed = (d: ReturnType<typeof decide>) =>
    d.approval?.proposal
      ? `${dateKeyOf(d.approval.proposal.startsAt, TZ)} ${clockTimeOf(d.approval.proposal.startsAt, TZ)}`
      : null;

  it("“actually 6 would be better” moves the same booking, on the day asked for", () => {
    const d = decide(inputFor({ ...sarah, openRequest: openMove }, justATime));
    expect(d.approval).toMatchObject({
      kind: "reschedule_request",
      bookingId: "b-sarah-2",
    });
    expect(proposed(d)).toBe("2026-10-02 18:00");
  });

  it("without a request waiting, a bare time means the booking's own day", () => {
    const d = decide(inputFor(sarah, justATime));
    // The next booking (tomorrow), at 18:00 that day.
    expect(d.approval?.bookingId).toBe("b-sarah-1");
    expect(proposed(d)).toBe("2026-09-29 18:00");
  });

  it("naming another booking isn't a revision", () => {
    const d = decide(
      inputFor(
        { ...sarah, openRequest: openMove },
        interpretation({
          intent: "reschedule_request",
          referenced_booking: {
            kind: "on_date",
            date: {
              kind: "tomorrow",
              weekday: null,
              week: null,
              day: null,
              month: null,
            },
            time: null,
            service: null,
          },
          requested_date: friday,
          requested_time: { constraint: "exact", time: "18:00" },
        }),
      ),
    );
    expect(d.approval?.bookingId).toBe("b-sarah-1");
  });

  it("a new booking request keeps the day and service it was for", () => {
    const d = decide(
      inputFor(
        {
          ...sarah,
          openRequest: {
            kind: "booking_request",
            bookingId: null,
            preferredDate: "2026-10-02",
            serviceId: "svc-long",
            originalText: "Can I book a two hour lesson Friday at 3?",
          },
        },
        interpretation({
          intent: "new_booking_request",
          requested_time: { constraint: "exact", time: "17:00" },
        }),
      ),
    );
    expect(d.approval).toMatchObject({
      kind: "booking_request",
      understood: expect.objectContaining({
        preferred_date: "2026-10-02",
        service_id: "svc-long",
      }),
    });
    expect(proposed(d)).toBe("2026-10-02 17:00");
  });

  it("someone else's open request is never borrowed", () => {
    // Omar's move is waiting in the same business; Sarah's bare time is
    // about her own next booking, on its own day.
    const d = decide(
      inputFor(sarah, justATime, {
        openRequests: [
          {
            id: "r-omar",
            kind: "reschedule_request",
            customerId: "c-omar",
            bookingId: "b-omar-1",
            preferredDate: "2026-10-02",
            serviceId: null,
          },
        ],
      }),
    );
    expect(d.approval?.bookingId).toBe("b-sarah-1");
    expect(proposed(d)).toBe("2026-09-29 18:00");
  });
});

describe("identity and privacy are decided from records, not words", () => {
  it("never tells an unknown number about someone's booking", () => {
    const d = decide(
      inputFor({ sender: "unknown", world: "driving" }, byId("privacy-1").gold),
    );
    expect(d.outcome).toBe("privacy_hold");
    expect(d.reply).toBeNull();
    expect(d.ownerTask?.draft).toBeNull();
    expect(JSON.stringify(d)).not.toMatch(/16:00|Tue|tomorrow/);
  });

  it("never tells a customer about another customer", () => {
    const d = decide(inputFor(sarah, byId("privacy-4").gold));
    expect(d.outcome).toBe("privacy_hold");
    expect(d.reply).toBeNull();
  });

  it("a parent gets the named child's booking, or is asked which child", () => {
    const adam = decide(
      inputFor({ sender: "parent", world: "driving" }, byId("parent-1").gold),
    );
    expect(adam.reply?.body).toBe(
      "Adam’s next driving lesson is Thursday 1 October at 17:00.",
    );
    const which = decide(
      inputFor({ sender: "parent", world: "driving" }, byId("parent-2").gold),
    );
    expect(which.reply?.body).toBe("Is this about Leo or Adam?");
  });

  it("an unknown number asking about availability gets a draft for the owner, not an automatic reply", () => {
    const d = decide(
      inputFor({ sender: "unknown", world: "driving" }, byId("privacy-2").gold),
    );
    expect(d.outcome).toBe("owner_reply_task");
    expect(d.reply).toBeNull();
    expect(d.ownerTask?.draft).toMatch(/^I’ve got /);
  });
});

describe("when Pingflow can't be sure, it doesn't act", () => {
  it("the interpreter failing goes to the owner, with nothing sent", () => {
    const d = decide(inputFor(sarah, null, { interpreterFailure: "timeout" }));
    expect(d.outcome).toBe("owner_reply_task");
    expect(d.ownerTask?.reason).toBe("interpreter_unavailable");
    expect(d.reply).toBeNull();
    expect(d.approval).toBeNull();
  });

  it("low interpreter confidence is asked about, even for a supported intent", () => {
    const d = decide(
      inputFor(sarah, { ...byId("next-1").gold, confidence: "low" }),
    );
    expect(d.outcome).toBe("request_clarification");
  });

  it("complaints and unsupported requests go to the owner", () => {
    for (const id of ["other-1", "other-2"]) {
      const d = decide(inputFor(sarah, byId(id).gold));
      expect(d.ownerTask?.reason).toBe("unsupported");
      expect(d.reply).toBeNull();
    }
  });

  it("business questions become a draft only when Pingflow knows the answer", () => {
    expect(
      decide(inputFor(sarah, byId("question-1").gold)).ownerTask?.draft,
    ).toBe("A driving lesson is 1 hour.");
    expect(
      decide(inputFor(sarah, byId("question-2").gold)).ownerTask?.draft,
    ).toBeNull();
  });
});

describe("the evaluation harness", () => {
  it("scores every gold interpretation as correct", async () => {
    const fixture = new FixtureMessageInterpreter(corpus);
    for (const testCase of corpus) {
      const result = await fixture.interpret(interpreterRequestFor(testCase));
      expect(result.ok, testCase.id).toBe(true);
      const score = scoreCase(
        testCase,
        result.ok ? result.interpretation : null,
      );
      expect(score, testCase.id).toMatchObject({ pass: true });
    }
  });

  it("counts a wrong reading or a failure as a miss", () => {
    const testCase = byId("avail-7");
    expect(
      scoreCase(testCase, { ...testCase.gold, intent: "new_booking_request" })
        .pass,
    ).toBe(false);
    expect(
      scoreCase(testCase, { ...testCase.gold, requested_time: null }).pass,
    ).toBe(false);
    const failed = scoreCase(testCase, null);
    expect(failed.pass).toBe(false);
    expect(failed.got.outcome).toBe("owner_reply_task");
  });

  it("gives the interpreter first names only, never numbers or bookings", () => {
    const request = interpreterRequestFor(byId("parent-1"));
    expect(request.receivedAt).toBe(NOW);
    expect(request.sender).toEqual({ known: true, customers: ["Leo", "Adam"] });
    expect(JSON.stringify(request)).not.toMatch(/\+44|b-leo|c-leo/);
  });
});
