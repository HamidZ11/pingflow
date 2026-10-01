"use server";

import { redirect } from "next/navigation";
import { parseSetupDraft, toSetupPayload } from "@/domain/onboarding/setup";
import { getViewer, SESSION_ENDED_PATH } from "@/lib/auth/session";
import { type ActionResult, friendlyError, logServerError } from "@/lib/errors";

// Creates the business from the onboarding answers in one transaction
// (complete_onboarding). The draft is re-checked here: the browser can't be
// trusted to have validated it.
export async function completeOnboarding(
  draft: unknown,
): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  if (viewer.business?.onboarding_completed_at) return { ok: true };

  const parsed = parseSetupDraft(draft);
  if (!parsed) {
    return {
      ok: false,
      error: "Some answers need another look. Go back and check them.",
    };
  }

  const { error } = await viewer.supabase.rpc("complete_onboarding", {
    p_setup: toSetupPayload(parsed),
  });
  if (!error) return { ok: true };

  // Already done (a second click, or a retry after a lost response): the
  // business exists and is set up, so this is success, not a failure.
  if (error.hint === "already_set_up") return { ok: true };
  // The session's account doesn't exist (a session can outlive it): nothing
  // can be saved for it, so end it rather than failing over and over.
  if (error.code === "23503" && /owner_id/.test(error.message)) {
    logServerError("completeOnboarding", error);
    redirect(SESSION_ENDED_PATH);
  }
  return { ok: false, error: friendlyError(error, "completeOnboarding") };
}
