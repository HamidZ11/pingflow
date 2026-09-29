import { timingSafeEqual } from "node:crypto";
import type { WhatsAppEnv } from "@/lib/whatsapp/config";
import { verifyChallenge } from "@/lib/whatsapp/signature";
import type { IngestResult } from "@/features/whatsapp/ingest";

// The webhook's HTTP behaviour, separate from Next.js so it can be tested
// directly. Responses say as little as possible.

const text = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

/** GET: Meta's subscription handshake. */
export function handleVerification(url: URL, env: WhatsAppEnv): Response {
  if (!env.verifyToken) return text("Not configured", 404);
  const challenge = verifyChallenge(url.searchParams, env.verifyToken);
  return challenge ? text(challenge, 200) : text("Forbidden", 403);
}

/** POST: store the events (after checking they're from Meta), then work. */
export async function handleNotification(
  request: Request,
  deps: {
    env: WhatsAppEnv;
    ingest: (input: {
      rawBody: Uint8Array;
      signature: string | null;
      appSecret: string;
    }) => Promise<IngestResult>;
    /** Runs the worker once the response has gone. */
    afterResponse: () => void;
  },
): Promise<Response> {
  if (!deps.env.appSecret) return text("Not configured", 503);
  // The exact bytes Meta signed: read once, never re-serialised.
  const rawBody = new Uint8Array(await request.arrayBuffer());
  let result: IngestResult;
  try {
    result = await deps.ingest({
      rawBody,
      signature: request.headers.get("x-hub-signature-256"),
      appSecret: deps.env.appSecret,
    });
  } catch {
    // Not stored: an error makes Meta deliver it again later.
    return text("Try again", 500);
  }
  if (result.status !== 200) return text("Rejected", result.status);
  if (result.stored > 0) deps.afterResponse();
  return text("OK", 200);
}

/** The scheduled worker route: a bearer secret, compared in constant time. */
export function authorisedWorker(
  header: string | null,
  secret: string | null,
): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
