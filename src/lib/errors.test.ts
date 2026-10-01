import { afterEach, describe, expect, it, vi } from "vitest";
import { friendlyError, redact } from "@/lib/errors";

afterEach(() => vi.restoreAllMocks());

describe("database errors", () => {
  it("logs an unexpected failure with its operation and code, and shows a plain sentence", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = friendlyError(
      {
        code: "23503",
        message:
          'insert or update on table "businesses" violates foreign key constraint "businesses_owner_id_fkey"',
      },
      "completeOnboarding",
    );
    expect(message).toBe(
      "Something went wrong. Nothing was changed. Please try again.",
    );
    expect(message).not.toMatch(/businesses|23503|constraint/);
    expect(log).toHaveBeenCalledWith(
      "[pingflow] completeOnboarding failed",
      expect.objectContaining({
        code: "23503",
        message: expect.stringContaining("businesses_owner_id_fkey"),
      }),
    );
  });

  it("explains expected failures without logging them", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      friendlyError(
        { code: "P0001", hint: "slot_unavailable" },
        "createBooking",
      ),
    ).toMatch(/taken a moment ago/);
    expect(log).not.toHaveBeenCalled();
  });
});

describe("what reaches the logs", () => {
  it("masks phone numbers and emails a database error echoes back", () => {
    expect(
      redact(
        "Key (business_id, phone_e164)=(0b9f2c1e-4a5b-4c6d-8e7f-90a1b2c3d4e5, +447700900123) already exists",
      ),
    ).toBe(
      "Key (business_id, phone_e164)=(0b9f2c1e-4a5b-4c6d-8e7f-90a1b2c3d4e5, [number]) already exists",
    );
    expect(redact("wa_id 447700900123 for sarah@example.com")).toBe(
      "wa_id [number] for [email]",
    );
  });

  it("keeps what operators need: dates, times and IDs", () => {
    const line = "run 7c1d4b2e-0f3a-4e5b-9c6d-1a2b3c4d5e6f at 2026-10-01 16:00";
    expect(redact(line)).toBe(line);
  });
});
