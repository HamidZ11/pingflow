import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/features/onboarding/onboarding-flow";
import { getViewer } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Set up Pingflow" };

export default async function OnboardingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  if (viewer.business?.onboarding_completed_at) redirect("/app");

  return <OnboardingFlow />;
}
