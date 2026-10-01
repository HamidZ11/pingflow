import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { createBoundedFetch } from "@/lib/supabase/bounded-fetch";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

// Short, bounded retries for reads instead of the client's own (which can
// keep a page waiting for about a minute). See bounded-fetch.ts.
const boundedFetch = createBoundedFetch({
  fetch: (input, init) => fetch(input, init),
});

const signedInOnly = ["/app", "/onboarding"];

function isSignedInOnly(pathname: string) {
  return signedInOnly.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// Runs before app and auth routes: refreshes the session cookie when it is
// close to expiring, and sends signed-out visitors to sign in. Layouts check
// again before rendering anything private; this is the fast path, not the
// only guard.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    supabaseUrl(),
    supabasePublishableKey(),
    {
      global: { fetch: boundedFetch },
      db: { retry: false },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // Keeps a CDN from caching a response that carries a session.
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Don't put code between creating the client and this call: it is what
  // refreshes an expiring session.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    // Carry over any refreshed session cookies.
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  };

  if (!signedIn && isSignedInOnly(pathname)) {
    return redirectTo("/sign-in");
  }
  if (signedIn && pathname === "/sign-in") {
    return redirectTo("/start");
  }

  return response;
}
