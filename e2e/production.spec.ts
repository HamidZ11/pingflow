import { expect, test } from "@playwright/test";

// The production surface, against the production build: what uptime checks,
// Meta, a scheduler and strangers on the internet each get back. Nothing
// here is authorised, so nothing here does any work or calls Meta.

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "HTTP checks: once is enough",
);

test("the health check says ok, and nothing more", async ({ request }) => {
  const alive = await request.get("/api/health");
  expect(alive.status()).toBe(200);
  expect(alive.headers()["cache-control"]).toBe("no-store");
  expect(await alive.json()).toEqual({ status: "ok" });

  const ready = await request.get("/api/health?ready=1");
  expect(ready.status()).toBe(200);
  expect(await ready.json()).toEqual({ status: "ok", database: "ok" });
});

test("every response carries the baseline protections", async ({ request }) => {
  for (const path of ["/", "/sign-in", "/api/health", "/how-it-works"]) {
    const response = await request.get(path);
    const headers = response.headers();
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["referrer-policy"], path).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers["permissions-policy"], path).toContain("camera=()");
    expect(headers["content-security-policy"], path).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["strict-transport-security"], path).toContain("max-age=");
    expect(headers["x-powered-by"], path).toBeUndefined();
  }
});

test("the worker answers no one without its secret", async ({ request }) => {
  for (const authorization of [undefined, "Bearer guess", "guess"]) {
    for (const method of ["get", "post"] as const) {
      const response = await request[method]("/api/internal/whatsapp/work", {
        headers: authorization ? { authorization } : {},
      });
      expect(response.status(), `${method} ${authorization}`).toBe(404);
      expect(await response.text()).toBe("Not found");
    }
  }
});

test("the webhook refuses anything Meta didn't sign", async ({ request }) => {
  const handshake = await request.get(
    "/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=guess&hub.challenge=123",
  );
  expect(handshake.status()).toBe(403);
  expect(await handshake.text()).not.toContain("123");

  const unsigned = await request.post("/api/webhooks/whatsapp", {
    data: { object: "whatsapp_business_account", entry: [] },
  });
  expect(unsigned.status()).not.toBe(200);
  const forged = await request.post("/api/webhooks/whatsapp", {
    headers: { "x-hub-signature-256": "sha256=deadbeef" },
    data: { object: "whatsapp_business_account", entry: [] },
  });
  expect(forged.status()).not.toBe(200);
});

test("private data and development tools aren't public", async ({
  request,
}) => {
  const availability = await request.get(
    "/api/availability?from=2026-10-02&days=1&service=x",
  );
  expect(availability.status()).toBe(401);
  for (const path of ["/app/dev/messages", "/app/dev/whatsapp"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
  // The app sends strangers to sign in.
  const app = await request.get("/app", { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(app.status());
  expect(app.headers().location).toMatch(/\/sign-in/);
});
