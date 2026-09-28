import type { ReactNode } from "react";
import { Bubble, ChatPanel, DayDivider } from "./chat";
import { scenario } from "./scenario";

function Understood({ children }: { children: ReactNode }) {
  return (
    <mark className="-mx-0.5 rounded-xs bg-accent box-decoration-clone px-0.5 text-ink">
      {children}
    </mark>
  );
}

export function CustomerThread() {
  const { customer, receivedAt } = scenario;

  return (
    <ChatPanel
      name={customer.name}
      detail="Learner · weekly lessons"
      avatar={
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-sunken text-label font-semibold text-ink-2"
        >
          {customer.initials}
        </span>
      }
    >
      <DayDivider>Tue 6 Oct</DayDivider>
      <Bubble
        direction="out"
        sender="You"
        time={{ label: "17:04", dateTime: "2026-10-06T17:04" }}
        className="max-w-[85%] self-end"
      >
        <p>Good drive today. Same time next week.</p>
      </Bubble>
      <DayDivider>Today</DayDivider>
      <Bubble
        direction="in"
        sender={customer.firstName}
        time={receivedAt}
        className="max-w-[85%] self-start"
      >
        <p>
          Can we move <Understood>tomorrow’s lesson</Understood> to{" "}
          <Understood>Friday after 4</Understood>?
        </p>
      </Bubble>
    </ChatPanel>
  );
}
