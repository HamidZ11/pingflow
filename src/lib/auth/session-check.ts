// Whether an error from checking the signed-in account means the session
// is over for good (the account is gone, or the session was revoked), as
// opposed to a passing problem such as a dropped connection.
//
// Why this matters: sessions are signed tokens checked locally, so a token
// stays valid for up to an hour even if its account has been deleted (for
// example, when a local database is reset). Such a session looks signed in
// but can't save anything, so it's ended cleanly instead.

const endedCodes = new Set([
  "user_not_found",
  "session_not_found",
  "session_expired",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "bad_jwt",
  "no_authorization",
  "user_banned",
]);

export function isEndedSession(
  error: { status?: number; code?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code && endedCodes.has(error.code)) return true;
  return error.status === 401 || error.status === 403;
}
