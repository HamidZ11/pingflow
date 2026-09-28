import type { Metadata } from "next";
import { pageClassName } from "@/components/app/page-header";
import { loadSchedule, parseScheduleParams } from "@/features/schedule/data";
import { ScheduleWorkspace } from "@/features/schedule/schedule-workspace";
import { requireOwner } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Schedule" };

export default async function SchedulePage({
  searchParams,
}: PageProps<"/app/schedule">) {
  const owner = await requireOwner();
  const data = await loadSchedule(
    owner,
    parseScheduleParams(await searchParams),
  );

  return (
    <div className={pageClassName("wide")}>
      <ScheduleWorkspace data={data} timeZone={owner.business.timeZone} />
    </div>
  );
}
