import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

// Baseline protections on every response. The content security policy
// only covers what can't break the app: no framing, no <base> or form posts
// to other sites, no plugins. Scripts and styles are left to Next.js
// (a script policy would need nonces on every page).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Content-Security-Policy",
    value:
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  // Browsers only honour this over HTTPS, so it's harmless locally.
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]
    : []),
];

// The public Supabase values are written into the browser bundle at build
// time: a production build without them would ship a broken app, so it
// stops here instead, naming what's missing (never a value).
function requirePublicSupabase() {
  const missing = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ].filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error(
      `Can't build for production: ${missing.join(" and ")} not set. See docs/DEPLOYMENT.md.`,
    );
  }
}

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) requirePublicSupabase();
  return {
    poweredByHeader: false,
    async headers() {
      return [{ source: "/:path*", headers: securityHeaders }];
    },
  };
}
