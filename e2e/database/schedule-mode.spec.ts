import { expect, test } from "@playwright/test";
import { adminClient, demoOwner, hasKeys } from "./db";

// Regular or flexible hours, and keeping the weekly pattern across a switch.

test.skip(!hasKeys, "Needs the Supabase keys in .env.local");

test("switching to flexible keeps the weekly hours for switching back", async () => {
  const { client, businessId } = await demoOwner("db-schedule@pingflow.test");
  const admin = adminClient();
  const hours = async () =>
    (
      await admin
        .from("working_hours")
        .select("weekday, start_time, end_time")
        .eq("business_id", businessId)
        .order("weekday")
    ).data!;
  const mode = async () =>
    (
      await admin
        .from("businesses")
        .select("schedule_mode")
        .eq("id", businessId)
        .single()
    ).data!.schedule_mode;

  const regularHours = await hours();
  expect(await mode()).toBe("regular");

  expect(
    (await client.rpc("set_schedule", { p_mode: "flexible" })).error,
  ).toBeNull();
  expect(await mode()).toBe("flexible");
  expect(await hours()).toEqual(regularHours);

  // Back to regular without resending hours isn't allowed…
  const empty = await client.rpc("set_schedule", { p_mode: "regular" });
  expect(empty.error?.hint).toBe("invalid_hours");
  expect(await mode()).toBe("flexible");

  // …with them, it is, and they replace the old pattern.
  const back = await client.rpc("set_schedule", {
    p_mode: "regular",
    p_hours: [{ weekday: 1, start_time: "10:00", end_time: "16:00" }],
  });
  expect(back.error).toBeNull();
  expect(await mode()).toBe("regular");
  expect(await hours()).toEqual([
    { weekday: 1, start_time: "10:00:00", end_time: "16:00:00" },
  ]);
});

test("the demo seed can start a business in flexible mode", async () => {
  const { businessId } = await demoOwner(
    "db-flexible@pingflow.test",
    "--flexible",
  );
  const { data } = await adminClient()
    .from("businesses")
    .select("schedule_mode")
    .eq("id", businessId)
    .single();
  expect(data?.schedule_mode).toBe("flexible");
});
