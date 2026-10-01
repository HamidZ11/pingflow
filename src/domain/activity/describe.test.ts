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
    expect(reply("pingflow", { reply_kind: "handoff" })).toBe(
      "Told Sarah Khan it’s been passed to you",
    );
  });

  it("says why a request closed without an answer", () => {
    const closed = (reason: string) =>
      describeActivity(
        event({ kind: "request_closed", actor: "owner", details: { reason } }),
        tz,
      ).text;
    expect(closed("superseded")).toBe(
      "Sarah Khan’s earlier request was replaced by a newer one",
    );
    expect(closed("booked_by_owner")).toBe(
      "Sarah Khan’s booking request was closed because you booked them yourself",
    );
    expect(closed("booking_moved")).toBe(
      "Sarah Khan’s request was closed because you moved the booking",
    );
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

  it("says when the owner made a change from WhatsApp", () => {
    const moved = describeActivity(
      event({
        kind: "booking_moved",
        actor: "owner",
        serviceName: "Driving lesson",
        details: {
          from_starts_at: zonedInstant("2026-09-29", "16:00", tz).toISOString(),
          to_starts_at: zonedInstant("2026-10-02", "17:00", tz).toISOString(),
          via: "whatsapp",
        },
      }),
      tz,
    );
    expect(moved.text).toBe(
      "Sarah Khan’s driving lesson moved from Tue 29 Sep, 16:00 to Fri 2 Oct, 17:00, from WhatsApp",
    );
    const blocked = describeActivity(
      event({
        kind: "time_blocked",
        actor: "owner",
        customerName: null,
        details: {
          starts_at: zonedInstant("2026-10-01", "12:00", tz).toISOString(),
          ends_at: zonedInstant("2026-10-01", "17:00", tz).toISOString(),
          via: "whatsapp",
        },
      }),
      tz,
    );
    expect(blocked.text).toBe(
      "You blocked Thu 1 Oct, 12:00–17:00, from WhatsApp",
    );
  });
});
