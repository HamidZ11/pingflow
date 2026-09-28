import { Check } from "lucide-react";
import { Mark } from "@/components/mark";
import {
  Bubble,
  ChatPanel,
  DayDivider,
} from "@/components/reschedule-demo/chat";
import { scenario } from "@/components/reschedule-demo/scenario";

// The owner's chat with Pingflow: the approval request, and the one tap that
// answers it. Reply options are shown, not interactive.
export function ApprovalThread() {
  const { customer, receivedAt, approvedAt, lesson, proposal } = scenario;

  return (
    <ChatPanel
      name="Pingflow"
      detail="Approvals and updates"
      avatar={<Mark className="size-8 shrink-0" />}
    >
      <DayDivider>Today</DayDivider>
      <div className="flex w-full max-w-72 flex-col gap-0.5 self-start">
        <Bubble direction="in" sender="Pingflow" time={receivedAt}>
          <p className="font-medium">
            {customer.firstName} wants to move her lesson
          </p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-0.5 text-ui-sm tabular-nums">
            <dt className="text-ink-3">From</dt>
            <dd className="text-ink-3 line-through decoration-ink-3/70">
              {lesson.day}, {lesson.start}
            </dd>
            <dt className="text-ink-3">To</dt>
            <dd className="font-medium text-ink">
              {proposal.day}, {proposal.start}
            </dd>
          </dl>
          <p className="mt-2 text-ui-sm text-ink-2">
            {proposal.weekday} {proposal.start} is free.
          </p>
        </Bubble>
        <ul
          aria-label="Reply options"
          className="divide-y divide-line overflow-hidden rounded-md bg-surface text-center text-ui-sm"
        >
          <li className="flex h-9 items-center justify-center gap-1.5 font-medium text-ink">
            <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
            Approve
          </li>
          <li className="flex h-9 items-center justify-center text-ink-2">
            Other times
          </li>
          <li className="flex h-9 items-center justify-center text-ink-2">
            I’ll handle it
          </li>
        </ul>
      </div>
      <Bubble
        direction="out"
        sender="You"
        time={approvedAt}
        className="mt-2 self-end"
      >
        <p>Approve</p>
      </Bubble>
    </ChatPanel>
  );
}
