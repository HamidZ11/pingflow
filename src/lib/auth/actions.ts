"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isEmailAddress, normaliseEmail } from "@/lib/auth/email";
import { createClient } from "@/lib/supabase/server";

export type MagicLinkState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | {
      status: "error";
      email: string;
      error: "invalid_email" | "rate_limited" | "failed";
    };

// Sends a one-time sign-in link. The same link creates an account for a new
// email address, so there is no separate sign-up.
export async function sendMagicLink(
  _previous: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const email = normaliseEmail(String(formData.get("email") ?? ""));
  if (!isEmailAddress(email)) {
    return { status: "error", email, error: "invalid_email" };
  }

  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: origin ? `${origin}/auth/callback` : undefined,
    },
  });

  if (error) {
    const rateLimited =
      error.status === 429 || error.code === "over_email_send_rate_limit";
    return {
      status: "error",
      email,
      error: rateLimited ? "rate_limited" : "failed",
    };
  }
  return { status: "sent", email };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in?signed-out=1");
}
