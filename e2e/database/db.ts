import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";
import { seedDemo } from "../helpers";

// Helpers for tests that talk to the local database directly. An "owner"
// client acts as that signed-in owner, exactly as the app does, so row
// level security and the database functions behave as they do in the app.

export const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";

export const hasKeys = Boolean(publishableKey && secretKey);

export type Db = SupabaseClient<Database>;

/** The secret-key client: for arranging and checking, never as an owner. */
export function adminClient(): Db {
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient(): Db {
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Signs in as `email` with a one-time link, as the app's sign-in does. */
export async function ownerClient(email: string): Promise<Db> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) throw error;
  const client = anonClient();
  const verified = await client.auth.verifyOtp({
    type: "email",
    token_hash: data.properties.hashed_token,
  });
  if (verified.error) throw verified.error;
  return client;
}

/** A fresh demo business for `email`, and a client signed in as its owner. */
export async function demoOwner(email: string, options = "") {
  seedDemo(`${email} ${options}`.trim());
  const client = await ownerClient(email);
  const admin = adminClient();
  const { data: owner } = await admin.auth.admin.listUsers({ perPage: 500 });
  const userId = owner.users.find((u) => u.email === email)!.id;
  const { data: business } = await admin
    .from("businesses")
    .select("id")
    .eq("owner_id", userId)
    .single();
  return { client, businessId: business!.id };
}

/** Row counts for a business, to prove a failed change left nothing behind. */
export async function counts(businessId: string) {
  const admin = adminClient();
  const tables = [
    "customers",
    "contacts",
    "customer_contacts",
    "bookings",
    "reminders",
    "activity_events",
    "services",
  ] as const;
  const entries = await Promise.all(
    tables.map(async (table) => {
      const { count } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("business_id", businessId);
      return [table, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<(typeof tables)[number], number>;
}
