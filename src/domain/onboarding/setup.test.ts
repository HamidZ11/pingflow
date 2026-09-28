import { describe, expect, it } from "vitest";
import {
  defaultWeekHours,
  emptyDraft,
  isStepValid,
  parseSetupDraft,
  suggestedServicesFor,
  toSetupPayload,
  validateHours,
  validateServices,
} from "@/domain/onboarding/setup";

describe("onboarding", () => {
  const draft = {
    ...emptyDraft(),
    businessType: "driving_instructor" as const,
    services: suggestedServicesFor("driving_instructor"),
  };

  it("suggests services for the chosen trade", () => {
    expect(draft.services[0]).toEqual({
      name: "1 hour lesson",
      durationMinutes: 60,
      bufferMinutes: 15,
    });
  });

  it("needs named, distinct services", () => {
    expect(validateServices([]).summary).toBe("Add at least one service.");
    const { errors } = validateServices([
      { name: " ", durationMinutes: 60, bufferMinutes: 0 },
      { name: "Lesson", durationMinutes: 60, bufferMinutes: 0 },
      { name: "lesson", durationMinutes: 90, bufferMinutes: 0 },
    ]);
    expect(errors[0].name).toBe("Give this service a name.");
    expect(errors[1].name).toBeUndefined();
    expect(errors[2].name).toBe("You already have a service with this name.");
  });

  it("needs at least one working day that ends after it starts", () => {
    const hours = defaultWeekHours();
    hours[1] = { open: true, start: "17:00", end: "09:00" };
    expect(validateHours(hours).errors[1]).toBe("Finish after you start.");

    const closed = defaultWeekHours();
    for (const day of [1, 2, 3, 4, 5] as const) closed[day].open = false;
    expect(validateHours(closed).summary).toBe(
      "Choose at least one working day.",
    );
  });

  it("builds the setup payload with only open days", () => {
    expect(isStepValid("services", draft)).toBe(true);
    const payload = toSetupPayload(draft);
    expect(payload.timezone).toBe("Europe/London");
    expect(payload.working_hours).toHaveLength(5);
    expect(payload.working_hours[0]).toEqual({
      weekday: 1,
      start_time: "09:00",
      end_time: "17:00",
    });
    expect(payload.automation.reminder_lead_minutes).toBe(1440);
    expect(payload.schedule_mode).toBe("regular");
  });

  it("doesn't ask for weekly hours in flexible mode, but keeps usable ones", () => {
    const closed = defaultWeekHours();
    for (const day of [1, 2, 3, 4, 5] as const) closed[day].open = false;
    const flexible = {
      ...draft,
      scheduleMode: "flexible" as const,
      hours: closed,
    };
    expect(isStepValid("hours", flexible)).toBe(true);
    expect(toSetupPayload(flexible)).toMatchObject({
      schedule_mode: "flexible",
      working_hours: [],
    });
    const kept = toSetupPayload({ ...draft, scheduleMode: "flexible" });
    expect(kept.working_hours).toHaveLength(5);
    expect(parseSetupDraft(flexible)?.scheduleMode).toBe("flexible");
    expect(parseSetupDraft({ ...draft, scheduleMode: "sometimes" })).toBeNull();
  });

  it("rejects a tampered submission", () => {
    expect(parseSetupDraft(draft)).not.toBeNull();
    expect(parseSetupDraft({ ...draft, businessType: "wizard" })).toBeNull();
    expect(
      parseSetupDraft({
        ...draft,
        services: [{ name: "Lesson", durationMinutes: 7, bufferMinutes: 0 }],
      }),
    ).toBeNull();
  });
});
