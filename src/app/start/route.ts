import { redirect } from "next/navigation";
import { landingPath } from "@/lib/auth/session";

// "Start free" on the site lands here and is sent on: signed-out visitors to
// sign in, owners mid-setup to onboarding, everyone else into the app.
export async function GET() {
  redirect(await landingPath());
}
