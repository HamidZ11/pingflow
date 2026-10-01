import { expect, type Page, test } from "@playwright/test";
import { corpus } from "../src/domain/messages/fixtures/corpus";
import {
  type Interpretation,
  interpretation,
} from "../src/domain/messages/interpretation";
import { processInboundMessage } from "../src/features/messages/pipeline";
import {
  FixtureMessageInterpreter,
  StaticMessageInterpreter,
} from "../src/lib/ai/fixture-interpreter";
import type { MessageInterpreter } from "../src/lib/ai/interpreter";
import { adminClient, hasKeys } from "./database/db";
import { isNavigationNoise, open, seedDemo, signIn } from "./helpers";

// Messages processed by the pipeline (as the WhatsApp webhook will), then
// answered by the owner in the browser: a new booking, a cancellation, a
// message Pingflow wasn't sure about, and one from a number it doesn't know.
// The existing Sarah test (reschedule.spec.ts) covers the reschedule flow,
// whose request the demo seed now also creates through the pipeline.

test.skip(!hasKeys, "Needs the Supabase keys in .env.local");

const fixture = new FixtureMessageInterpreter(corpus);

async function arrange(email: string) {
  seedDemo(email);
  const admin = adminClient();
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 500 });
  const userId = users.users.find((u) => u.email === email)!.id;
  const { data: business } = await admin
    .from("businesses")
    .select("id")
    .eq("owner_id", userId)
    .single();

  let n = 0;
  const send = (
    from: string,
    body: string,
    interpreter: MessageInterpreter = fixture,
  ) =>
    processInboundMessage(
      { db: admin, interpreter },
      {
        businessId: business!.id,
        from,
        body,
        externalId: `e2e-${email}-${++n}`,
        source: "simulator",
      },
    );
  const reading = (
    i: Partial<Interpretation> & Pick<Interpretation, "intent">,
  ) => new StaticMessageInterpreter(interpretation(i));

  // D: one question, then the owner.
  await send("+447700900123", "Can we do later?");
  await send("+447700900123", "dunno really");
  // E: a number Pingflow doesn't know.
  await send("+447700900111", "When is Sarah booked?");
  // A cancellation and a new booking, both for approval.
  await send(
    "+447700900234",
    "Sorry, can't make my next lesson",
    reading({
      intent: "cancellation_request",
      referenced_booking: {
        kind: "next",
        date: null,
        time: null,
        service: null,
      },
      cancellation_scope: "single",
    }),
  );
  await send(
    "+447700900345",
    "Could I book a lesson next Wednesday at 10?",
    reading({
      intent: "new_booking_request",
      requested_date: {
        kind: "weekday",
        weekday: "wednesday",
        week: "next",
        day: null,
        month: null,
      },
      requested_time: { constraint: "exact", time: "10:00" },
      service_reference: "Driving lesson",
    }),
  );
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("the owner answers pipeline-made requests and messages from Attention", async ({
  page,
  baseURL,
}, testInfo) => {
  const email = `e2e-messages-${testInfo.project.name}@pingflow.test`;
  await arrange(email);
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await signIn(page, email, baseURL!);
  await expect(
    page.getByRole("heading", { level: 1, name: "Attention" }),
  ).toBeVisible();

  const approvals = page.getByRole("region", { name: /Needs approval/ });
  const replies = page.getByRole("region", { name: /Needs a reply/ });
  await expect(approvals.getByRole("article")).toHaveCount(3);
  await expect(replies.getByRole("article")).toHaveCount(2);

  const booking = page
    .getByRole("article")
    .filter({ hasText: "Aisha Begum wants to book a driving lesson" });
  const cancellation = page
    .getByRole("article")
    .filter({ hasText: "Tom Reid wants to cancel" });
  const unsure = page
    .getByRole("article")
    .filter({ hasText: "Pingflow isn’t sure what Sarah means" });
  const stranger = page.getByRole("article").filter({
    hasText: "A number Pingflow doesn’t know asked about a booking",
  });
  await expect(booking).toContainText("Asked for");
  await expect(booking).toContainText("It’s the time they asked for.");
  await expect(cancellation).toContainText("Pingflow understood");
  await expect(unsure).toContainText("dunno really");
  await expect(stranger).toContainText("+44 7700 900111");
  await expect(stranger).toContainText(
    "Pingflow didn’t share any booking details.",
  );

  // Owners never see how messages are read.
  await expect(page.locator("main")).not.toContainText(
    /\b(AI|GPT|OpenAI|model|tokens|confidence)\b/,
  );

  // Phone widths: nothing spills sideways.
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 800 });
    await noHorizontalScroll(page);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // Reply to the message Pingflow wasn't sure about.
  await unsure.getByRole("button", { name: "Reply" }).click();
  const sheet = page.getByRole("dialog", { name: "Reply to Sarah" });
  await expect(sheet).toBeVisible();
  const reply = sheet.getByLabel("Your reply");
  await expect(reply).toBeVisible();
  await reply.fill("Hi Sarah, do you mean later today or another day?");
  await sheet.getByRole("button", { name: "Record reply" }).click();
  await expect(page.getByRole("status")).toContainText("Reply recorded.");
  await expect(unsure).toHaveCount(0);

  // The stranger: handled outside Pingflow.
  await stranger.getByRole("button", { name: "Mark as handled" }).click();
  await expect(stranger).toHaveCount(0);

  // Approve the new booking at the time asked for.
  await booking.getByRole("button", { name: /^Approve \w{3} 10:00$/ }).click();
  await expect(page.getByRole("status")).toContainText("is booked for");
  await expect(booking).toHaveCount(0);

  // Approve the cancellation.
  await cancellation
    .getByRole("button", { name: "Approve cancellation" })
    .click();
  await expect(page.getByRole("status")).toContainText("is cancelled");
  await expect(cancellation).toHaveCount(0);

  // Only Sarah's reschedule is left.
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText("wants to move");

  // Activity tells each story.
  await page.waitForLoadState("networkidle");
  await open(page, "/app/activity");
  const activity = page.locator("main ol");
  for (const line of [
    /Question to Sarah Khan/,
    /Pingflow wasn’t sure what Sarah Khan meant and left it for you/,
    /Your reply to Sarah Khan/,
    /\+44 7700 900111 sent a message/,
    /Pingflow doesn’t know this number/,
    /Pingflow understood: Aisha Begum wants to book a driving lesson for/,
    /Pingflow asked you to approve the booking/,
    /Driving lesson booked for Aisha Begum/,
    /Pingflow understood: Tom Reid wants to cancel/,
    /You approved the cancellation/,
  ]) {
    await expect(activity).toContainText(line);
  }
  await expect(page.locator("main")).not.toContainText(
    /\b(AI|GPT|OpenAI|model|tokens|confidence)\b/,
  );

  expect(errors.filter((e) => !isNavigationNoise(e))).toEqual([]);
});

test("the message simulator doesn't exist outside development", async ({
  page,
  request,
  baseURL,
}, testInfo) => {
  // Signed out.
  const anonymous = await request.get("/app/dev/messages", {
    maxRedirects: 0,
  });
  expect(anonymous.status()).toBe(404);

  // Signed in.
  const email = `e2e-dev-${testInfo.project.name}@pingflow.test`;
  seedDemo(email);
  await signIn(page, email, baseURL!);
  await expect(
    page.getByRole("heading", { level: 1, name: "Attention" }),
  ).toBeVisible();
  const response = await page.goto("/app/dev/messages");
  expect(response?.status()).toBe(404);
  await expect(page.locator("body")).not.toContainText("Message simulator");
});

test("nothing about the model, WhatsApp credentials or their keys reaches the browser", async ({
  page,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Checks the build once");
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(js|css|html|json)$/.test(name)) files.push(path);
    }
  };
  walk(".next/static");
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    expect(text, file).not.toMatch(
      /OPENAI_API_KEY|api\.openai\.com|SUPABASE_SECRET_KEY|message_interpreter_v\d|owner_command_v\d|WHATSAPP_ACCESS_TOKEN|META_APP_SECRET|WHATSAPP_VERIFY_TOKEN|WHATSAPP_WORKER_SECRET|graph\.facebook\.com/,
    );
  }

  // And the signed-in app's HTML doesn't carry them either.
  const email = `e2e-bundle-${testInfo.project.name}@pingflow.test`;
  seedDemo(email);
  await signIn(page, email, baseURL!);
  await expect(
    page.getByRole("heading", { level: 1, name: "Attention" }),
  ).toBeVisible();
  const html = await page.content();
  expect(html).not.toMatch(
    /OPENAI|openai|sk-[A-Za-z0-9]{8}|WHATSAPP_|META_APP|graph\.facebook|phone_number_id|waba_id/,
  );
});
