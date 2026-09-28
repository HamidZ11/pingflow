import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatLeadTime,
  formatRelativeDate,
  formatTime,
  formatWeekRange,
} from "@/domain/time/format";
import {
  addDays,
  clockTimeOf,
  dateKeyOf,
  isDateKey,
  isoWeekday,
  startOfWeek,
  zonedInstant,
} from "@/domain/time/zoned";

const tz = "Europe/London";

describe("wall-clock conversions", () => {
  it("round-trips a date and time through an instant", () => {
    const instant = zonedInstant("2026-10-02", "17:00", tz);
    expect(instant.toISOString()).toBe("2026-10-02T16:00:00.000Z");
    expect(dateKeyOf(instant, tz)).toBe("2026-10-02");
    expect(clockTimeOf(instant, tz)).toBe("17:00");
  });

  it("uses GMT in winter and BST in summer", () => {
    expect(zonedInstant("2026-01-15", "09:00", tz).toISOString()).toBe(
      "2026-01-15T09:00:00.000Z",
    );
    expect(zonedInstant("2026-07-15", "09:00", tz).toISOString()).toBe(
      "2026-07-15T08:00:00.000Z",
    );
  });

  it("finds the local date of an instant near midnight", () => {
    // 23:30 UTC on 1 Oct is 00:30 on 2 Oct in London.
    expect(dateKeyOf(new Date("2026-10-01T23:30:00Z"), tz)).toBe("2026-10-02");
  });

  it("does calendar arithmetic across months and years", () => {
    expect(addDays("2026-09-30", 2)).toBe("2026-10-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(isoWeekday("2026-10-02")).toBe(5);
    expect(isoWeekday("2026-10-04")).toBe(7);
    expect(startOfWeek("2026-10-04")).toBe("2026-09-28");
    expect(startOfWeek("2026-09-28")).toBe("2026-09-28");
  });

  it("validates dates", () => {
    expect(isDateKey("2026-02-28")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-2-3")).toBe(false);
  });
});

describe("formatting", () => {
  const friday = zonedInstant("2026-10-02", "17:00", tz);

  it("formats times on the 24-hour clock", () => {
    expect(formatTime(friday, tz)).toBe("17:00");
    expect(formatTime(zonedInstant("2026-10-02", "09:05", tz), tz)).toBe(
      "09:05",
    );
  });

  it("formats dates in British English", () => {
    expect(formatDate("2026-10-02")).toBe("Fri 2 Oct");
    expect(formatDate("2026-10-02", "long")).toBe("Friday 2 October");
    expect(formatDate("2026-10-02", "weekday")).toBe("Friday");
    expect(formatDateTime(friday, tz)).toBe("Fri 2 Oct, 17:00");
  });

  it("says days the way people do", () => {
    const today = "2026-09-28";
    expect(formatRelativeDate("2026-09-28", today)).toBe("Today");
    expect(formatRelativeDate("2026-09-29", today)).toBe("Tomorrow");
    expect(formatRelativeDate("2026-09-27", today)).toBe("Yesterday");
    expect(formatRelativeDate("2026-10-02", today)).toBe("Friday");
    expect(formatRelativeDate("2026-10-05", today)).toBe("Mon 5 Oct");
  });

  it("formats week ranges", () => {
    expect(formatWeekRange("2026-09-28")).toBe("28 Sep – 4 Oct 2026");
    expect(formatWeekRange("2026-10-05")).toBe("5–11 Oct 2026");
    expect(formatWeekRange("2026-12-28")).toBe("28 Dec 2026 – 3 Jan 2027");
  });

  it("formats durations and reminder lead times", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 hour");
    expect(formatDuration(90)).toBe("1 hour 30 min");
    expect(formatDuration(120)).toBe("2 hours");
    expect(formatLeadTime(1440)).toBe("1 day before");
    expect(formatLeadTime(2880)).toBe("2 days before");
    expect(formatLeadTime(120)).toBe("2 hours before");
  });
});
