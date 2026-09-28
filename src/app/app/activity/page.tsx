import { MessageCircle, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, pageClassName } from "@/components/app/page-header";
import { Mark } from "@/components/mark";
import { ACTIVITY_DAYS, loadActivity } from "@/features/activity/data";
import { requireOwner } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Activity" };

const actors = {
  contact: {
    label: "Customer",
    icon: <MessageCircle aria-hidden className="size-3.5" strokeWidth={2} />,
  },
  pingflow: { label: "Pingflow", icon: <Mark className="size-4" /> },
  owner: {
    label: "You",
    icon: <UserRound aria-hidden className="size-3.5" strokeWidth={2} />,
  },
} as const;

export default async function ActivityPage() {
  const owner = await requireOwner();
  const days = await loadActivity(owner);

  return (
    <div className={pageClassName("narrow")}>
      <PageHeader
        title="Activity"
        description="Everything Pingflow and you have done, in order."
      />

      {days.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface px-5 py-8">
          <h2 className="text-body font-semibold text-ink">Nothing yet</h2>
          <p className="mt-1 text-ui text-ink-2">
            Messages, bookings, approvals and reminders will be recorded here as
            they happen.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {days.map((day) => (
            <section key={day.date} aria-labelledby={`day-${day.date}`}>
              <h2
                id={`day-${day.date}`}
                className="text-ui font-medium text-ink-2"
              >
                {day.label}
              </h2>
              <ol className="mt-3 rounded-lg border border-line bg-surface">
                {day.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="grid grid-cols-[3rem_1.5rem_minmax(0,1fr)] gap-x-2 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[3.25rem_1.5rem_minmax(0,1fr)]"
                  >
                    <time
                      dateTime={entry.dateTime}
                      className="pt-px text-ui-sm text-ink-3 tabular-nums"
                    >
                      {entry.time}
                    </time>
                    <span
                      title={actors[entry.actor].label}
                      className="mt-0.5 grid size-5 place-items-center rounded-full bg-sunken text-ink-2"
                    >
                      {actors[entry.actor].icon}
                      <span className="sr-only">
                        {actors[entry.actor].label}:
                      </span>
                    </span>
                    <div className="min-w-0 text-ui text-ink">
                      <p>
                        {entry.customerId ? (
                          <Link
                            href={`/app/customers/${entry.customerId}`}
                            className="decoration-line-strong underline-offset-4 hover:underline"
                          >
                            {entry.text}
                          </Link>
                        ) : (
                          entry.text
                        )}
                        {entry.simulated && (
                          <span className="ml-2 inline-block rounded-xs bg-sunken px-1.5 py-px align-[1px] text-label text-ink-2">
                            Simulated
                          </span>
                        )}
                      </p>
                      {entry.quote && (
                        <p className="mt-1.5 rounded-sm border-l-2 border-line-strong bg-canvas py-1.5 pr-2.5 pl-3 text-ui-sm text-ink-2">
                          {entry.quote}
                        </p>
                      )}
                      {entry.simulated && (
                        <p className="mt-1 text-ui-sm text-ink-3">
                          Recorded, not sent: WhatsApp isn’t connected yet.
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
          <p className="text-ui-sm text-ink-3">
            Showing the last {ACTIVITY_DAYS} days.
          </p>
        </div>
      )}
    </div>
  );
}
