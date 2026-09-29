import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createBoundedFetch } from "@/lib/supabase/bounded-fetch";
import type { Database } from "@/lib/supabase/database.types";
import { supabaseUrl } from "@/lib/supabase/env";

// A client with the secret key, which bypasses row level security. Only for
// Pingflow's own work as the server: its internal records (the usage
// ledger) and processing inbound messages, which arrive with no one signed
// in. Never for reading or changing an owner's data on their behalf: that
// always goes through the signed-in client in server.ts. Needs
// SUPABASE_SECRET_KEY on the server.
export function createServiceClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set. It's needed on the server to process messages and record usage.",
    );
  }
  return createClient<Database>(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: createBoundedFetch({ fetch: (input, init) => fetch(input, init) }),
    },
    db: { retry: false },
  });
}
