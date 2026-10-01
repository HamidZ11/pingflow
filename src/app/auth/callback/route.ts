import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const emailOtpTypes: EmailOtpType[] = [
  "email",
  "magiclink",
  "signup",
  "invite",
  "recovery",
  "email_change",
];

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return emailOtpTypes.includes(value as EmailOtpType);
}

// Where the sign-in email's link lands. The link carries a one-time token;
// exchanging it sets the session cookie. Any failure goes back to /sign-in
// with a reason the page explains in plain words.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const code = params.get("code");

  // The auth server reports some failures (such as an expired link) by
  // redirecting here with an error instead of a token.
  const reportedError = params.get("error_code") ?? params.get("error");
  if (reportedError) {
    redirect(
      `/sign-in?error=${reportedError === "otp_expired" ? "expired" : "invalid"}`,
    );
  }

  const supabase = await createClient();
  let failure: string | undefined;

  if (tokenHash && isEmailOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    failure = error?.code ?? error?.message;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failure = error?.code ?? error?.message;
  } else {
    failure = "missing";
  }

  if (failure) {
    redirect(
      `/sign-in?error=${failure === "otp_expired" ? "expired" : "invalid"}`,
    );
  }
  redirect("/start");
}
