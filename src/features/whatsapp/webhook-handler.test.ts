import { describe, expect, it } from "vitest";
import type { IngestResult } from "@/features/whatsapp/ingest";
import {
  authorisedScheduledWork,
  authorisedWorker,
  handleNotification,
  handleVerification,
} from "@/features/whatsapp/webhook-handler";
import { whatsAppEnv } from "@/lib/whatsapp/config";

const env = whatsAppEnv({
  WHATSAPP_VERIFY_TOKEN: "verify-me",
  META_APP_SECRET: "app-secret",
});

describe("GET: the subscription handshake", () => {
  it("returns the challenge only for the configured token", async () => {
    const ok = handleVerification(
      new URL(
        "https://x/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=987654",
      ),
      env,
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("987654");
    const wrong = handleVerification(
      new URL(
        "https://x/?hub.mode=subscribe&hub.verify_token=guess&hub.challenge=1",
      ),
      env,
    );
    expect(wrong.status).toBe(403);
    expect(await wrong.text()).not.toContain("verify-me");
  });

  it("is off when no token is configured", () => {
    expect(
      handleVerification(
        new URL(
          "https://x/?hub.mode=subscribe&hub.verify_token=&hub.challenge=1",
        ),
        whatsAppEnv({}),
      ).status,
    ).toBe(404);
  });
});

describe("POST: notifications", () => {
  const request = (body: string, signature?: string) =>
    new Request("https://x/api/webhooks/whatsapp", {
      method: "POST",
      body,
      headers: signature ? { "x-hub-signature-256": signature } : {},
    });

  it("passes the exact bytes and signature to ingestion, then schedules work", async () => {
    let seen: { rawBody: Uint8Array; signature: string | null } | null = null;
    let worked = 0;
    const body = '{"object":"whatsapp_business_account","entry":[]}  ';
    const response = await handleNotification(request(body, "sha256=abc"), {
      env,
      ingest: async (input) => {
        seen = input;
        return { status: 200, stored: 1, duplicates: 0 };
      },
      afterResponse: () => worked++,
    });
    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(seen!.rawBody)).toBe(body);
    expect(seen!.signature).toBe("sha256=abc");
    expect(worked).toBe(1);
  });

  it("rejects what ingestion rejects, and does no work", async () => {
    let worked = 0;
    for (const result of [
      { status: 401, reason: "bad_signature" },
      { status: 400, reason: "bad_json" },
    ] as IngestResult[]) {
      const response = await handleNotification(request("{}"), {
        env,
        ingest: async () => result,
        afterResponse: () => worked++,
      });
      expect(response.status).toBe(result.status);
    }
    expect(worked).toBe(0);
  });

  it("asks Meta to retry when the event couldn't be stored", async () => {
    const response = await handleNotification(request("{}", "sha256=x"), {
      env,
      ingest: async () => {
        throw new Error("database down");
      },
      afterResponse: () => {},
    });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toMatch(/database|secret/);
  });

  it("does nothing without an app secret", async () => {
    const response = await handleNotification(request("{}"), {
      env: whatsAppEnv({}),
      ingest: async () => ({ status: 200, stored: 0, duplicates: 0 }),
      afterResponse: () => {},
    });
    expect(response.status).toBe(503);
  });

  it("doesn't schedule work for a retry it already had", async () => {
    let worked = 0;
    await handleNotification(request("{}", "sha256=x"), {
      env,
      ingest: async () => ({ status: 200, stored: 0, duplicates: 2 }),
      afterResponse: () => worked++,
    });
    expect(worked).toBe(0);
  });
});

describe("the scheduled worker route", () => {
  it("needs the exact bearer secret", () => {
    expect(authorisedWorker("Bearer s3cret", "s3cret")).toBe(true);
    expect(authorisedWorker("Bearer s3cre", "s3cret")).toBe(false);
    expect(authorisedWorker("s3cret", "s3cret")).toBe(false);
    expect(authorisedWorker("Bearer ", null)).toBe(false);
  });

  it("the scheduled worker takes its own secret or Vercel Cron's, nothing else", () => {
    const env = { workerSecret: "worker-s3cret", cronSecret: "cron-s3cret" };
    expect(authorisedScheduledWork("Bearer worker-s3cret", env)).toBe(true);
    expect(authorisedScheduledWork("Bearer cron-s3cret", env)).toBe(true);
    expect(authorisedScheduledWork("Bearer guess", env)).toBe(false);
    expect(authorisedScheduledWork(null, env)).toBe(false);
    const none = { workerSecret: null, cronSecret: null };
    expect(authorisedScheduledWork("Bearer ", none)).toBe(false);
    expect(authorisedScheduledWork("Bearer null", none)).toBe(false);
  });
});
