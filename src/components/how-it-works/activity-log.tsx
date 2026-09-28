import { CheckCheck } from "lucide-react";
import type { ReactNode } from "react";
import { scenario } from "@/components/reschedule-demo/scenario";
import { cx } from "@/lib/cx";

// What happened after the tap, as Pingflow records it. One connected list:
// done steps have a filled marker, the reminder (still to come) a hollow one.
function Entry({
  time,
  title,
  done = true,
  last = false,
  children,
}: {
  time: string;
  title: string;
  done?: boolean;
  last?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="relative grid grid-cols-[3.5rem_1fr] gap-x-3 pb-5 last:pb-0">
      <span className="pt-px text-ui-sm text-ink-3 tabular-nums">{time}</span>
      <div className="relative pl-6">
        <span
          aria-hidden
          className={cx(
            "absolute top-1.5 left-0 size-2.5 rounded-full border-[1.5px]",
            done ? "border-ink bg-ink" : "border-ink bg-surface",
          )}
        />
        {!last && (
          <span
            aria-hidden
            className="absolute top-5 -bottom-[22px] left-[4px] w-px bg-line-strong"
          />
        )}
        <p className="text-ui font-medium text-ink">{title}</p>
        {children}
      </div>
    </li>
  );
}

export function ActivityLog() {
  const { customer, approvedAt, lesson, proposal, reminder } = scenario;

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-raised">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <p className="text-ui font-medium text-ink">Activity</p>
        <p className="text-ui-sm text-ink-3">{customer.name} · Today</p>
      </div>
      <ol className="px-4 py-5">
        <Entry time={approvedAt.label} title="You approved the change">
          <p className="text-ui-sm text-ink-3">From WhatsApp</p>
        </Entry>
        <Entry time={approvedAt.label} title="Lesson moved">
          <p className="text-ui-sm text-ink-2 tabular-nums">
            {lesson.day}, {lesson.start} → {proposal.day}, {proposal.start}
          </p>
        </Entry>
        <Entry time={approvedAt.label} title="Schedule updated">
          <p className="text-ui-sm text-ink-2">
            Tuesday {lesson.start} is free again
          </p>
        </Entry>
        <Entry
          time={approvedAt.label}
          title={`Confirmation sent to ${customer.firstName}`}
        >
          <div className="mt-2 max-w-72 rounded-md rounded-tr-xs bg-bubble-out px-3 pt-2 pb-1.5 text-ui-sm text-ink">
            <p>
              Your lesson has moved to {proposal.day} at {proposal.start}. See
              you then!
            </p>
            <p className="mt-0.5 flex items-center justify-end gap-1 text-label text-ink-3 tabular-nums">
              {approvedAt.label}
              <CheckCheck aria-hidden className="size-3.5" />
            </p>
          </div>
        </Entry>
        <Entry
          time={approvedAt.label}
          title="Reminder scheduled"
          done={false}
          last
        >
          <p className="text-ui-sm text-ink-2">
            Goes to {customer.firstName} on {reminder.day}, {reminder.time}
          </p>
        </Entry>
      </ol>
    </div>
  );
}
