import { describe, expect, it } from "vitest";
import { corpus } from "@/domain/messages/fixtures/corpus";
import { assessCase } from "@/domain/messages/fixtures/harness";
import type { Interpretation } from "@/domain/messages/interpretation";

// The live evaluation's judge. It must score the expected readings as
// perfect, and rank real mistakes by what they would make Pingflow do.

const byId = (id: string) => corpus.find((c) => c.id === id)!;
const read = (id: string, change: Partial<Interpretation>) =>
  assessCase(byId(id), {
    ok: true,
    interpretation: { ...byId(id).gold, ...change },
  });

describe("assessing a live reading", () => {
  it("scores every expected reading as correct on every criterion", () => {
    for (const testCase of corpus) {
      const a = assessCase(testCase, {
        ok: true,
        interpretation: testCase.gold,
      });
      expect(a.severity, testCase.id).toBeNull();
      expect(a.structured).toBe("valid");
      expect(
        Object.values(a.criteria).every((v) => v !== false),
        testCase.id,
      ).toBe(true);
    }
  });

  it("treats equivalent dates and times as equal", () => {
    // "Friday" said with or without "this" names the same day.
    const a = read("avail-7", {
      requested_date: {
        kind: "weekday",
        weekday: "friday",
        week: "this",
        day: null,
        month: null,
      },
    });
    expect(a.criteria.date).toBe(true);
    expect(a.severity).toBeNull();
  });

  it("calls a mix-up between booking actions critical", () => {
    expect(read("cancel-1", { intent: "new_booking_request" }).severity).toBe(
      "critical",
    );
    const moved = read("move-1", { intent: "new_booking_request" });
    expect(moved.severity).toBe("critical");
    expect(moved.reasons.join()).toMatch(/reschedule/);
  });

  it("calls acting on an ambiguous message critical", () => {
    const a = read("unclear-1", {
      clarification_needed: false,
      requested_date: {
        kind: "tomorrow",
        weekday: null,
        week: null,
        day: null,
        month: null,
      },
    });
    expect(a.severity).toBe("critical");
    expect(a.reasons.join()).toMatch(
      /ambiguity treated as complete|wasn't in the message/,
    );
  });

  it("calls answering a complaint automatically critical", () => {
    const a = read("other-2", { intent: "availability_query" });
    expect(a.severity).toBe("critical");
  });

  it("calls a wrong person for a parent critical (privacy)", () => {
    const a = read("parent-2", { person_reference: "Adam" });
    expect(a.severity).toBe("critical");
    expect(a.reasons.join()).toMatch(/privacy/);
  });

  it("calls a wrong time constraint important", () => {
    // "before 4" instead of "after 4" offers different times.
    const a = read("avail-7", {
      requested_time: { constraint: "before", time: "16:00" },
    });
    expect(a.severity).toBe("important");
    expect(a.reasons).toContain("important: time constraint");
  });

  it("calls a difference that changes nothing minor", () => {
    // After 17:00 or after 16:00: that Friday, 17:00 is first free either way.
    expect(
      read("avail-7", {
        requested_time: { constraint: "after", time: "17:00" },
      }).severity,
    ).toBe("minor");
  });

  it("calls a different confidence with the same effect minor", () => {
    const a = read("next-1", { confidence: "medium" });
    expect(a.severity).toBe("minor");
    expect(a.criteria.sameEffect).toBe(true);
  });

  it("separates model failures from provider failures", () => {
    const refused = assessCase(byId("next-1"), {
      ok: false,
      failure: "refused",
    });
    expect(refused).toMatchObject({
      structured: "refused",
      severity: "critical",
    });
    const outage = assessCase(byId("next-1"), {
      ok: false,
      failure: "timeout",
    });
    expect(outage).toMatchObject({
      structured: "provider_error",
      severity: "important",
    });
  });

  it("marks the clear core requests that must always be read right", () => {
    const clear = corpus.filter(
      (c) => assessCase(c, { ok: true, interpretation: c.gold }).clearCore,
    );
    expect(clear.map((c) => c.id)).toContain("move-1");
    expect(clear.map((c) => c.id)).not.toContain("unclear-1");
    expect(clear.length).toBeGreaterThanOrEqual(15);
  });
});
