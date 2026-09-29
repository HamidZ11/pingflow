// WhatsApp Cloud API settings, in one place. The Graph API version is
// pinned here and nowhere else: v26.0 (released 29 July 2026) was current
// when this was written. Check Meta's changelog before moving it.

export const GRAPH_API_VERSION = "v26.0";
export const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/** One send, start to finish. A booking change never waits on it. */
export const SEND_TIMEOUT_MS = 10_000;

/** Attempts at a temporary failure before giving up. */
export const MAX_SEND_ATTEMPTS = 5;

/** Seconds to wait before attempt n+1 (n = attempts so far). */
export function retryDelaySeconds(
  attempts: number,
  retryAfter?: number | null,
) {
  const schedule = [30, 120, 600, 1800];
  const base = schedule[Math.min(attempts - 1, schedule.length - 1)] ?? 30;
  return Math.max(base, retryAfter ?? 0);
}

export type WhatsAppEnv = {
  /** Meta's webhook verification handshake. */
  verifyToken: string | null;
  /** Signs every webhook POST (X-Hub-Signature-256). */
  appSecret: string | null;
  /** The developer connection: one number, from the environment. */
  accessToken: string | null;
  phoneNumberId: string | null;
  wabaId: string | null;
  /** Authorises the scheduled worker route. */
  workerSecret: string | null;
};

type Env = Record<string, string | undefined>;

const read = (env: Env, name: string) => env[name]?.trim() || null;

/** Server only: these are secrets. Never import into client code. */
export function whatsAppEnv(env: Env = process.env): WhatsAppEnv {
  return {
    verifyToken: read(env, "WHATSAPP_VERIFY_TOKEN"),
    appSecret: read(env, "META_APP_SECRET"),
    accessToken: read(env, "WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: read(env, "WHATSAPP_PHONE_NUMBER_ID"),
    wabaId: read(env, "WHATSAPP_WABA_ID"),
    workerSecret: read(env, "WHATSAPP_WORKER_SECRET"),
  };
}
