import { describe, expect, it } from "vitest";
import {
  inWindow,
  resolveDateReference,
  resolveTimeWindow,
  TIME_BUCKETS,
} from "@/domain/messages/dates";
import type { DateReference } from "@/domain/messages/interpretation";
import { dateKeyOf, zonedInstant } from "@/domain/time/zoned";

const day = (
  ref: Partial<NonNullable<DateReference>> & {
    kind: NonNullable<DateReference>["kind"];
  },
  today: string,
) =>
  resolveDateReference(
    { weekday: null, week: null, day: null, month: null, ...ref },
    today,
  );

// Monday 28 September 2026 … Sunday 4 October 2026.
const monday = "2026-09-28";
const friday = "2026-10-02";
const saturday = "2026-10-03";

describe("resolving days", () => {
  it("today and tomorrow", () => {
    expect(day({ kind: "today" }, monday)).toEqual({
      kind: "day",
      date: monday,
    });
    expect(day({ kind: "tomorrow" }, monday)).toEqual({
      kind: "day",
      date: "2026-09-29",
    });
    expect(day({ kind: "tomorrow" }, "2026-12-31")).toEqual({
      kind: "day",
      date: "2027-01-01",
    });
  });

  it("a plain weekday is the next one after today", () => {
    expect(day({ kind: "weekday", weekday: "friday" }, monday)).toEqual({
      kind: "day",
      date: friday,
    });
    // Said on a Friday, "Friday" means next week's.
    expect(day({ kind: "weekday", weekday: "friday" }, friday)).toEqual({
      kind: "day",
      date: "2026-10-09",
    });
    // Across the week boundary: Sunday → Monday is tomorrow.
    expect(day({ kind: "weekday", weekday: "monday" }, "2026-10-04")).toEqual({
      kind: "day",
      date: "2026-10-05",
    });
  });

  it("this Friday is this week's; next Friday is next week's", () => {
    expect(
      day({ kind: "weekday", weekday: "friday", week: "this" }, monday),
    ).toEqual({ kind: "day", date: friday });
    expect(
      day({ kind: "weekday", weekday: "friday", week: "this" }, friday),
    ).toEqual({ kind: "day", date: friday });
    expect(
      day({ kind: "weekday", weekday: "friday", week: "this" }, saturday),
    ).toEqual({ kind: "day", date: "2026-10-09" });
    expect(
      day({ kind: "weekday", weekday: "friday", week: "next" }, monday),
    ).toEqual({ kind: "day", date: "2026-10-09" });
    expect(
      day({ kind: "weekday", weekday: "friday", week: "next" }, "2026-10-04"),
    ).toEqual({ kind: "day", date: "2026-10-09" });
  });

  it("calendar dates come round again next year if passed", () => {
    expect(day({ kind: "calendar_date", day: 14, month: 10 }, monday)).toEqual({
      kind: "day",
      date: "2026-10-14",
    });
    expect(day({ kind: "calendar_date", day: 3, month: 1 }, monday)).toEqual({
      kind: "day",
      date: "2027-01-03",
    });
    expect(
      day({ kind: "calendar_date", day: 31, month: 2 }, monday),
    ).toBeNull();
  });

  it("“the 6th” is the next 6th: this month if it's still to come, else next", () => {
    const the = (n: number, today = monday) =>
      day({ kind: "calendar_date", day: n, month: null }, today);
    // Monday 28 September.
    expect(the(30)).toEqual({ kind: "day", date: "2026-09-30" });
    expect(the(28)).toEqual({ kind: "day", date: "2026-09-28" });
    expect(the(6)).toEqual({ kind: "day", date: "2026-10-06" });
    // No 31st in September or November: the next month that has one.
    expect(the(31, "2026-10-31")).toEqual({ kind: "day", date: "2026-10-31" });
    expect(the(31, "2026-11-01")).toEqual({ kind: "day", date: "2026-12-31" });
    // Across the year end.
    expect(the(2, "2026-12-15")).toEqual({ kind: "day", date: "2027-01-02" });
  });

  it("this week and next week are ranges", () => {
    expect(day({ kind: "this_week" }, "2026-10-01")).toEqual({
      kind: "range",
      from: "2026-10-01",
      days: 4,
    });
    expect(day({ kind: "next_week" }, monday)).toEqual({
      kind: "range",
      from: "2026-10-05",
      days: 7,
    });
  });

  it("uses the business's date, not the server's, around midnight and clock changes", () => {
    // 23:30 UTC on Sat 24 Oct is 00:30 BST on Sun 25 Oct (the night the
    // clocks go back): "tomorrow" is Monday 26th.
    const receivedAt = new Date("2026-10-24T23:30:00Z");
    const today = dateKeyOf(receivedAt, "Europe/London");
    expect(today).toBe("2026-10-25");
    expect(day({ kind: "tomorrow" }, today)).toEqual({
      kind: "day",
      date: "2026-10-26",
    });
    // "After 4" on the 25th is 16:00 GMT, the same local time as any day.
    expect(
      zonedInstant("2026-10-25", "16:00", "Europe/London").toISOString(),
    ).toBe("2026-10-25T16:00:00.000Z");
  });
});

describe("resolving times", () => {
  it("after, before, exact and around", () => {
    const after = resolveTimeWindow({ constraint: "after", time: "16:00" })!;
    expect(inWindow("16:00", after)).toBe(true);
    expect(inWindow("15:30", after)).toBe(false);
    const before = resolveTimeWindow({ constraint: "before", time: "12:00" })!;
    expect(inWindow("11:30", before)).toBe(true);
    expect(inWindow("12:00", before)).toBe(false);
    const exact = resolveTimeWindow({ constraint: "exact", time: "15:00" })!;
    expect(inWindow("15:00", exact)).toBe(true);
    expect(inWindow("15:30", exact)).toBe(false);
    const around = resolveTimeWindow({ constraint: "around", time: "15:00" })!;
    expect(["14:00", "15:00", "16:00"].map((t) => inWindow(t, around))).toEqual(
      [true, true, true],
    );
    expect(inWindow("16:30", around)).toBe(false);
  });

  it("morning, afternoon and evening use the central ranges", () => {
    expect(TIME_BUCKETS.afternoon).toEqual({ start: "12:00", end: "17:00" });
    const afternoon = resolveTimeWindow({
      constraint: "afternoon",
      time: null,
    })!;
    expect(inWindow("12:00", afternoon)).toBe(true);
    expect(inWindow("16:30", afternoon)).toBe(true);
    expect(inWindow("17:00", afternoon)).toBe(false);
    expect(inWindow("11:30", afternoon)).toBe(false);
  });

  it("same time, later and earlier are relative to the booking", () => {
    expect(resolveTimeWindow({ constraint: "later", time: null })).toBeNull();
    const later = resolveTimeWindow(
      { constraint: "later", time: null },
      "16:00",
    )!;
    expect(inWindow("16:00", later)).toBe(false);
    expect(inWindow("16:30", later)).toBe(true);
    expect(
      resolveTimeWindow({ constraint: "same_time", time: null }, "16:00"),
    ).toEqual({ exact: "16:00" });
  });

  it("no time words allow any time", () => {
    expect(resolveTimeWindow(null)).toEqual({});
    expect(
      inWindow(
        "09:00",
        resolveTimeWindow({ constraint: "anytime", time: null })!,
      ),
    ).toBe(true);
  });

  it("refuses a time constraint with no time", () => {
    expect(resolveTimeWindow({ constraint: "after", time: null })).toBeNull();
  });
});
