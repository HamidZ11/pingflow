import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Mark } from "@/components/mark";
import { Bubble, ChatPanel } from "./chat";
import { scenario } from "./scenario";

// A step that has not happened yet: a hollow marker, aligned to the first
// line so wrapped text keeps its marker in place.
function NextStep({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden
        className="mt-0.75 size-3 shrink-0 rounded-full border-[1.5px] border-line-strong"
      />
      <span>{children}</span>
    </li>
  );
}

export function OwnerApproval() {
  const { customer, receivedAt, lesson, proposal, reminder } = scenario;

  // Narrow: the consequences sit under the chat. Wide (stacked layouts on
  // tablet/small desktop): they sit beside the reply buttons they follow from.
  return (
    <div className="@container flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-3 @[36rem]:flex-row @[36rem]:items-end">
        <ChatPanel
          name="Pingflow"
          detail="Approvals and updates"
          avatar={<Mark className="size-8 shrink-0" />}
        >
          <div className="flex w-full max-w-70 flex-col gap-0.5 self-start">
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
        </ChatPanel>

        <div className="rounded-lg border border-line bg-surface px-4 py-3.5 @[36rem]:w-72 @[36rem]:shrink-0">
          <p className="text-label font-medium text-ink-3">
            When you tap Approve
          </p>
          <ol className="mt-2.5 grid gap-2 text-ui-sm text-ink-2 tabular-nums">
            <NextStep>
              Calendar moves to {proposal.day}, {proposal.start}
            </NextStep>
            <NextStep>{customer.firstName} gets a confirmation</NextStep>
            <NextStep>
              Reminder goes out {reminder.day}, {reminder.time}
            </NextStep>
          </ol>
        </div>
      </div>
    </div>
  );
}
