import { createHmac, timingSafeEqual } from "node:crypto";

// Proof that a webhook came from Meta. Every POST carries
// X-Hub-Signature-256: "sha256=" + HMAC-SHA256(raw body, app secret). It's
// checked against the exact bytes received, before anything is parsed.

function safeEqual(a: Buffer, b: Buffer) {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifySignature(
  rawBody: Uint8Array,
  header: string | null,
  appSecret: string,
): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const given = header.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(given)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  return safeEqual(Buffer.from(given, "hex"), expected);
}

/** The body signed as Meta signs it: for tests and the local webhook tool. */
export function signBody(rawBody: Uint8Array | string, appSecret: string) {
  return `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
}

/**
 * The subscription handshake: GET ?hub.mode=subscribe&hub.verify_token=…
 * &hub.challenge=…. Returns the challenge to echo, or null to refuse.
 */
export function verifyChallenge(
  params: URLSearchParams,
  verifyToken: string,
): string | null {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token") ?? "";
  const challenge = params.get("hub.challenge");
  if (
    mode !== "subscribe" ||
    !challenge ||
    !/^[\w.-]{1,200}$/.test(challenge)
  ) {
    return null;
  }
  return safeEqual(Buffer.from(token), Buffer.from(verifyToken))
    ? challenge
    : null;
}
