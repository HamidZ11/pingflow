import { expect, test } from "@playwright/test";
import {
  emptyDraft,
  type SetupDraft,
  suggestedServicesFor,
  toSetupPayload,
} from "../../src/domain/onboarding/setup";
import { adminClient, hasKeys, ownerClient } from "./db";

// Onboarding is one transaction: the business, its services, hours and
// automation settings are all saved, or none are. Regression cover for the
// "Skip for now" failure, whose cause was a session for a deleted account.

test.skip(!hasKeys, "Needs the Supabase keys in .env.local");

const fresh = (tag: string) =>
  `db-onboard-${tag}-${Date.now()}-${Math.round(Math.random() * 1e6)}@pingflow.test`;

function draft(overrides: Partial<SetupDraft> = {}): SetupDraft {
  return {
    ...emptyDraft(),
    businessType: "dog_groomer",
    name: "Paws & Co",
    services: suggestedServicesFor("dog_groomer"),
    ...overrides,
  };
}

async function stateFor(email: string) {
  const admin = adminClient();
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const userId = users.users.find((u) => u.email === email)?.id;
  const { data: businesses } = await admin
    .from("businesses")
    .select("*")
    .eq("owner_id", userId ?? "00000000-0000-0000-0000-000000000000");
  const businessId =
    businesses?.[0]?.id ?? "00000000-0000-0000-0000-000000000000";
  const [services, hours, automation] = await Promise.all([
    admin
      .from("services")
      .select("name, duration_minutes, buffer_minutes, position")
      .eq("business_id", businessId)
      .order("position"),
    admin
      .from("working_hours")
      .select("weekday, start_time, end_time")
      .eq("business_id", businessId)
      .order("weekday"),
    admin.from("automation_settings").select("*").eq("business_id", businessId),
  ]);
  return {
    userId,
    businesses: businesses ?? [],
    services: services.data ?? [],
    hours: hours.data ?? [],
    automation: automation.data ?? [],
  };
}

test("regular hours: everything is saved and the owner is set up", async () => {
  const email = fresh("regular");
  const client = await ownerClient(email);
  const { error } = await client.rpc("complete_onboarding", {
    p_setup: toSetupPayload(
      draft({ reminderLeadMinutes: 120, availabilityRepliesEnabled: false }),
    ),
  });
  expect(error).toBeNull();

  const state = await stateFor(email);
  expect(state.businesses).toHaveLength(1);
  expect(state.businesses[0]).toMatchObject({
    owner_id: state.userId,
    name: "Paws & Co",
    business_type: "dog_groomer",
    schedule_mode: "regular",
    timezone: "Europe/London",
    whatsapp_connected_at: null,
  });
  expect(state.businesses[0].onboarding_completed_at).not.toBeNull();
  expect(
    state.services.map(
      (s) => `${s.name} ${s.duration_minutes}/${s.buffer_minutes}`,
    ),
  ).toEqual(["Full groom 120/15", "Wash & tidy 60/15"]);
  expect(state.hours).toHaveLength(5);
  expect(state.hours[0]).toEqual({
    weekday: 1,
    start_time: "09:00:00",
    end_time: "17:00:00",
  });
  expect(state.automation[0]).toMatchObject({
    reminders_enabled: true,
    reminder_lead_minutes: 120,
    availability_replies_enabled: false,
  });
});

test("flexible hours: saved without needing weekly hours", async () => {
  const email = fresh("flexible");
  const client = await ownerClient(email);
  const closed = draft().hours;
  for (const day of [1, 2, 3, 4, 5] as const) closed[day].open = false;
  const { error } = await client.rpc("complete_onboarding", {
    p_setup: toSetupPayload(
      draft({
        scheduleMode: "flexible",
        hours: closed,
        businessType: "tutor",
        services: suggestedServicesFor("tutor"),
      }),
    ),
  });
  expect(error).toBeNull();
  const state = await stateFor(email);
  expect(state.businesses[0]).toMatchObject({
    schedule_mode: "flexible",
    business_type: "tutor",
  });
  expect(state.businesses[0].onboarding_completed_at).not.toBeNull();
  expect(state.hours).toEqual([]);
  expect(state.services).toHaveLength(2);
});

test("a failed attempt leaves nothing behind, and a retry succeeds once", async () => {
  const email = fresh("retry");
  const client = await ownerClient(email);
  const payload = toSetupPayload(draft());

  // The last working-hours row is invalid (finishes before it starts), so
  // the transaction fails after the business and services were written.
  const broken = {
    ...payload,
    working_hours: [
      ...payload.working_hours,
      { weekday: 6, start_time: "17:00", end_time: "09:00" },
    ],
  };
  const failed = await client.rpc("complete_onboarding", { p_setup: broken });
  expect(failed.error).not.toBeNull();
  const afterFailure = await stateFor(email);
  expect(afterFailure.businesses).toEqual([]);
  expect(afterFailure.services).toEqual([]);
  expect(afterFailure.hours).toEqual([]);
  expect(afterFailure.automation).toEqual([]);

  const retried = await client.rpc("complete_onboarding", { p_setup: payload });
  expect(retried.error).toBeNull();
  const again = await client.rpc("complete_onboarding", { p_setup: payload });
  expect(again.error?.hint).toBe("already_set_up");

  const state = await stateFor(email);
  expect(state.businesses).toHaveLength(1);
  expect(state.services).toHaveLength(2);
  expect(state.hours).toHaveLength(5);
  expect(state.automation).toHaveLength(1);
});

test("two submissions at once still make one business, with no duplicates", async () => {
  const email = fresh("double");
  const client = await ownerClient(email);
  const payload = toSetupPayload(draft());
  const results = await Promise.all([
    client.rpc("complete_onboarding", { p_setup: payload }),
    client.rpc("complete_onboarding", { p_setup: payload }),
  ]);
  for (const r of results) {
    expect(r.error === null || r.error.hint === "already_set_up").toBe(true);
  }
  const state = await stateFor(email);
  expect(state.businesses).toHaveLength(1);
  expect(state.services).toHaveLength(2);
  expect(state.hours).toHaveLength(5);
});

test("a session whose account was deleted saves nothing", async () => {
  const email = fresh("deleted");
  const client = await ownerClient(email);
  const admin = adminClient();
  const before = await stateFor(email);
  await admin.auth.admin.deleteUser(before.userId!);

  // The token itself still verifies (it's checked locally)…
  expect((await client.auth.getClaims()).data?.claims?.sub).toBe(before.userId);
  // …but the account is gone, which is what the app now checks for…
  const user = await client.auth.getUser();
  expect(user.error?.code).toBe("user_not_found");
  // …and the database refuses to create a business for it.
  const { error } = await client.rpc("complete_onboarding", {
    p_setup: toSetupPayload(draft()),
  });
  expect(error?.code).toBe("23503");
  const { count } = await admin
    .from("businesses")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", before.userId!);
  expect(count).toBe(0);
});
