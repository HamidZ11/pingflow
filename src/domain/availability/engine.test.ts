import { describe, expect, it } from "vitest";
import {
  availableDays,
  availableSlots,
  type BusyBooking,
  checkSlot,
  FLEXIBLE_BOOKABLE_DAY,
  firstAvailableSlot,
  freeIntervals,
  type ScheduleContext,
  workingWindows,
} from "@/domain/availability/engine";
import { clockTimeOf, zonedInstant } from "@/domain/time/zoned";

const tz = "Europe/London";
// Friday 2 October 2026 (BST, UTC+1).
const friday = "2026-10-02";
const at = (time: string, date = friday) => zonedInstant(date, time, tz);
const times = (slots: { startsAt: Date }[]) =>
  slots.map((s) => clockTimeOf(s.startsAt, tz));

const lesson = { durationMinutes: 60, bufferMinutes: 15 };

function booking(
  id: string,
  start: string,
  end: string,
  bufferMinutes = 15,
  date = friday,
): BusyBooking {
  return {
    id,
    startsAt: at(start, date),
    endsAt: at(end, date),
    bufferMinutes,
  };
}

function context(overrides: Partial<ScheduleContext> = {}): ScheduleContext {
  return {
    timeZone: tz,
    mode: "regular",
    workingHours: [
      { weekday: 1, start: "09:00", end: "19:00" },
      { weekday: 2, start: "09:00", end: "19:00" },
      { weekday: 3, start: "09:00", end: "19:00" },
      { weekday: 4, start: "09:00", end: "19:00" },
      { weekday: 5, start: "09:00", end: "19:00" },
      { weekday: 6, start: "09:00", end: "13:00" },
    ],
    bookings: [],
    blocks: [],
    ...overrides,
  };
}

describe("the Sarah scenario", () => {
  // Omar 15:30–16:30 plus 15 minutes' travel; Sarah wants Friday after 16:00.
  const ctx = context({ bookings: [booking("omar", "15:30", "16:30")] });

  it("proposes 17:00 as the first free hour after 16:00", () => {
    const slot = firstAvailableSlot(ctx, friday, lesson, {
      notBefore: "16:00",
    });
    expect(slot && clockTimeOf(slot.startsAt, tz)).toBe("17:00");
    expect(slot && clockTimeOf(slot.endsAt, tz)).toBe("18:00");
  });

  it("offers every later start that still ends by closing time", () => {
    expect(
      times(availableSlots(ctx, friday, lesson, { notBefore: "16:00" })),
    ).toEqual(["17:00", "17:30", "18:00"]);
  });
});

describe("collisions", () => {
  const ctx = context({ bookings: [booking("omar", "15:30", "16:30")] });

  it("rejects a slot that overlaps a booking", () => {
    expect(checkSlot(ctx, at("16:00"), lesson)).toEqual({
      ok: false,
      problem: { kind: "overlaps_booking", bookingId: "omar" },
    });
  });

  it("rejects a slot that contains a booking entirely", () => {
    const long = { durationMinutes: 180, bufferMinutes: 0 };
    expect(checkSlot(ctx, at("15:00"), long)).toMatchObject({
      ok: false,
      problem: { kind: "overlaps_booking" },
    });
  });

  it("lets a moved booking overlap its own current time", () => {
    expect(
      checkSlot(ctx, at("16:00"), { ...lesson, ignoreBookingId: "omar" }),
    ).toEqual({ ok: true });
  });
});

describe("buffers", () => {
  const ctx = context({ bookings: [booking("omar", "15:30", "16:30")] });

  it("keeps the buffer after a booking free", () => {
    expect(checkSlot(ctx, at("16:30"), lesson)).toEqual({
      ok: false,
      problem: { kind: "inside_buffer", bookingId: "omar" },
    });
  });

  it("needs the new booking's own buffer before the next booking", () => {
    // 14:30–15:30 would leave no travel time before Omar at 15:30.
    expect(checkSlot(ctx, at("14:30"), lesson)).toEqual({
      ok: false,
      problem: { kind: "inside_buffer", bookingId: "omar" },
    });
    // 14:00–15:00 leaves 30 minutes, more than the 15 needed.
    expect(checkSlot(ctx, at("14:00"), lesson)).toEqual({ ok: true });
  });

  it("uses each booking's own buffer", () => {
    const noTravel = context({
      bookings: [booking("omar", "15:30", "16:30", 0)],
    });
    expect(checkSlot(noTravel, at("16:30"), lesson)).toEqual({ ok: true });
  });

  it("lets the last appointment's buffer run past closing time", () => {
    expect(checkSlot(context(), at("18:00"), lesson)).toEqual({ ok: true });
  });
});

describe("blocked time", () => {
  const ctx = context({
    blocks: [{ id: "mot", startsAt: at("12:00"), endsAt: at("14:00") }],
  });

  it("rejects a slot that overlaps blocked time", () => {
    expect(checkSlot(ctx, at("13:30"), lesson)).toEqual({
      ok: false,
      problem: { kind: "blocked", blockId: "mot" },
    });
    expect(checkSlot(ctx, at("11:30"), lesson)).toMatchObject({
      ok: false,
      problem: { kind: "blocked" },
    });
  });

  it("leaves blocked time out of the day's slots", () => {
    const slots = times(availableSlots(ctx, friday, lesson));
    expect(slots).toContain("11:00");
    expect(slots).not.toContain("11:30");
    expect(slots).not.toContain("13:30");
    expect(slots).toContain("14:00");
  });
});

describe("working hours", () => {
  const ctx = context();

  it("rejects a slot before opening", () => {
    expect(checkSlot(ctx, at("08:30"), lesson)).toEqual({
      ok: false,
      problem: { kind: "outside_hours" },
    });
  });

  it("rejects a slot that runs past closing", () => {
    expect(checkSlot(ctx, at("18:30"), lesson)).toEqual({
      ok: false,
      problem: { kind: "outside_hours" },
    });
  });

  it("rejects any slot on a day off", () => {
    const sunday = "2026-10-04";
    expect(checkSlot(ctx, at("10:00", sunday), lesson)).toEqual({
      ok: false,
      problem: { kind: "outside_hours" },
    });
    expect(availableSlots(ctx, sunday, lesson)).toEqual([]);
  });

  it("keeps a slot inside one window on a split day", () => {
    const split = context({
      workingHours: [
        { weekday: 5, start: "09:00", end: "12:00" },
        { weekday: 5, start: "13:00", end: "17:00" },
      ],
    });
    expect(checkSlot(split, at("11:30"), lesson)).toEqual({
      ok: false,
      problem: { kind: "outside_hours" },
    });
    expect(times(availableSlots(split, friday, lesson))).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "13:00",
      "13:30",
      "14:00",
      "14:30",
      "15:00",
      "15:30",
      "16:00",
    ]);
  });
});

describe("exact boundaries", () => {
  it("allows a slot starting exactly when the previous buffer ends", () => {
    const ctx = context({ bookings: [booking("a", "10:00", "11:00", 30)] });
    expect(checkSlot(ctx, at("11:30"), lesson)).toEqual({ ok: true });
    expect(checkSlot(ctx, at("11:29"), lesson)).toMatchObject({ ok: false });
  });

  it("allows a slot whose buffer ends exactly when the next booking starts", () => {
    const ctx = context({ bookings: [booking("b", "12:00", "13:00")] });
    expect(checkSlot(ctx, at("10:45"), lesson)).toEqual({ ok: true });
    expect(checkSlot(ctx, at("10:46"), lesson)).toMatchObject({ ok: false });
  });

  it("allows a slot starting at opening and one ending at closing", () => {
    const ctx = context();
    expect(checkSlot(ctx, at("09:00"), lesson)).toEqual({ ok: true });
    expect(checkSlot(ctx, at("18:00"), lesson)).toEqual({ ok: true });
  });

  it("allows a slot ending exactly when blocked time starts", () => {
    const ctx = context({
      blocks: [{ id: "x", startsAt: at("12:00"), endsAt: at("13:00") }],
    });
    expect(checkSlot(ctx, at("11:00"), lesson)).toEqual({ ok: true });
    expect(checkSlot(ctx, at("13:00"), lesson)).toEqual({ ok: true });
  });

  it("leaves out slots that have already started", () => {
    const now = at("10:10");
    expect(checkSlot(context(), at("10:00"), lesson, { now })).toEqual({
      ok: false,
      problem: { kind: "in_past" },
    });
    expect(
      times(availableSlots(context(), friday, lesson, { now })).slice(0, 2),
    ).toEqual(["10:30", "11:00"]);
  });
});

describe("durations", () => {
  const ctx = context({ bookings: [booking("omar", "15:30", "16:30")] });

  it("fits longer services into fewer places", () => {
    const hour = availableSlots(ctx, friday, lesson, { notBefore: "16:00" });
    const twoHours = availableSlots(
      ctx,
      friday,
      { durationMinutes: 120, bufferMinutes: 15 },
      { notBefore: "16:00" },
    );
    expect(times(hour)).toEqual(["17:00", "17:30", "18:00"]);
    expect(times(twoHours)).toEqual(["17:00"]);
  });

  it("returns slots with the service's length", () => {
    const [slot] = availableSlots(context(), friday, {
      durationMinutes: 90,
      bufferMinutes: 0,
    });
    expect(clockTimeOf(slot.startsAt, tz)).toBe("09:00");
    expect(clockTimeOf(slot.endsAt, tz)).toBe("10:30");
  });

  it("won't offer a service longer than the working day", () => {
    const saturday = "2026-10-03"; // 09:00–13:00
    expect(
      availableSlots(context(), saturday, {
        durationMinutes: 300,
        bufferMinutes: 0,
      }),
    ).toEqual([]);
  });
});

describe("no availability", () => {
  it("returns nothing for a fully booked day", () => {
    const full = context({
      bookings: [
        booking("a", "09:00", "12:00", 15),
        booking("b", "12:15", "15:00", 15),
        booking("c", "15:15", "19:00", 0),
      ],
    });
    expect(availableSlots(full, friday, lesson)).toEqual([]);
    expect(firstAvailableSlot(full, friday, lesson)).toBeUndefined();
  });

  it("returns nothing when blocked time covers the day", () => {
    const blocked = context({
      blocks: [{ id: "off", startsAt: at("00:00"), endsAt: at("23:59") }],
    });
    expect(availableSlots(blocked, friday, lesson)).toEqual([]);
  });

  it("returns nothing when there are no working hours at all", () => {
    expect(
      availableDays(context({ workingHours: [] }), friday, 7, lesson).every(
        (d) => d.slots.length === 0,
      ),
    ).toBe(true);
  });
});

describe("free time", () => {
  it("is working time minus bookings, buffers and blocks", () => {
    const ctx = context({
      bookings: [booking("omar", "15:30", "16:30")],
      blocks: [{ id: "x", startsAt: at("12:00"), endsAt: at("13:00") }],
    });
    const free = freeIntervals(ctx, friday).map(
      (i) => `${clockTimeOf(i.startsAt, tz)}–${clockTimeOf(i.endsAt, tz)}`,
    );
    expect(free).toEqual(["09:00–12:00", "13:00–15:30", "16:45–19:00"]);
  });
});

describe("clock changes (Europe/London)", () => {
  // Clocks go forward on Sun 29 Mar 2026 and back on Sun 25 Oct 2026.
  const sundays = context({
    workingHours: [{ weekday: 7, start: "09:00", end: "17:00" }],
  });

  it("opens at 09:00 local time on the day clocks go forward", () => {
    const [window] = workingWindows(sundays, "2026-03-29");
    expect(window.startsAt.toISOString()).toBe("2026-03-29T08:00:00.000Z");
    expect(window.endsAt.toISOString()).toBe("2026-03-29T16:00:00.000Z");
  });

  it("opens at 09:00 local time on the day clocks go back", () => {
    const [window] = workingWindows(sundays, "2026-10-25");
    expect(window.startsAt.toISOString()).toBe("2026-10-25T09:00:00.000Z");
  });

  it("offers the same local times either side of a clock change", () => {
    const before = times(availableSlots(sundays, "2026-10-18", lesson));
    const on = times(availableSlots(sundays, "2026-10-25", lesson));
    const after = times(availableSlots(sundays, "2026-11-01", lesson));
    expect(on).toEqual(before);
    expect(after).toEqual(before);
    expect(on[0]).toBe("09:00");
    expect(on.at(-1)).toBe("16:00");
  });

  it("measures a booking across the change in real minutes", () => {
    // A window through the night clocks go back is an hour longer.
    const night = context({
      workingHours: [{ weekday: 7, start: "00:00", end: "04:00" }],
    });
    const [window] = workingWindows(night, "2026-10-25");
    expect(
      (window.endsAt.getTime() - window.startsAt.getTime()) / 3_600_000,
    ).toBe(5);
  });
});

describe("schedule modes", () => {
  const flexible = (overrides: Partial<ScheduleContext> = {}) =>
    context({ mode: "flexible", workingHours: [], ...overrides });

  it("regular: offers times inside the weekly hours only", () => {
    expect(checkSlot(context(), at("10:00"), lesson)).toEqual({ ok: true });
    expect(checkSlot(context(), at("19:30"), lesson)).toEqual({
      ok: false,
      problem: { kind: "outside_hours" },
    });
  });

  it("flexible: needs no weekly hours and ignores any that are stored", () => {
    const sunday = "2026-10-04"; // a day off in the regular pattern
    expect(checkSlot(flexible(), at("10:00", sunday), lesson)).toEqual({
      ok: true,
    });
    const withStoredHours = flexible({ workingHours: context().workingHours });
    expect(checkSlot(withStoredHours, at("20:00"), lesson)).toEqual({
      ok: true,
    });
    expect(checkSlot(withStoredHours, at("10:00", sunday), lesson)).toEqual({
      ok: true,
    });
  });

  it("flexible: stays inside the bookable day", () => {
    const { start, end } = FLEXIBLE_BOOKABLE_DAY;
    expect(start).toBe("06:00");
    expect(end).toBe("22:00");
    const slots = times(availableSlots(flexible(), friday, lesson));
    expect(slots[0]).toBe("06:00");
    expect(slots.at(-1)).toBe("21:00");
    expect(checkSlot(flexible(), at("05:30"), lesson)).toMatchObject({
      ok: false,
      problem: { kind: "outside_hours" },
    });
    expect(checkSlot(flexible(), at("21:30"), lesson)).toMatchObject({
      ok: false,
      problem: { kind: "outside_hours" },
    });
    expect(checkSlot(flexible(), at("21:00"), lesson)).toEqual({ ok: true });
  });

  it("flexible: still respects bookings, buffers and blocked time", () => {
    const ctx = flexible({
      bookings: [booking("omar", "15:30", "16:30")],
      blocks: [{ id: "mot", startsAt: at("12:00"), endsAt: at("13:00") }],
    });
    expect(checkSlot(ctx, at("16:00"), lesson)).toMatchObject({
      ok: false,
      problem: { kind: "overlaps_booking" },
    });
    expect(checkSlot(ctx, at("16:30"), lesson)).toMatchObject({
      ok: false,
      problem: { kind: "inside_buffer" },
    });
    expect(checkSlot(ctx, at("12:30"), lesson)).toMatchObject({
      ok: false,
      problem: { kind: "blocked" },
    });
    expect(
      times(availableSlots(ctx, friday, lesson, { notBefore: "16:00" })),
    ).toEqual([
      "17:00",
      "17:30",
      "18:00",
      "18:30",
      "19:00",
      "19:30",
      "20:00",
      "20:30",
      "21:00",
    ]);
  });

  it("flexible: fits longer services into the day and nothing past its end", () => {
    const twoHours = { durationMinutes: 120, bufferMinutes: 30 };
    const slots = times(availableSlots(flexible(), friday, twoHours));
    expect(slots[0]).toBe("06:00");
    expect(slots.at(-1)).toBe("20:00");
  });

  it("flexible: keeps local times across clock changes", () => {
    const [back] = workingWindows(flexible(), "2026-10-25");
    expect(back.startsAt.toISOString()).toBe("2026-10-25T06:00:00.000Z");
    expect(back.endsAt.toISOString()).toBe("2026-10-25T22:00:00.000Z");
    const [forward] = workingWindows(flexible(), "2026-03-29");
    expect(forward.startsAt.toISOString()).toBe("2026-03-29T05:00:00.000Z");
    expect(times(availableSlots(flexible(), "2026-10-25", lesson))[0]).toBe(
      "06:00",
    );
  });

  it("flexible: free time is the bookable day minus what's taken", () => {
    const ctx = flexible({ bookings: [booking("omar", "15:30", "16:30")] });
    const free = freeIntervals(ctx, friday).map(
      (i) => `${clockTimeOf(i.startsAt, tz)}–${clockTimeOf(i.endsAt, tz)}`,
    );
    expect(free).toEqual(["06:00–15:30", "16:45–22:00"]);
  });
});
