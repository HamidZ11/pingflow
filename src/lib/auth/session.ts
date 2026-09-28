import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { ScheduleMode } from "@/domain/availability/engine";
import { isEndedSession } from "@/lib/auth/session-check";
import { createClient } from "@/lib/supabase/server";

// Who is signed in, and which business they own. Cached per request, so a
// layout and its page share one lookup.

/** Signs out a session whose account no longer exists (see session-check). */
export const SESSION_ENDED_PATH = "/auth/session-ended";

export const getViewer = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const { data: business, error } = await supabase
    .from("businesses")
    .select(
      "id, name, business_type, timezone, schedule_mode, onboarding_completed_at",
    )
    .eq("owner_id", claims.sub)
    .maybeSingle();
  if (error) throw error;

  // No business yet: before offering onboarding, make sure the account
  // behind this session still exists. A session can outlive its account
  // (tokens are checked locally), and onboarding could never be saved for
  // it. Only this path pays for the extra check.
  if (!business) {
    const { data: user, error: userError } = await supabase.auth.getUser();
    if (!user.user) {
      if (isEndedSession(userError)) redirect(SESSION_ENDED_PATH);
      throw userError ?? new Error("Couldn't check the signed-in account");
    }
  }

  return {
    supabase,
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    business,
  };
});

export type Owner = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  email: string | null;
  business: {
    id: string;
    name: string | null;
    businessType: string;
    timeZone: string;
    scheduleMode: ScheduleMode;
  };
};

/** The signed-in owner of a set-up business, or null. */
export async function getOwner(): Promise<Owner | null> {
  const viewer = await getViewer();
  const business = viewer?.business;
  if (!viewer || !business?.onboarding_completed_at) return null;
  return {
    supabase: viewer.supabase,
    userId: viewer.userId,
    email: viewer.email,
    business: {
      id: business.id,
      name: business.name,
      businessType: business.business_type,
      timeZone: business.timezone,
      scheduleMode: business.schedule_mode,
    },
  };
}

/**
 * The signed-in owner of a set-up business. Anyone else is sent where they
 * belong: signed-out visitors to sign in, owners mid-setup to onboarding.
 * Every private page and server action starts here.
 */
export async function requireOwner(): Promise<Owner> {
  const owner = await getOwner();
  if (owner) return owner;
  redirect(await landingPath());
}

/** Where a visitor should land: sign in, finish setup, or the app. */
export async function landingPath() {
  const viewer = await getViewer();
  if (!viewer) return "/sign-in";
  if (!viewer.business?.onboarding_completed_at) return "/onboarding";
  return "/app";
}
