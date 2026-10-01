import { describe, expect, it } from "vitest";
import { formatPhone, parsePhone } from "@/domain/contacts/phone";
import { describeSeries } from "@/domain/schedule/series";

describe("phone numbers", () => {
  it("reads UK numbers however they are typed", () => {
    expect(parsePhone("07700 900123")).toBe("+447700900123");
    expect(parsePhone("+44 7700 900123")).toBe("+447700900123");
    expect(parsePhone("0044 (7700) 900-123")).toBe("+447700900123");
  });

  it("rejects things that aren't numbers", () => {
    expect(parsePhone("")).toBeNull();
    expect(parsePhone("call me")).toBeNull();
    expect(parsePhone("123")).toBeNull();
  });

  it("formats numbers for reading", () => {
    expect(formatPhone("+447700900123")).toBe("+44 7700 900123");
  });
});

describe("recurring bookings", () => {
  it("describes a series", () => {
    expect(
      describeSeries({ weekday: 2, startTime: "16:00", intervalWeeks: 1 }),
    ).toBe("Weekly on Tuesdays at 16:00");
    expect(
      describeSeries({ weekday: 5, startTime: "09:30:00", intervalWeeks: 2 }),
    ).toBe("Every 2 weeks on Fridays at 09:30");
  });
});
