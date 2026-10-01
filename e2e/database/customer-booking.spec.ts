import { expect, test } from "@playwright/test";
import { adminClient, counts, demoOwner, hasKeys, ownerClient } from "./db";

// A new customer and their first booking are one transaction: all of it is
// saved, or none of it. The slot guard re-checks the time as it's written.

test.describe.configure({ mode: "serial" });
test.skip(!hasKeys, "Needs the Supabase keys in .env.local");

const email = "db-customer-booking@pingflow.test";
const inDays = (days: number, hourUtc = 8) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
};

async function setup() {
  const { client, businessId } = await demoOwner(email);
  const admin = adminClient();
  const { data: services } = await admin
    .from("services")
    .select("id, name")
    .eq("business_id", businessId);
  const lesson = services!.find((s) => s.name === "Driving lesson")!;
  const { data: omar } = await admin
    .from("bookings")
    .select("starts_at, ends_at, customer:customers!inner(full_name)")
    .eq("business_id", businessId)
    .eq("customer.full_name", "Omar Ali")
    .gt("starts_at", new Date().toISOString())
    .order("starts_at")
    .limit(1)
    .single();
  return { client, businessId, lesson, omar: omar! };
}

test("creates the customer, contact, link, booking and activity together", async () => {
  const { client, businessId, lesson } = await setup();
  const before = await counts(businessId);

  const { data, error } = await client.rpc("create_customer_booking", {
    p_full_name: "Ella Brooks",
    p_service_id: lesson.id,
    p_starts_at: inDays(30),
    p_phone_e164: "+447700900999",
    p_relationship: "parent",
    p_contact_name: "Mark Brooks",
  });
  expect(error).toBeNull();
  const ids = data as { customer_id: string; booking_id: string };

  const after = await counts(businessId);
  expect(after.customers - before.customers).toBe(1);
  expect(after.contacts - before.contacts).toBe(1);
  expect(after.customer_contacts - before.customer_contacts).toBe(1);
  expect(after.bookings - before.bookings).toBe(1);

  const admin = adminClient();
  const { data: link } = await admin
    .from("customer_contacts")
    .select("relationship, contact:contacts(display_name, phone_e164)")
    .eq("customer_id", ids.customer_id)
    .single();
  expect(link).toMatchObject({
    relationship: "parent",
    contact: { display_name: "Mark Brooks", phone_e164: "+447700900999" },
  });
  const { data: booking } = await admin
    .from("bookings")
    .select("customer_id, service_id, buffer_minutes, status")
    .eq("id", ids.booking_id)
    .single();
  expect(booking).toMatchObject({
    customer_id: ids.customer_id,
    service_id: lesson.id,
    buffer_minutes: 15,
    status: "confirmed",
  });
  const { data: activity } = await admin
    .from("activity_events")
    .select("kind")
    .eq("customer_id", ids.customer_id);
  expect(activity!.map((a) => a.kind).sort()).toEqual([
    "booking_created",
    "customer_added",
  ]);
});

test("reuses a known WhatsApp number for a second customer", async () => {
  const { client, businessId, lesson } = await setup();
  const before = await counts(businessId);
  // Sarah's number, now messaging for her brother.
  const { error } = await client.rpc("create_customer_booking", {
    p_full_name: "Adam Khan",
    p_service_id: lesson.id,
    p_starts_at: inDays(31),
    p_phone_e164: "+447700900123",
    p_relationship: "other",
  });
  expect(error).toBeNull();
  const after = await counts(businessId);
  expect(after.customers - before.customers).toBe(1);
  expect(after.contacts - before.contacts).toBe(0);
  expect(after.customer_contacts - before.customer_contacts).toBe(1);
});

test("a taken time saves nothing at all", async () => {
  const { client, businessId, lesson, omar } = await setup();
  const before = await counts(businessId);

  for (const startsAt of [
    omar.starts_at, // overlaps Omar's lesson
    omar.ends_at, // inside the travel time after it
  ]) {
    const { error } = await client.rpc("create_customer_booking", {
      p_full_name: "Nobody Saved",
      p_service_id: lesson.id,
      p_starts_at: startsAt,
      p_phone_e164: "+447700900111",
    });
    expect(error?.hint).toBe("slot_unavailable");
  }

  // Blocked time counts as taken too.
  const { error: blockError } = await client.rpc("add_schedule_block", {
    p_starts_at: inDays(40, 8),
    p_ends_at: inDays(40, 10),
    p_label: "Test block",
  });
  expect(blockError).toBeNull();
  const blocked = await client.rpc("create_customer_booking", {
    p_full_name: "Nobody Saved",
    p_service_id: lesson.id,
    p_starts_at: inDays(40, 9),
  });
  expect(blocked.error?.hint).toBe("slot_unavailable");

  const after = await counts(businessId);
  expect(after.customers).toBe(before.customers);
  expect(after.contacts).toBe(before.contacts);
  expect(after.customer_contacts).toBe(before.customer_contacts);
  expect(after.bookings).toBe(before.bookings);
  // Only the block's own activity record was added.
  expect(after.activity_events - before.activity_events).toBe(1);
  const { count } = await adminClient()
    .from("contacts")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("phone_e164", "+447700900111");
  expect(count).toBe(0);
});

test("an unknown or removed service saves nothing", async () => {
  const { client, businessId, lesson } = await setup();
  const before = await counts(businessId);

  const unknown = await client.rpc("create_customer_booking", {
    p_full_name: "Nobody Saved",
    p_service_id: crypto.randomUUID(),
    p_starts_at: inDays(32),
  });
  expect(unknown.error?.hint).toBe("service_not_found");

  await adminClient()
    .from("services")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", lesson.id);
  const archived = await client.rpc("create_customer_booking", {
    p_full_name: "Nobody Saved",
    p_service_id: lesson.id,
    p_starts_at: inDays(32),
  });
  expect(archived.error?.hint).toBe("service_not_found");

  const after = await counts(businessId);
  expect(after).toEqual(before);
});

test("another business's owner can't create anything here", async () => {
  const { businessId, lesson } = await setup();
  const before = await counts(businessId);

  // Someone with no business at all.
  const stranger = await ownerClient(`db-stranger-${Date.now()}@pingflow.test`);
  const noBusiness = await stranger.rpc("create_customer_booking", {
    p_full_name: "Intruder",
    p_service_id: lesson.id,
    p_starts_at: inDays(33),
  });
  expect(noBusiness.error?.hint).toBe("no_business");

  // An owner of a different business, using this business's service.
  const other = await demoOwner("db-other-owner@pingflow.test");
  const otherBefore = await counts(other.businessId);
  const crossed = await other.client.rpc("create_customer_booking", {
    p_full_name: "Intruder",
    p_service_id: lesson.id,
    p_starts_at: inDays(33),
  });
  expect(crossed.error?.hint).toBe("service_not_found");

  expect(await counts(businessId)).toEqual(before);
  expect(await counts(other.businessId)).toEqual(otherBefore);
});

test("two bookings for the same time at once: exactly one wins", async () => {
  const { businessId, lesson } = await setup();
  // Two sessions for the same owner (signed in one after the other: a
  // second sign-in link replaces the first).
  const a = await ownerClient(email);
  const b = await ownerClient(email);
  const { data: customer } = await adminClient()
    .from("customers")
    .select("id")
    .eq("business_id", businessId)
    .eq("full_name", "Priya Shah")
    .single();
  const startsAt = inDays(35);
  const results = await Promise.all(
    [a, b].map((client) =>
      client.rpc("create_booking", {
        p_customer_id: customer!.id,
        p_service_id: lesson.id,
        p_starts_at: startsAt,
      }),
    ),
  );
  const failures = results.filter((r) => r.error);
  expect(results.length - failures.length).toBe(1);
  expect(failures[0].error?.hint ?? failures[0].error?.code).toMatch(
    /slot_unavailable|23P01/,
  );
});
