import { expect, type Page, test } from "@playwright/test";
import { interpretation } from "../src/domain/messages/interpretation";
import { processInboundMessage } from "../src/features/messages/pipeline";
import { StaticMessageInterpreter } from "../src/lib/ai/fixture-interpreter";
import { adminClient, hasKeys } from "./database/db";
import { isNavigationNoise, open, seedDemo, signIn } from "./helpers";

// The finish: every app screen at phone widths with nothing off the edge
// and nothing in the console, and the small truths that are easy to get
// wrong (why a message wasn't sent, where a request came from, where the
// keyboard is).

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

async function arrive(page: Page, path: string) {
  await open(page, path);
  await page.locator("main h1").first().waitFor();
}

test("every app screen fits a phone, and the console stays quiet", async ({
  page,
  baseURL,
}, testInfo) => {
  const email = `e2e-polish-screens-${testInfo.project.name}@pingflow.test`;
  seedDemo(email);
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page, email, baseURL!);
  await page.getByRole("heading", { level: 1, name: "Attention" }).waitFor();

  const { data: sarah } = await adminClient()
    .from("customers")
    .select("id")
    .eq("business_id", await businessIdFor(email))
    .eq("full_name", "Sarah Khan")
    .single();
  for (const path of [
    "/app",
    "/app/schedule?view=day",
    "/app/schedule?view=week",
    "/app/customers",
    `/app/customers/${sarah!.id}`,
    "/app/activity",
    "/app/automations",
    "/app/settings",
  ]) {
    await arrive(page, path);
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 800 });
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  expect(errors.filter((e) => !isNavigationNoise(e))).toEqual([]);
});

test("a recorded message says truly why it wasn't sent", async ({
  page,
  baseURL,
}, testInfo) => {
  const email = `e2e-polish-truth-${testInfo.project.name}@pingflow.test`;
  seedDemo(email);
  const businessId = await businessIdFor(email);
  const admin = adminClient();
  const customer = async (name: string) =>
    (
      await admin
        .from("customers")
        .select("id")
        .eq("business_id", businessId)
        .eq("full_name", name)
        .single()
    ).data!.id;
  const sarahId = await customer("Sarah Khan");
  const omarId = await customer("Omar Ali");

  // Sarah's conversation came from the simulator (the demo seed); Omar's
  // came in on WhatsApp before the business was connected.
  const { data: request } = await admin
    .from("pending_actions")
    .select("conversation_id")
    .eq("business_id", businessId)
    .eq("customer_id", sarahId)
    .eq("status", "open")
    .single();
  await processInboundMessage(
    {
      db: admin,
      interpreter: new StaticMessageInterpreter(
        interpretation({ intent: "acknowledgement" }),
      ),
    },
    {
      businessId,
      from: "+447700900456",
      body: "Thanks!",
      externalId: `wamid.polish-${testInfo.project.name}-${Date.now()}`,
      source: "whatsapp",
    },
  );
  const { data: omarInbound } = await admin
    .from("messages")
    .select("conversation_id")
    .eq("business_id", businessId)
    .eq("source", "whatsapp")
    .eq("direction", "inbound")
    .single();

  async function recorded(
    conversationId: string,
    customerId: string,
    body: string,
  ) {
    const { data: m } = await admin
      .from("messages")
      .insert({
        business_id: businessId,
        conversation_id: conversationId,
        direction: "outbound",
        author: "pingflow",
        body,
        delivery: "simulated",
      })
      .select("id")
      .single();
    await admin.from("activity_events").insert({
      business_id: businessId,
      kind: "reply_sent",
      actor: "pingflow",
      customer_id: customerId,
      message_id: m!.id,
      details: { delivery: "simulated" },
    });
  }
  await recorded(
    request!.conversation_id!,
    sarahId,
    "Reply to Sarah, on record.",
  );
  await recorded(
    omarInbound!.conversation_id,
    omarId,
    "Reply to Omar, on record.",
  );

  await signIn(page, email, baseURL!);
  // Where the request came from, said plainly.
  await expect(
    page.getByRole("article").filter({ hasText: "Sarah Khan wants to move" }),
  ).toContainText("Simulated ·");

  const note = (body: string) =>
    page.getByRole("listitem").filter({ hasText: body });
  await arrive(page, "/app/activity");
  await expect(note("Reply to Sarah, on record.")).toContainText(
    "Recorded, not sent: it’s a simulated conversation.",
  );
  await expect(note("Reply to Omar, on record.")).toContainText(
    "Recorded, not sent: WhatsApp isn’t connected yet.",
  );

  // Connected now: Omar's reply wasn't sent because it wasn't connected
  // then; Sarah's is still a simulated conversation.
  await admin.from("whatsapp_connections").insert({
    business_id: businessId,
    mode: "developer",
    status: "connected",
    phone_number_id: `75${String(Date.now()).slice(-8)}${testInfo.project.name === "webkit" ? "2" : "1"}`,
  });
  await page.reload();
  await expect(note("Reply to Omar, on record.")).toContainText(
    "Recorded, not sent: WhatsApp wasn’t connected at the time.",
  );
  await expect(note("Reply to Sarah, on record.")).toContainText(
    "Recorded, not sent: it’s a simulated conversation.",
  );
  await expect(page.locator("main")).not.toContainText(
    "WhatsApp isn’t connected yet",
  );

  await arrive(page, `/app/customers/${sarahId}`);
  await expect(page.locator("main")).toContainText(
    "Not sent: it’s a simulated conversation",
  );
});

test("the keyboard can see where it is in the customer list", async ({
  page,
  baseURL,
}, testInfo) => {
  // Safari doesn't Tab to links by default; Chromium shows the case.
  test.skip(testInfo.project.name !== "chromium", "Tabs to links");
  const email = `e2e-polish-focus-${testInfo.project.name}@pingflow.test`;
  seedDemo(email);
  await signIn(page, email, baseURL!);
  await page.getByRole("heading", { level: 1, name: "Attention" }).waitFor();
  await arrive(page, "/app/customers");
  const first = page.getByRole("table").getByRole("link").first();
  await page.getByLabel("Search customers").focus();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    if (await first.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(first).toBeFocused();
  const ring = await first.evaluate((el) => {
    const after = getComputedStyle(el, "::after");
    return after.outlineStyle !== "none" && parseFloat(after.outlineWidth) > 0;
  });
  expect(ring).toBe(true);
});
