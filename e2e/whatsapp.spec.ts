import { expect, type Page, test } from "@playwright/test";
import { corpus } from "../src/domain/messages/fixtures/corpus";
import { processInboundMessage } from "../src/features/messages/pipeline";
import type { WhatsAppDeps } from "../src/features/whatsapp/deps";
import { runWhatsAppWork } from "../src/features/whatsapp/worker";
import { FixtureMessageInterpreter } from "../src/lib/ai/fixture-interpreter";
import { FakeMessagingTransport } from "../src/lib/whatsapp/fake-transport";
import { adminClient, hasKeys } from "./database/db";
import { isNavigationNoise, open, seedDemo, signIn } from "./helpers";

// The owner's side of WhatsApp: Settings in each connection state, and the
// Attention items the channel adds (a voice note, a message that couldn't
// be sent). Meta is never called; the channel runs with a fake transport.

test.skip(!hasKeys, "Needs the Supabase keys in .env.local");

async function businessIdFor(email: string) {
  const admin = adminClient();
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const userId = users.users.find((u) => u.email === email)!.id;
  const { data } = await admin
    .from("businesses")
    .select("id")
    .eq("owner_id", userId)
    .single();
  return data!.id;
}

async function connect(businessId: string, phoneNumberId: string) {
  const { data, error } = await adminClient()
    .from("whatsapp_connections")
    .insert({
      business_id: businessId,
      mode: "developer",
      status: "connected",
      phone_number_id: phoneNumberId,
      display_phone_number: "+447700900000",
      verified_name: "Alex’s Driving School",
      connected_at: new Date().toISOString(),
      last_inbound_at: new Date(Date.now() - 5 * 60e3).toISOString(),
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id;
}

async function noHorizontalScroll(page: Page) {
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, `${width}px`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test("Settings shows one honest WhatsApp state, and disconnecting works", async ({
  page,
  baseURL,
}, testInfo) => {
  const email = `e2e-wa-settings-${testInfo.project.name}@pingflow.test`;
  seedDemo(email);
  const businessId = await businessIdFor(email);
  await signIn(page, email, baseURL!);
  await expect(
    page.getByRole("heading", { level: 1, name: "Attention" }),
  ).toBeVisible();

  // Not connected: no pretend Connect button.
  await open(page, "/app/settings#whatsapp");
  const section = page.getByRole("region", { name: "WhatsApp" });
  await expect(section).toContainText("Not connected");
  await expect(section).toContainText(
    "Connect WhatsApp Business so Pingflow can receive and reply to customer messages.",
  );
  await expect(section.getByRole("button")).toHaveCount(0);
  await noHorizontalScroll(page);

  // Connected: the number, the name and the last message. No Meta IDs.
  const connectionId = await connect(
    businessId,
    `71${String(Date.now()).slice(-8)}${testInfo.project.name === "webkit" ? "2" : "1"}`,
  );
  await page.reload();
  await expect(section).toContainText("Connected");
  await expect(section).toContainText("+44 7700 900000");
  await expect(section).toContainText("Alex’s Driving School");
  await expect(section).toContainText("Last message");
  await expect(section).not.toContainText(/phone number id|waba|token|graph/i);
  await noHorizontalScroll(page);

  // Needs attention: plain words and a way to check again.
  await adminClient()
    .from("whatsapp_connections")
    .update({
      status: "needs_attention",
      last_error_category: "provider_refused",
    })
    .eq("id", connectionId);
  await page.reload();
  await expect(section).toContainText("WhatsApp needs attention");
  await expect(section).toContainText(
    "Pingflow can’t currently send messages.",
  );
  await section.getByRole("button", { name: "Check again" }).click();
  // No credentials on the test server, so it stays as it is, and says so.
  await expect(section.getByRole("alert")).toContainText(
    "WhatsApp still isn’t accepting Pingflow’s connection",
  );
  await noHorizontalScroll(page);

  // Disconnect, after confirming.
  await section.getByRole("button", { name: "Disconnect" }).click();
  const dialog = page.getByRole("dialog", { name: "Disconnect WhatsApp?" });
  await expect(dialog).toContainText(
    "Your customers, bookings and message history stay in Pingflow.",
  );
  await dialog.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("status")).toContainText(
    "WhatsApp is disconnected",
  );
  await expect(section).toContainText("Not connected");
});

test("Settings says whether owner commands are set up", async ({
  page,
  baseURL,
}, testInfo) => {
  const email = `e2e-wa-owner-${testInfo.project.name}@pingflow.test`;
  seedDemo(email);
  const businessId = await businessIdFor(email);
  await signIn(page, email, baseURL!);
  await expect(
    page.getByRole("heading", { level: 1, name: "Attention" }),
  ).toBeVisible();

  // The demo names the owner's number; WhatsApp isn't connected yet.
  await open(page, "/app/settings#whatsapp");
  const card = page.getByRole("region", { name: "Owner commands" });
  await expect(card).toContainText("Owner WhatsApp number");
  await expect(card).toContainText("+44 7700 900001");
  await expect(card).toContainText("This works once WhatsApp is connected.");
  await expect(card.getByRole("button")).toHaveCount(0);
  await noHorizontalScroll(page);

  // Connected: no caveat.
  await connect(
    businessId,
    `73${String(Date.now()).slice(-8)}${testInfo.project.name === "webkit" ? "2" : "1"}`,
  );
  await page.reload();
  await expect(card).toContainText("+44 7700 900001");
  await expect(card).not.toContainText(
    "This works once WhatsApp is connected.",
  );

  // No owner number: said plainly. This is a production build, so no
  // developer instructions and no setup button.
  await adminClient()
    .from("owner_channel_identities")
    .delete()
    .eq("business_id", businessId);
  await page.reload();
  await expect(card).toContainText("Not set up");
  await expect(card).not.toContainText(/Developer|pnpm|\+44/);
  await expect(card.getByRole("button")).toHaveCount(0);
  await noHorizontalScroll(page);
});

test("Attention shows a voice note and a message WhatsApp couldn't take", async ({
  page,
  baseURL,
}, testInfo) => {
  const email = `e2e-wa-attention-${testInfo.project.name}@pingflow.test`;
  seedDemo(email);
  const businessId = await businessIdFor(email);
  const phoneNumberId = `72${String(Date.now()).slice(-8)}${testInfo.project.name === "webkit" ? "2" : "1"}`;
  await connect(businessId, phoneNumberId);

  const admin = adminClient();
  const transport = new FakeMessagingTransport([
    { ok: false, category: "recipient_unavailable", code: 131026 },
  ]);
  const deps: WhatsAppDeps = {
    db: admin,
    credentials: {
      getCredentials: async (c) => ({
        accessToken: "fake",
        phoneNumberId: c.phoneNumberId,
      }),
    },
    transportFor: () => transport,
    pipeline: { db: admin, interpreter: new FixtureMessageInterpreter(corpus) },
  };
  // Sarah asks on WhatsApp; WhatsApp won't take the reply.
  await processInboundMessage(deps.pipeline, {
    businessId,
    from: "+447700900123",
    body: "When's my next lesson?",
    externalId: `wamid.e2e-${Date.now()}-1`,
    source: "whatsapp",
  });
  // Then a voice note.
  await processInboundMessage(deps.pipeline, {
    businessId,
    from: "+447700900123",
    body: "Voice message",
    externalId: `wamid.e2e-${Date.now()}-2`,
    source: "whatsapp",
    contentType: "audio",
  });
  await runWhatsAppWork(deps);
  expect(transport.sent).toHaveLength(1);

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page, email, baseURL!);
  await expect(
    page.getByRole("heading", { level: 1, name: "Attention" }),
  ).toBeVisible();

  const voice = page
    .getByRole("article")
    .filter({ hasText: "Sarah sent a voice message" });
  await expect(voice).toContainText("Pingflow can’t handle voice messages yet");
  const failed = page
    .getByRole("article")
    .filter({ hasText: "Pingflow couldn’t send its reply to Sarah" });
  await expect(failed).toContainText(
    "WhatsApp couldn’t deliver to this number.",
  );
  await expect(failed).toContainText(/Your next driving lesson is/);
  await expect(page.locator("main")).not.toContainText(/131026|webhook|Graph/);
  await noHorizontalScroll(page);

  // Replying on WhatsApp inside the 24-hour window.
  await voice.getByRole("button", { name: "Reply" }).click();
  const sheet = page.getByRole("dialog", { name: "Reply to Sarah" });
  await expect(sheet).toContainText("Pingflow will send this on WhatsApp.");
  await expect(
    sheet.getByRole("button", { name: "Send reply" }),
  ).toBeDisabled();
  await sheet.getByLabel("Your reply").fill("Thanks, I’ll listen now.");
  await sheet.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Sending your reply on WhatsApp.",
  );
  await expect(voice).toHaveCount(0);

  // Activity says what happened, in plain words.
  await open(page, "/app/activity");
  const activity = page.locator("main ol");
  await expect(activity).toContainText("Sarah Khan sent a voice message");
  await expect(activity).toContainText(
    /Pingflow couldn’t send its reply to Sarah Khan\. WhatsApp couldn’t deliver to this number\./,
  );
  await expect(activity).toContainText("Not sent");
  expect(errors.filter((e) => !isNavigationNoise(e))).toEqual([]);
});
