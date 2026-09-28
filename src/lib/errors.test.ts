import { afterEach, describe, expect, it, vi } from "vitest";
import { friendlyError } from "@/lib/errors";

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
