import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";
import { createBoundedFetch } from "@/lib/supabase/bounded-fetch";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

// Short, bounded retries for reads instead of the client's own (which can
// keep a page waiting for about a minute). See bounded-fetch.ts.
const boundedFetch = createBoundedFetch({
  fetch: (input, init) => fetch(input, init),
});

// A Supabase client for Server Components, Server Actions and Route
// Handlers, acting as the signed-in user (so row level security applies).
// Create one per request; never share it between requests.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    global: { fetch: boundedFetch },
    db: { retry: false },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components can't set cookies. The proxy has already
          // refreshed the session for this request, so nothing is lost.
        }
      },
    },
  });
}
