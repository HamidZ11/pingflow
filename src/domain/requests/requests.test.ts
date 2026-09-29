import { describe, expect, it } from "vitest";
import {
  planBookingApproval,
  planBookingDecline,
  readBookingUnderstanding,
} from "@/domain/requests/booking";
import {
  planCancellationApproval,
  planCancellationDecline,
  readCancellationUnderstanding,
} from "@/domain/requests/cancellation";
import { describeOwnerTask } from "@/domain/requests/owner-task";
import {
  describeProposalReason,
  describeRequestedTime,
  describeRequestedTimeLong,
  readRequestedTime,
} from "@/domain/requests/requested-time";
import { zonedInstant } from "@/domain/time/zoned";

const tz = "Europe/London";
const today = "2026-09-28";
const now = zonedInstant(today, "14:15", tz);

const requested = (fields: Record<string, unknown>) =>
  readRequestedTime({ preferred_date: "2026-10-02", ...fields })!;

describe("how a requested time reads", () => {
  it("covers each way a customer puts it", () => {
    const cases: [Record<string, unknown>, string, string][] = [
      [
        { time_constraint: "after", time: "16:00", earliest_time: "16:00" },
        "Friday after 16:00",
        "Friday 2 October, after 16:00",
      ],
      [
        { time_constraint: "exact", time: "15:00" },
        "Friday at 15:00",
        "Friday 2 October, at 15:00",
      ],
      [
        { time_constraint: "around", time: "15:00" },
        "Friday around 15:00",
        "Friday 2 October, around 15:00",
      ],
      [
        { time_constraint: "afternoon" },
        "Friday afternoon",
        "Friday 2 October, in the afternoon",
      ],
      [{}, "Friday", "Friday 2 October"],
    ];
    for (const [fields, short, long] of cases) {
      expect(describeRequestedTime(requested(fields), today)).toBe(short);
      expect(describeRequestedTimeLong(requested(fields))).toBe(long);
    }
  });

  it("reads requests stored before time constraints were recorded", () => {
    expect(
      readRequestedTime({
        preferred_date: "2026-10-02",
        earliest_time: "16:00",
      }),
    ).toEqual({
      preferredDate: "2026-10-02",
      earliestTime: "16:00",
      timeConstraint: "after",
      time: "16:00",
    });
    expect(readRequestedTime({ preferred_date: "Friday" })).toBeNull();
  });

  it("explains the proposal, including when nothing matched", () => {
    expect(
      describeProposalReason(
        requested({ time_constraint: "after", earliest_time: "16:00" }),
        "17:00",
        60,
      ),
    ).toBe("It’s the first free hour after 16:00, allowing travel time.");
    expect(
      describeProposalReason(
        requested({ time_constraint: "exact", time: "15:00" }),
        "15:00",
        60,
      ),
    ).toBe("It’s the time they asked for.");
    expect(
      describeProposalReason(
        requested({ time_constraint: "exact", time: "15:00" }),
        "14:00",
        120,
      ),
    ).toBe("Nothing was free at 15:00, so it’s the nearest free slot.");
    expect(
      describeProposalReason(
        requested({ time_constraint: "morning" }),
        "09:00",
        60,
      ),
    ).toBe("It’s the first free hour in the morning, allowing travel time.");
  });
});

describe("new booking requests", () => {
  const understanding = readBookingUnderstanding({
    intent: "new_booking",
    preferred_date: "2026-10-02",
    time_constraint: "afternoon",
    service_id: "svc-1",
    service_name: "Driving lesson",
  })!;

  it("reads the service and the time asked for", () => {
    expect(understanding).toMatchObject({
      serviceId: "svc-1",
      serviceName: "Driving lesson",
      timeConstraint: "afternoon",
    });
    expect(readBookingUnderstanding({ intent: "new_booking" })).toBeNull();
  });

  it("confirms with the booking's details, and schedules the reminder", () => {
    const startsAt = zonedInstant("2026-10-02", "14:00", tz);
    const plan = planBookingApproval({
      startsAt,
      customerName: "Sarah Khan",
      serviceName: "Driving lesson",
      timeZone: tz,
      automation: {
        confirmationsEnabled: true,
        reminders: { enabled: true, leadMinutes: 1440 },
      },
      now,
    });
    expect(plan.replyBody).toBe(
      "Hi Sarah, that’s booked. Your driving lesson is on Friday 2 October at 14:00. See you then!",
    );
    expect(plan.reminderSendAt).toEqual(
      zonedInstant("2026-10-01", "14:00", tz),
    );
  });

  it("declines politely, naming what they asked for", () => {
    expect(
      planBookingDecline({ understanding, customerName: "Sarah Khan", today })
        .replyBody,
    ).toBe(
      "Hi Sarah, sorry, Friday afternoon doesn’t work this time. Let me know if another day suits you.",
    );
  });
});

describe("cancellation requests", () => {
  const facts = {
    customerName: "Sarah Khan",
    serviceName: "Driving lesson",
    startsAt: zonedInstant("2026-09-29", "16:00", tz),
    timeZone: tz,
  };

  it("reads the scope, defaulting to one booking", () => {
    expect(
      readCancellationUnderstanding({
        intent: "cancellation",
        booking_starts_at: facts.startsAt.toISOString(),
      }),
    ).toEqual({
      intent: "cancellation",
      bookingStartsAt: facts.startsAt,
      scope: "single",
    });
  });

  it("confirms only when confirmations are on", () => {
    expect(
      planCancellationApproval({ ...facts, confirmationsEnabled: true })
        .replyBody,
    ).toBe(
      "Hi Sarah, that’s done. Your driving lesson on Tuesday 29 September at 16:00 is cancelled.",
    );
    expect(
      planCancellationApproval({ ...facts, confirmationsEnabled: false })
        .replyBody,
    ).toBeNull();
    expect(planCancellationDecline(facts).replyBody).toBe(
      "Hi Sarah, I can’t cancel this one, sorry. Your driving lesson is still on Tuesday 29 September at 16:00.",
    );
  });
});

describe("messages left for the owner", () => {
  const base = { who: "Tom", noun: "driving lesson", hasDraft: false };

  it("says what happened in plain words", () => {
    expect(
      describeOwnerTask({
        ...base,
        reason: "clarification_exhausted",
        intent: "unclear",
      }).title,
    ).toBe("Pingflow isn’t sure what Tom means");
    expect(
      describeOwnerTask({
        ...base,
        reason: "interpreter_unavailable",
        intent: null,
      }).title,
    ).toBe("Pingflow couldn’t understand this message");
    expect(
      describeOwnerTask({
        ...base,
        who: "+44 7700 900111",
        reason: "identity_unknown",
        intent: "next_booking_query",
      }),
    ).toEqual({
      title: "A number Pingflow doesn’t know asked about a booking",
      explanation: "Pingflow didn’t share any booking details.",
    });
    expect(
      describeOwnerTask({
        ...base,
        reason: "automation_off",
        intent: "next_booking_query",
        hasDraft: true,
      }),
    ).toEqual({
      title: "Tom asked when the next driving lesson is",
      explanation:
        "Automatic replies for this are off. Pingflow has drafted a reply for you to check.",
    });
  });

  it("never mentions how the message was read", () => {
    const reasons = [
      "clarification_exhausted",
      "interpreter_unavailable",
      "identity_unknown",
      "not_linked",
      "new_contact",
      "unsupported",
      "automation_off",
      "business_question",
      "no_booking_found",
    ];
    for (const reason of reasons) {
      const text = JSON.stringify(
        describeOwnerTask({
          ...base,
          reason,
          intent: "unclear",
          hasDraft: true,
        }),
      );
      expect(text).not.toMatch(/\b(AI|GPT|OpenAI|model|tokens?|confidence)\b/i);
    }
  });
});
