import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, pageClassName } from "@/components/app/page-header";
import { loadSimulator } from "@/features/messages/dev/data";
import { devToolsEnabled } from "@/features/messages/dev/enabled";
import { Simulator } from "@/features/messages/dev/simulator";
import { requireOwner } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Message simulator" };

// Development only, and not in the navigation. Messages sent here go
// through the same pipeline a WhatsApp message will, for the signed-in
// owner's business. Nothing is sent to anyone.
export default async function MessageSimulatorPage() {
  if (!devToolsEnabled()) notFound();
  const owner = await requireOwner();
  const data = await loadSimulator(owner);

  return (
    <div className={pageClassName("narrow")}>
      <PageHeader
        title="Message simulator"
        description="Development only. Process a pretend WhatsApp message through the real pipeline."
      />
      <Simulator data={data} />
    </div>
  );
}
