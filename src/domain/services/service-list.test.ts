import { describe, expect, it } from "vitest";
import {
  parseServiceList,
  toServiceListPayload,
} from "@/domain/services/service-list";

const id = "0b2f0128-5c6e-42ec-a61d-7ff2e48528fc";

describe("checking a submitted services list", () => {
  it("accepts a mix of existing and new services", () => {
    const result = parseServiceList([
      { id, name: " Full groom ", durationMinutes: 120, bufferMinutes: 15 },
      { name: "Nail trim", durationMinutes: 30, bufferMinutes: 0 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(toServiceListPayload(result.services)).toEqual([
      { id, name: "Full groom", duration_minutes: 120, buffer_minutes: 15 },
      { id: null, name: "Nail trim", duration_minutes: 30, buffer_minutes: 0 },
    ]);
  });

  it("rejects the whole list if any row is wrong", () => {
    expect(
      parseServiceList([
        { id, name: "Full groom", durationMinutes: 120, bufferMinutes: 15 },
        { name: "", durationMinutes: 60, bufferMinutes: 0 },
      ]),
    ).toEqual({ ok: false, error: "Give this service a name." });
    expect(
      parseServiceList([
        { name: "Groom", durationMinutes: 7, bufferMinutes: 0 },
      ]),
    ).toMatchObject({ ok: false });
  });

  it("rejects empty lists, repeated services and malformed ids", () => {
    expect(parseServiceList([])).toMatchObject({ ok: false });
    expect(parseServiceList("nope")).toMatchObject({ ok: false });
    const twice = { id, name: "A", durationMinutes: 60, bufferMinutes: 0 };
    expect(parseServiceList([twice, { ...twice, name: "B" }])).toMatchObject({
      ok: false,
      error: expect.stringMatching(/twice/),
    });
    expect(
      parseServiceList([
        {
          id: "1; drop table",
          name: "A",
          durationMinutes: 60,
          bufferMinutes: 0,
        },
      ]),
    ).toMatchObject({ ok: false });
    expect(
      parseServiceList([
        { name: "Groom", durationMinutes: 60, bufferMinutes: 0 },
        { name: "groom", durationMinutes: 90, bufferMinutes: 0 },
      ]),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/already have a service with this name/),
    });
  });
});
