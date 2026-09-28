import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../../src/lib/supabase/database.types";
import { seedDemo } from "../helpers";

// Row level security, checked directly against the database: a signed-out
// visitor sees nothing, and another signed-in owner can't read or change the
// demo business, even through the database functions.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;

test("another account can't see or change a business", async () => {
  test.skip(
    !publishableKey || !secretKey,
    "Needs the Supabase keys in the environment",
  );
  seedDemo("e2e-owner@pingflow.test");
  const admin = createClient<Database>(url, secretKey, {
    auth: { persistSession: false },
  });
  const { data: action } = await admin
    .from("pending_actions")
    .select("id, booking_id, business_id")
    .eq("status", "open")
    .limit(1)
    .single();
  expect(action).not.toBeNull();

  const anon = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false },
  });
  const anonRead = await anon.from("bookings").select("id").limit(1);
  expect(anonRead.error?.code).toBe("42501");

  // A throwaway second owner. (A password is used only to sign this test
  // user in; the product itself has no passwords.)
  const email = `e2e-intruder-${Date.now()}@pingflow.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  const intruder = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false },
  });
  await intruder.auth.signInWithPassword({ email, password });

  try {
    for (const table of [
      "businesses",
      "bookings",
      "customers",
      "pending_actions",
      "messages",
      "activity_events",
    ] as const) {
      const { data } = await intruder.from(table).select("id").limit(5);
      expect(data, table).toEqual([]);
    }
    const update = await intruder
      .from("bookings")
      .update({ starts_at: new Date().toISOString() })
      .eq("id", action!.booking_id!)
      .select("id");
    expect(update.data).toEqual([]);

    const resolve = await intruder.rpc("resolve_reschedule_request", {
      p_action_id: action!.id,
      p_decision: "take_over",
    });
    expect(resolve.error?.hint).toBe("not_found");

    const cancel = await intruder.rpc("cancel_booking", {
      p_booking_id: action!.booking_id!,
    });
    expect(cancel.error).not.toBeNull();

    const { data: still } = await admin
      .from("pending_actions")
      .select("status")
      .eq("id", action!.id)
      .single();
    expect(still?.status).toBe("open");
  } finally {
    if (created.data.user)
      await admin.auth.admin.deleteUser(created.data.user.id);
  }
});
