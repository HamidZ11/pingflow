import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Only the app and its auth routes use a session. Marketing pages stay out
// of the proxy entirely.
export const config = {
  matcher: [
    "/app/:path*",
    "/onboarding",
    "/sign-in",
    "/start",
    "/auth/:path*",
    "/api/:path*",
  ],
};
