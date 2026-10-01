import { expect, type Page, test } from "@playwright/test";
import { availableSlots } from "../src/domain/availability/engine";
import {
  type Interpretation,
  interpretation,
} from "../src/domain/messages/interpretation";
import {
  addDays,
  addMinutes,
  clockTimeOf,
  dateKeyOf,
} from "../src/domain/time/zoned";
import { processInboundMessage } from "../src/features/messages/pipeline";
import { loadScheduleContext } from "../src/features/schedule/load-schedule";
import { StaticMessageInterpreter } from "../src/lib/ai/fixture-interpreter";
import { adminClient, hasKeys } from "./database/db";
import { open, seedDemo, signIn } from "./helpers";

// The owner's side of the customer loop when the world moves underneath
// them: a time taken since the customer asked, a request already answered
// elsewhere, a cancellation they'd rather not make. Attention must always
// show how things are now, never offer a button that can't work.

test.skip(!hasKeys, "Needs the Supabase keys in .env.local");

const TZ = "Europe/London";
const PRIYA = "+447700900789";
const TOM = "+447700900234";

async function arrange(email: string) {
  seedDemo(email);
  const admin = adminClient();
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const userId = users.users.find((u) => u.email === email)!.id;
  const { data: business } = await admin
    .from("businesses")
    .select("id")
    .eq("owner_id", userId)
    .single();
  const businessId = business!.id;
  let n = 0;
  const send = (
    from: string,
    body: string,
    i: Partial<Interpretation> & Pick<Interpretation, "intent">,
  ) =>
    processInboundMessage(
      {
        db: admin,
        interpreter: new StaticMessageInterpreter(interpretation(i)),
      },
      {
        businessId,
        from,
        body,
        externalId: `e2e-auto-${email}-${++n}`,
        source: "simulator",
      },
    );
  return { admin, businessId, send };
}

/** A free one-hour lesson start, a few days out. */
async function freeSlot(businessId: string, fromDays = 3) {
  const today = dateKeyOf(new Date(), TZ);
  const context = await loadScheduleContext(
    adminClient(),
    { id: businessId, timeZone: TZ, scheduleMode: "regular" },
    today,
    fromDays + 14,
  );
  for (let d = fromDays; d < fromDays + 14; d++) {
    const date = addDays(today, d);
    const [slot] = availableSlots(
      context,
      date,
      { durationMinutes: 60, bufferMinutes: 15 },
      { now: new Date() },
    );
    if (slot) return { date, time: clockTimeOf(slot.startsAt, TZ), ...slot };
  }
  throw new Error("No free slot");
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

test("a time taken since the customer asked is never approved, and the card says so", async ({
  page,
  baseURL,
}, testInfo) => {
  const email = `e2e-auto-stale-${testInfo.project.name}@pingflow.test`;
  const { admin, businessId, send } = await arrange(email);
  const slot = await freeSlot(businessId);
  await send(PRIYA, "Can I book a lesson then?", {
    intent: "new_booking_request",
    requested_date: {
      kind: "calendar_date",
      weekday: null,
      week: null,
      day: Number(slot.date.slice(8, 10)),
      month: Number(slot.date.slice(5, 7)),
    },
    requested_time: { constraint: "exact", time: slot.time },
    service_reference: "Driving lesson",
  });

  await signIn(page, email, baseURL!);
  await expect(
    page.getByRole("heading", { level: 1, name: "Attention" }),
  ).toBeVisible();
  const card = page
    .getByRole("article")
    .filter({ hasText: "Priya Shah wants to book a driving lesson" });
  const approve = card.getByRole("button", { name: /^Approve / });
  await expect(approve).toBeVisible();
  await expect(card).toContainText("is free.");
  await noHorizontalScroll(page);

  // Someone else is booked into that time while the page is open.
  const { data: omar } = await admin
    .from("customers")
    .select("id")
    .eq("business_id", businessId)
    .eq("full_name", "Omar Ali")
    .single();
  const { data: lesson } = await admin
    .from("services")
    .select("id")
    .eq("business_id", businessId)
    .eq("name", "Driving lesson")
    .single();
  await admin.from("bookings").insert({
    business_id: businessId,
    customer_id: omar!.id,
    service_id: lesson!.id,
    starts_at: slot.startsAt.toISOString(),
    ends_at: addMinutes(slot.startsAt, 60).toISOString(),
    buffer_minutes: 15,
  });

  await approve.click();
  await expect(card.getByRole("alert")).toContainText(
    "isn’t available any more",
  );
  // The card now shows how things are: taken, and no approve button.
  await expect(card).toContainText("been taken since");
  await expect(card.getByRole("button", { name: /^Approve / })).toHaveCount(0);
  await expect(
    card.getByRole("button", { name: "Choose another time" }),
  ).toBeVisible();
  const { count } = await admin
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("starts_at", slot.startsAt.toISOString())
    .eq("status", "confirmed");
  expect(count).toBe(1);
  await noHorizontalScroll(page);
});

test("a request already answered elsewhere goes, and says why", async ({
  page,
  baseURL,
}, testInfo) => {
  const email = `e2e-auto-gone-${testInfo.project.name}@pingflow.test`;
  const { admin, businessId, send } = await arrange(email);
  const slot = await freeSlot(businessId, 4);
  const report = await send(PRIYA, "Can I book a lesson then?", {
    intent: "new_booking_request",
    requested_date: {
      kind: "calendar_date",
      weekday: null,
      week: null,
      day: Number(slot.date.slice(8, 10)),
      month: Number(slot.date.slice(5, 7)),
    },
    requested_time: { constraint: "exact", time: slot.time },
    service_reference: "Driving lesson",
  });

  // Hold the live-update socket, so this page hasn't heard about the
  // change when the owner presses Approve: the server must catch it.
  await page.routeWebSocket(/realtime/, () => {});
  await signIn(page, email, baseURL!);
  const card = page
    .getByRole("article")
    .filter({ hasText: "Priya Shah wants to book a driving lesson" });
  await expect(card.getByRole("button", { name: /^Approve / })).toBeVisible();

  // Answered on another device while this page was open.
  await admin
    .from("pending_actions")
    .update({
      status: "declined",
      resolved_at: new Date().toISOString(),
      resolution: { decision: "decline" },
    })
    .eq("source_message_id", report.messageId);

  await card.getByRole("button", { name: /^Approve / }).click();
  await expect(page.getByRole("status")).toContainText(
    "This request has already been handled.",
  );
  await expect(card).toHaveCount(0);
  const { count } = await admin
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("starts_at", slot.startsAt.toISOString());
  expect(count).toBe(0);
});

test("keeping a booking after a cancellation request replies and keeps it", async ({
  page,
  baseURL,
}, testInfo) => {
  const email = `e2e-auto-keep-${testInfo.project.name}@pingflow.test`;
  const { admin, businessId, send } = await arrange(email);
  await send(TOM, "Sorry, can't make my next lesson", {
    intent: "cancellation_request",
    referenced_booking: { kind: "next", date: null, time: null, service: null },
    cancellation_scope: "single",
  });

  await signIn(page, email, baseURL!);
  const card = page
    .getByRole("article")
    .filter({ hasText: "Tom Reid wants to cancel" });
  await expect(
    card.getByRole("button", { name: "Approve cancellation" }),
  ).toBeVisible();
  await noHorizontalScroll(page);

  await card.getByRole("button", { name: "Keep booking" }).click();
  const dialog = page.getByRole("dialog", { name: "Keep Tom’s booking?" });
  await expect(dialog).toContainText(/^.*It stays on /);
  await expect(dialog).toContainText("Hi Tom, I can’t cancel this one, sorry.");
  await dialog.getByRole("button", { name: "Keep booking and reply" }).click();
  await expect(page.getByRole("status")).toContainText("is still on");
  await expect(card).toHaveCount(0);

  const { data: tom } = await admin
    .from("customers")
    .select("id")
    .eq("business_id", businessId)
    .eq("full_name", "Tom Reid")
    .single();
  const { count } = await admin
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("customer_id", tom!.id)
    .eq("status", "cancelled");
  expect(count).toBe(0);
});

test("Automations says truthfully whether messages go out", async ({
  page,
  baseURL,
}, testInfo) => {
  const email = `e2e-auto-settings-${testInfo.project.name}@pingflow.test`;
  const { admin, businessId } = await arrange(email);
  await signIn(page, email, baseURL!);
  await expect(
    page.getByRole("heading", { level: 1, name: "Attention" }),
  ).toBeVisible();

  await open(page, "/app/automations");
  const main = page.locator("main");
  await expect(
    page.getByRole("region", { name: "Unclear messages get one question" }),
  ).toContainText("Always on");
  await expect(main).toContainText("WhatsApp isn’t connected yet");
  await noHorizontalScroll(page);

  await admin.from("whatsapp_connections").insert({
    business_id: businessId,
    mode: "developer",
    status: "connected",
    phone_number_id: `74${String(Date.now()).slice(-8)}${testInfo.project.name === "webkit" ? "2" : "1"}`,
  });
  await page.reload();
  await expect(main).toContainText("These go out on WhatsApp.");
  await expect(main).not.toContainText("WhatsApp isn’t connected yet");
});
