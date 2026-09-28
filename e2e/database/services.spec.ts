import { expect, test } from "@playwright/test";
import { adminClient, demoOwner, hasKeys } from "./db";

// Settings → Services saves the whole list in one transaction: it ends up
// exactly as submitted, or (if anything is wrong) exactly as it was.

test.describe.configure({ mode: "serial" });
test.skip(!hasKeys, "Needs the Supabase keys in .env.local");

const email = "db-services@pingflow.test";

type Row = {
  id?: string | null;
  name: string;
  duration_minutes: number;
  buffer_minutes: number;
};

async function active(businessId: string) {
  const { data } = await adminClient()
    .from("services")
    .select("id, name, duration_minutes, buffer_minutes, position")
    .eq("business_id", businessId)
    .is("archived_at", null)
    .order("position");
  return data!;
}

async function setup() {
  const { client, businessId } = await demoOwner(email);
  const [lesson, long] = await active(businessId);
  const row = (s: typeof lesson, patch: Partial<Row> = {}): Row => ({
    id: s.id,
    name: s.name,
    duration_minutes: s.duration_minutes,
    buffer_minutes: s.buffer_minutes,
    ...patch,
  });
  return { client, businessId, lesson, long, row };
}

test("creates, updates and removes in one save, in the order given", async () => {
  const { client, businessId, lesson, long, row } = await setup();

  const first = await client.rpc("save_services", {
    p_services: [
      row(long),
      row(lesson, { name: "Standard lesson", duration_minutes: 75 }),
      { name: "Mock test", duration_minutes: 90, buffer_minutes: 15 },
    ],
  });
  expect(first.error).toBeNull();
  const afterFirst = await active(businessId);
  expect(afterFirst.map((s) => `${s.name} ${s.duration_minutes}`)).toEqual([
    "Two-hour lesson 120",
    "Standard lesson 75",
    "Mock test 90",
  ]);
  expect(afterFirst[1].id).toBe(lesson.id);

  // Remove the unused "Mock test": it's archived, not deleted.
  const mock = afterFirst[2];
  const second = await client.rpc("save_services", {
    p_services: [row(afterFirst[0]), row(afterFirst[1])],
  });
  expect(second.error).toBeNull();
  expect((await active(businessId)).map((s) => s.name)).toEqual([
    "Two-hour lesson",
    "Standard lesson",
  ]);
  const { data: archived } = await adminClient()
    .from("services")
    .select("archived_at")
    .eq("id", mock.id)
    .single();
  expect(archived?.archived_at).not.toBeNull();
});

test("removing a service with only past bookings keeps its history", async () => {
  const { client, businessId, lesson, long, row } = await setup();
  const add = await client.rpc("save_services", {
    p_services: [
      row(lesson),
      row(long),
      { name: "Old service", duration_minutes: 60, buffer_minutes: 0 },
    ],
  });
  expect(add.error).toBeNull();
  const old = (await active(businessId)).find((s) => s.name === "Old service")!;

  // A booking for it, long ago.
  const admin = adminClient();
  const { data: customer } = await admin
    .from("customers")
    .select("id")
    .eq("business_id", businessId)
    .limit(1)
    .single();
  const pastStart = new Date(Date.now() - 60 * 86_400_000);
  pastStart.setUTCHours(7, 0, 0, 0);
  const { data: past, error: pastError } = await admin
    .from("bookings")
    .insert({
      business_id: businessId,
      customer_id: customer!.id,
      service_id: old.id,
      starts_at: pastStart.toISOString(),
      ends_at: new Date(pastStart.getTime() + 3_600_000).toISOString(),
    })
    .select("id")
    .single();
  expect(pastError).toBeNull();

  const remove = await client.rpc("save_services", {
    p_services: [row(lesson), row(long)],
  });
  expect(remove.error).toBeNull();
  const { data: kept } = await admin
    .from("bookings")
    .select("service:services(name, archived_at)")
    .eq("id", past!.id)
    .single();
  expect(kept?.service?.name).toBe("Old service");
  expect(kept?.service?.archived_at).not.toBeNull();
});

test("a service with bookings coming up can't be removed, and nothing else changes", async () => {
  const { client, businessId, lesson, row } = await setup();
  const before = await active(businessId);
  const { error } = await client.rpc("save_services", {
    // Renames the lesson, and drops "Two-hour lesson" (Tom and Jake are booked).
    p_services: [row(lesson, { name: "Renamed lesson" })],
  });
  expect(error?.hint).toBe("service_has_future_bookings");
  expect(error?.details).toBe("Two-hour lesson");
  expect(await active(businessId)).toEqual(before);
});

test("one bad row stops the whole save", async () => {
  const { client, businessId, lesson, long, row } = await setup();
  const before = await active(businessId);
  for (const bad of [
    { name: "", duration_minutes: 60, buffer_minutes: 0 },
    { name: "Too long", duration_minutes: 900, buffer_minutes: 0 },
    { name: "Two-hour lesson", duration_minutes: 60, buffer_minutes: 0 },
  ]) {
    const { error } = await client.rpc("save_services", {
      p_services: [row(lesson, { name: "Renamed lesson" }), row(long), bad],
    });
    expect(error).not.toBeNull();
    expect(await active(businessId)).toEqual(before);
  }
  const twice = await client.rpc("save_services", {
    p_services: [row(lesson), row(lesson, { name: "Copy" }), row(long)],
  });
  expect(twice.error?.hint).toBe("duplicate_service");
  expect(await active(businessId)).toEqual(before);
});

test("another business's services can't be touched", async () => {
  const { businessId, lesson, row } = await setup();
  const before = await active(businessId);
  const other = await demoOwner("db-services-other@pingflow.test");
  const otherBefore = await active(other.businessId);
  const { error } = await other.client.rpc("save_services", {
    p_services: [
      ...otherBefore.map((s) => row(s)),
      row(lesson, { name: "Stolen" }),
    ],
  });
  expect(error?.hint).toBe("unknown_service");
  expect(await active(businessId)).toEqual(before);
  expect(await active(other.businessId)).toEqual(otherBefore);
});
