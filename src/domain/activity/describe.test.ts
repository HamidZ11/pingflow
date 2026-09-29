import { describe, expect, it } from "vitest";
import {
  type ActivityRecord,
  describeActivity,
} from "@/domain/activity/describe";
import { zonedInstant } from "@/domain/time/zoned";

const tz = "Europe/London";
const at = zonedInstant("2026-09-28", "14:12", tz);

function event(overrides: Partial<ActivityRecord>): ActivityRecord {
  return {
    id: "e-1",
    kind: "message_received",
    actor: "contact",
    occurredAt: at,
    details: {},
    customerName: "Sarah Khan",
    serviceName: null,
    messageBody: null,
    ...overrides,
  };
}

describe("activity for inbound messages", () => {
  it("names the sender by customer, contact or number", () => {
    expect(describeActivity(event({}), tz).text).toBe(
      "Sarah Khan sent a message",
    );
    expect(
      describeActivity(
        event({ customerName: null, contactName: "+44 7700 900111" }),
        tz,
      ).text,
    ).toBe("+44 7700 900111 sent a message");
  });

  it("describes what Pingflow understood, by request", () => {
    const understood = (details: Record<string, unknown>) =>
      describeActivity(
        event({ kind: "request_understood", actor: "pingflow", details }),
        tz,
      ).text;
    expect(
      understood({
        intent: "new_booking",
        preferred_date: "2026-10-02",
        time_constraint: "afternoon",
        service_id: "s",
        service_name: "Driving lesson",
      }),
    ).toBe(
      "Pingflow understood: Sarah Khan wants to book a driving lesson for Friday afternoon",
    );
    expect(understood({ intent: "next_booking_query" })).toBe(
      "Pingflow understood: Sarah Khan asked when their next booking is",
    );
    expect(
      understood({
        intent: "cancellation",
        booking_starts_at: zonedInstant(
          "2026-09-29",
          "16:00",
          tz,
        ).toISOString(),
      }),
    ).toBe(
      "Pingflow understood: Sarah Khan wants to cancel the booking on Tue 29 Sep, 16:00",
    );
  });

  it("tells Pingflow's question, its replies and the owner's apart", () => {
    const reply = (actor: ActivityRecord["actor"], details = {}) =>
      describeActivity(
        event({
          kind: "reply_sent",
          actor,
          details: { delivery: "simulated", ...details },
        }),
        tz,
      ).text;
    expect(reply("pingflow", { reply_kind: "clarification" })).toBe(
      "Question to Sarah Khan",
    );
    expect(reply("pingflow", { reply_kind: "availability" })).toBe(
      "Reply to Sarah Khan",
    );
    expect(reply("owner")).toBe("Your reply to Sarah Khan");
  });

  it("says why a message was left for the owner", () => {
    expect(
      describeActivity(
        event({
          kind: "reply_needed",
          actor: "pingflow",
          details: { reason: "clarification_exhausted" },
        }),
        tz,
      ).text,
    ).toBe("Pingflow wasn’t sure what Sarah Khan meant and left it for you");
  });
});
