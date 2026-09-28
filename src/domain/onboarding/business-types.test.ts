import { describe, expect, it } from "vitest";
import {
  bufferHintFor,
  businessTypes,
  servicePlaceholderFor,
  servicesAfterChoosingType,
  suggestedServicesFor,
} from "@/domain/onboarding/business-types";
import { bufferOptions, durationOptions } from "@/domain/onboarding/setup";

const summary = (type: Parameters<typeof suggestedServicesFor>[0]) =>
  suggestedServicesFor(type).map(
    (s) => `${s.name} ${s.durationMinutes}/${s.bufferMinutes}`,
  );

describe("starting services by line of work", () => {
  it("suggests what each trade actually sells", () => {
    expect(summary("driving_instructor")).toEqual([
      "1 hour lesson 60/15",
      "90 minute lesson 90/15",
      "2 hour lesson 120/15",
    ]);
    expect(summary("tutor")).toEqual([
      "1 hour tutoring 60/0",
      "90 minute tutoring 90/0",
    ]);
    expect(summary("personal_trainer")).toEqual([
      "1 hour session 60/15",
      "30 minute session 30/15",
    ]);
    expect(summary("cleaner")).toEqual([
      "Standard clean 120/30",
      "Deep clean 180/30",
    ]);
    expect(summary("beauty")).toEqual(["Appointment 60/15"]);
    expect(summary("dog_groomer")).toEqual([
      "Full groom 120/15",
      "Wash & tidy 60/15",
    ]);
    expect(summary("photographer")).toEqual(["Photo session 60/30"]);
  });

  it("keeps “Something else” generic", () => {
    expect(summary("other")).toEqual(["Appointment 60/0"]);
    expect(servicePlaceholderFor("other")).toBe("e.g. Standard appointment");
  });

  it("uses trade-specific examples, and never driving words elsewhere", () => {
    expect(servicePlaceholderFor("dog_groomer")).toBe("e.g. Nail trim");
    expect(servicePlaceholderFor("tutor")).toBe("e.g. GCSE Maths");
    expect(servicePlaceholderFor("driving_instructor")).toBe(
      "e.g. Refresher lesson",
    );
    expect(servicePlaceholderFor(null)).toBe("e.g. Standard appointment");
    for (const type of businessTypes) {
      if (type.value === "driving_instructor") continue;
      const words = [
        ...summary(type.value),
        servicePlaceholderFor(type.value),
        bufferHintFor(type.value),
      ].join(" ");
      expect(words).not.toMatch(/driving|lesson|pupil/i);
    }
  });

  it("only suggests lengths and times the pickers offer, one to three of them", () => {
    for (const type of businessTypes) {
      const services = suggestedServicesFor(type.value);
      expect(services.length).toBeGreaterThanOrEqual(1);
      expect(services.length).toBeLessThanOrEqual(3);
      for (const s of services) {
        expect(durationOptions).toContain(s.durationMinutes);
        expect(bufferOptions).toContain(s.bufferMinutes);
      }
    }
  });

  it("hands out copies, so editing one never changes the suggestions", () => {
    const first = suggestedServicesFor("tutor");
    first[0].name = "Changed";
    expect(suggestedServicesFor("tutor")[0].name).toBe("1 hour tutoring");
  });
});

describe("changing line of work during onboarding", () => {
  it("fills in suggestions the first time a trade is chosen", () => {
    const result = servicesAfterChoosingType([], null, "dog_groomer");
    expect(result.replaced && result.services[0].name).toBe("Full groom");
  });

  it("swaps suggestions while they are untouched", () => {
    const driving = suggestedServicesFor("driving_instructor");
    const result = servicesAfterChoosingType(
      driving,
      "driving_instructor",
      "tutor",
    );
    expect(result.replaced && result.services.map((s) => s.name)).toEqual([
      "1 hour tutoring",
      "90 minute tutoring",
    ]);
  });

  it("keeps the owner's list once they've renamed a service", () => {
    const edited = suggestedServicesFor("driving_instructor");
    edited[0].name = "Motorway lesson";
    expect(
      servicesAfterChoosingType(edited, "driving_instructor", "tutor"),
    ).toEqual({ replaced: false });
  });

  it("keeps the owner's list after they remove, add or retime a service", () => {
    const removed = suggestedServicesFor("cleaner").slice(0, 1);
    const added = [
      ...suggestedServicesFor("cleaner"),
      { name: "Oven clean", durationMinutes: 60, bufferMinutes: 30 },
    ];
    const retimed = suggestedServicesFor("cleaner");
    retimed[1].durationMinutes = 240;
    for (const list of [removed, added, retimed]) {
      expect(servicesAfterChoosingType(list, "cleaner", "beauty")).toEqual({
        replaced: false,
      });
    }
  });

  it("treats a list that happens to match another trade as the owner's", () => {
    // Suggestions for a different trade than the one picked before: the
    // owner typed them, so they stay.
    const tutorList = suggestedServicesFor("tutor");
    expect(
      servicesAfterChoosingType(tutorList, "driving_instructor", "cleaner"),
    ).toEqual({ replaced: false });
  });

  it("ignores stray spaces when deciding whether a list is untouched", () => {
    const spaced = suggestedServicesFor("beauty");
    spaced[0].name = " Appointment ";
    expect(
      servicesAfterChoosingType(spaced, "beauty", "photographer").replaced,
    ).toBe(true);
  });
});
