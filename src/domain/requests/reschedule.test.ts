import { describe, expect, it } from "vitest";
import {
  describeRequestedTime,
  planRescheduleApproval,
  planRescheduleDecline,
  readRescheduleUnderstanding,
} from "@/domain/requests/reschedule";
import { zonedInstant } from "@/domain/time/zoned";

const tz = "Europe/London";
const friday17 = zonedInstant("2026-10-02", "17:00", tz);
const tuesday16 = zonedInstant("2026-09-29", "16:00", tz);
const now = zonedInstant("2026-09-28", "14:15", tz);

const understanding = readRescheduleUnderstanding({
  intent: "reschedule",
  preferred_date: "2026-10-02",
  earliest_time: "16:00",
})!;

const automation = {
  confirmationsEnabled: true,
  reminders: { enabled: true, leadMinutes: 1440 },
};

describe("reading what Pingflow understood", () => {
  it("reads a reschedule request", () => {
    expect(understanding).toEqual({
      intent: "reschedule",
      preferredDate: "2026-10-02",
      earliestTime: "16:00",
      timeConstraint: "after",
      time: "16:00",
    });
  });

  it("rejects anything malformed", () => {
    expect(readRescheduleUnderstanding(null)).toBeNull();
    expect(readRescheduleUnderstanding({ intent: "cancel" })).toBeNull();
    expect(
      readRescheduleUnderstanding({
        intent: "reschedule",
        preferred_date: "Friday",
      }),
    ).toBeNull();
  });

  it("describes the requested time as a person would", () => {
    expect(describeRequestedTime(understanding, "2026-09-28")).toBe(
      "Friday after 16:00",
    );
    expect(
      describeRequestedTime(
        { ...understanding, preferredDate: "2026-09-29" },
        "2026-09-28",
        { inSentence: true },
      ),
    ).toBe("tomorrow after 16:00");
  });
});

describe("approving a move", () => {
  it("confirms the new time and moves the reminder to a day before", () => {
    const plan = planRescheduleApproval({
      newStartsAt: friday17,
      customerName: "Sarah Khan",
      serviceName: "Driving lesson",
      timeZone: tz,
      automation,
      now,
    });
    expect(plan.startsAt).toEqual(friday17);
    expect(plan.replyBody).toBe(
      "Hi Sarah, that’s done. Your driving lesson is now on Friday 2 October at 17:00. See you then!",
    );
    expect(plan.reminderSendAt).toEqual(
      zonedInstant("2026-10-01", "17:00", tz),
    );
  });

  it("sends no confirmation when confirmations are off", () => {
    const plan = planRescheduleApproval({
      newStartsAt: friday17,
      customerName: "Sarah Khan",
      serviceName: "Driving lesson",
      timeZone: tz,
      automation: { ...automation, confirmationsEnabled: false },
      now,
    });
    expect(plan.replyBody).toBeNull();
  });

  it("schedules no reminder when reminders are off or it's too late", () => {
    const off = planRescheduleApproval({
      newStartsAt: friday17,
      customerName: "Sarah Khan",
      serviceName: "Driving lesson",
      timeZone: tz,
      automation: {
        ...automation,
        reminders: { enabled: false, leadMinutes: 1440 },
      },
      now,
    });
    expect(off.reminderSendAt).toBeNull();

    const soon = planRescheduleApproval({
      newStartsAt: zonedInstant("2026-09-29", "09:00", tz),
      customerName: "Sarah Khan",
      serviceName: "Driving lesson",
      timeZone: tz,
      automation,
      now,
    });
    expect(soon.reminderSendAt).toBeNull();
  });
});

describe("declining a move", () => {
  it("replies with what stays the same", () => {
    const { replyBody } = planRescheduleDecline({
      understanding,
      currentStartsAt: tuesday16,
      customerName: "Sarah Khan",
      serviceName: "Driving lesson",
      timeZone: tz,
      today: "2026-09-28",
    });
    expect(replyBody).toBe(
      "Hi Sarah, sorry, Friday after 16:00 doesn’t work this time. Your driving lesson stays on Tuesday 29 September at 16:00.",
    );
  });
});
