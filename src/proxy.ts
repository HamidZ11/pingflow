import { type NextRequest, NextResponse } from "next/server";
import { devToolsEnabled } from "@/features/messages/dev/enabled";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Server-to-server routes (Meta's webhook, the scheduled worker, uptime
  // checks) carry no session and must reach their handler untouched.
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/internal/") ||
    pathname === "/api/health"
  ) {
    return NextResponse.next();
  }
  // Development tools don't exist outside `next dev`, signed in or not.
  if (pathname.startsWith("/app/dev") && !devToolsEnabled()) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
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
