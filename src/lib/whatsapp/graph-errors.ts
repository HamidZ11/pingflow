import type {
  SendFailureCategory,
  SendResult,
} from "@/lib/messaging/transport";

// Graph API errors, sorted by what to do about them. Codes from Meta's
// WhatsApp Cloud API error reference.

const transientCodes = new Set([
  2, // service temporarily unavailable
  4, // app rate limit
  80007, // account rate limit
  130429, // throughput limit
  131000, // unknown error: try again
  131016, // service unavailable
  131048, // spam rate limit
  131056, // pair rate limit (same recipient too often)
  133004, // server temporarily unavailable
]);

const connectionCodes = new Set([
  0, // authentication failed
  3, // capability
  10, // permission denied
  33, // phone number deleted
  190, // access token expired or invalid
  131005, // access denied
  131031, // account locked
  131042, // payment method problem
  131045, // number not registered
  133010, // number not registered
]);

const recipientCodes = new Set([
  131021, // sender and recipient are the same number
  131026, // message undeliverable (not on WhatsApp, old app, terms)
  131050, // user stopped marketing messages
]);

export function classifyGraphError(
  httpStatus: number,
  body: unknown,
): Extract<SendResult, { ok: false }> {
  const error =
    body && typeof body === "object" && "error" in body
      ? ((body as { error: unknown }).error as Record<string, unknown> | null)
      : null;
  const code = typeof error?.code === "number" ? error.code : null;
  let category: SendFailureCategory;

  if (code !== null && transientCodes.has(code)) category = "transient";
  else if (code === 131047) category = "window_closed";
  else if (code !== null && code >= 132000 && code < 133000)
    category = "template_rejected";
  else if (
    code !== null &&
    (connectionCodes.has(code) || (code >= 200 && code < 300))
  )
    category = "connection";
  else if (code !== null && recipientCodes.has(code))
    category = "recipient_unavailable";
  else if (httpStatus === 401 || httpStatus === 403) category = "connection";
  else if (httpStatus === 429 || httpStatus >= 500) category = "transient";
  else category = "rejected";

  return { ok: false, category, code };
}

const notSentNetworkCodes = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
]);

/**
 * A request that threw. If it never left (DNS, connection refused), it's
 * safe to try again. If it may have reached WhatsApp (timed out, reset
 * mid-way), its outcome is unknown and it must not be sent again.
 */
export function classifyNetworkError(
  error: unknown,
): Extract<SendResult, { ok: false }> {
  const cause = (error as { cause?: { code?: string } })?.cause;
  const code = cause?.code ?? (error as { code?: string })?.code;
  return {
    ok: false,
    category:
      code && notSentNetworkCodes.has(code) ? "transient" : "outcome_unknown",
    code: null,
  };
}
