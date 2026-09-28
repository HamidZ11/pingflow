import type { Metadata } from "next";
import { PageHeader, pageClassName } from "@/components/app/page-header";
import { AutomationList } from "@/features/automations/automation-list";
import { loadAutomation } from "@/features/schedule/engine-context";
import { requireOwner } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Automations" };

export default async function AutomationsPage() {
  const owner = await requireOwner();
  const a = await loadAutomation(owner);
  return (
    <div className={pageClassName("narrow")}>
      <PageHeader
        title="Automations"
        description="What Pingflow does on its own, using wording you can see."
      />
      <AutomationList
        initial={{
          reminders: a.reminders.enabled,
          reminderLeadMinutes: a.reminders.leadMinutes,
          confirmations: a.confirmationsEnabled,
          availability: a.availabilityRepliesEnabled,
          bookingTime: a.bookingTimeRepliesEnabled,
          cancellations: a.cancellationAcknowledgementsEnabled,
        }}
      />
    </div>
  );
}
