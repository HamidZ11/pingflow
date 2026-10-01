import { describe, expect, it } from "vitest";
import { isEndedSession } from "@/lib/auth/session-check";

describe("telling an ended session from a passing problem", () => {
  it("treats a deleted account or revoked session as ended", () => {
    expect(isEndedSession({ status: 403, code: "user_not_found" })).toBe(true);
    expect(isEndedSession({ status: 403, code: "session_not_found" })).toBe(
      true,
    );
    expect(isEndedSession({ status: 401 })).toBe(true);
    expect(isEndedSession({ code: "bad_jwt" })).toBe(true);
  });

  it("doesn't sign anyone out over a connection problem", () => {
    expect(isEndedSession(null)).toBe(false);
    expect(isEndedSession({ status: 500 })).toBe(false);
    expect(isEndedSession({ status: 503, code: "unexpected_failure" })).toBe(
      false,
    );
    expect(isEndedSession({})).toBe(false);
  });
});
