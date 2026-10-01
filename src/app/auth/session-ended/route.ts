import { redirect } from "next/navigation";
import { isEndedSession } from "@/lib/auth/session-check";
import { createClient } from "@/lib/supabase/server";

// Where a session that has outlived its account is sent. It checks again,
// and only if the account really is gone (or the session revoked) does it
// clear the session cookies and send the visitor to sign in afresh. A
// working session is sent on its way untouched, so a stray visit here can't
// sign anyone out.
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (data.user || (error && !isEndedSession(error))) redirect("/start");

  await supabase.auth.signOut({ scope: "local" });
  redirect("/sign-in?error=session");
}
