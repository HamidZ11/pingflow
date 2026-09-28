import type { Metadata } from "next";
import { AppNav } from "@/components/app/app-nav";
import { InputModality } from "@/components/app/input-modality";
import { LiveRefresh } from "@/components/app/live-refresh";
import { Toaster } from "@/components/app/toaster";
import { countOpenRequests } from "@/features/attention/data";
import { requireOwner } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: { default: "Attention", template: "%s — Pingflow" },
  robots: { index: false, follow: false },
};

// The signed-in app. Every screen below is private: requireOwner() sends
// anyone else to sign in (or to finish setting up) before anything renders.
export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const owner = await requireOwner();
  const attentionCount = await countOpenRequests(owner);

  return (
    <Toaster>
      <div className="flex min-h-dvh">
        <AppNav attentionCount={attentionCount} email={owner.email} />
        <main className="min-w-0 flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-12">
          {children}
        </main>
      </div>
      <LiveRefresh businessId={owner.business.id} />
      <InputModality />
    </Toaster>
  );
}
