"use client";

import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Mark } from "@/components/mark";
import {
  Bubble,
  ChatPanel,
  DayDivider,
} from "@/components/reschedule-demo/chat";
import { cx } from "@/lib/cx";

// Four things an owner might ask, and what Pingflow would say. Every answer
// is consistent with the example week in scenario.ts.
const sentAt = { label: "18:02", dateTime: "2026-10-12T18:02" };

const commands: Array<{ id: string; ask: string; reply: ReactNode }> = [
  {
    id: "tomorrow",
    ask: "Who have I got tomorrow?",
    reply: (
      <>
        <p>Tuesday 13 Oct, 3 lessons:</p>
        <ul className="mt-1.5 grid gap-0.5 tabular-nums">
          <li>09:00 Jamie Lee</li>
          <li>11:30 Tom Reed</li>
          <li>13:00 Priya Shah</li>
        </ul>
        <p className="mt-1.5 text-ink-2">
          Sarah’s 16:00 lesson moved to Friday.
        </p>
      </>
    ),
  },
  {
    id: "free",
    ask: "What times am I free Thursday?",
    reply: (
      <p>
        Thursday 15 Oct, you’re free{" "}
        <span className="tabular-nums">10:00–12:00</span> and from{" "}
        <span className="tabular-nums">14:30</span> until{" "}
        <span className="tabular-nums">19:00</span>.
      </p>
    ),
  },
  {
    id: "block",
    ask: "Block Friday afternoon.",
    reply: (
      <p>
        Done. Friday 16 Oct is blocked from{" "}
        <span className="tabular-nums">12:00</span>. Your 3 lessons that
        afternoon stay as they are.
      </p>
    ),
  },
  {
    id: "move",
    ask: "Move Sarah to 4.",
    reply: (
      <>
        <p>
          Sarah’s next lesson is Fri 16 Oct at{" "}
          <span className="tabular-nums">17:00</span>. Friday{" "}
          <span className="tabular-nums">16:00</span> isn’t free: Omar’s lesson
          runs until <span className="tabular-nums">16:30</span>.
        </p>
        <p className="mt-1.5">
          Thursday <span className="tabular-nums">16:00</span> is free. Move her
          there?
        </p>
      </>
    ),
  },
];

export function OwnerCommands({ intro }: { intro: ReactNode }) {
  const [active, setActive] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const base = useId();
  const command = commands[active];

  function select(index: number) {
    const next = (index + commands.length) % commands.length;
    setActive(next);
    tabs.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const moves: Record<string, number> = {
      ArrowRight: active + 1,
      ArrowDown: active + 1,
      ArrowLeft: active - 1,
      ArrowUp: active - 1,
      Home: 0,
      End: commands.length - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      select(moves[event.key]);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[5fr_7fr] lg:gap-16">
      <div>
        {intro}
        <div
          role="tablist"
          aria-label="Things you can ask Pingflow"
          className="mt-8 flex flex-wrap gap-2 lg:flex-col"
        >
          {commands.map((item, index) => {
            const selected = index === active;
            return (
              <button
                key={item.id}
                ref={(tab) => {
                  tabs.current[index] = tab;
                }}
                type="button"
                role="tab"
                id={`${base}-tab-${item.id}`}
                aria-selected={selected}
                aria-controls={`${base}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(index)}
                onKeyDown={onKeyDown}
                className={cx(
                  "min-h-11 rounded-md border px-3.5 py-2 text-left text-ui transition-[color,background-color,border-color] duration-150",
                  selected
                    ? "border-ink bg-surface text-ink"
                    : "border-line-strong text-ink-2 hover:border-ink-3 hover:text-ink",
                )}
              >
                “{item.ask}”
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${command.id}`}
        tabIndex={0}
        className="flex min-h-[26rem] rounded-lg"
      >
        <ChatPanel
          name="Pingflow"
          detail="Approvals and updates"
          avatar={<Mark className="size-8 shrink-0" />}
        >
          <DayDivider>Today</DayDivider>
          {/* Keyed so each new exchange settles in. */}
          <div key={command.id} className="flex flex-col gap-2">
            <Bubble
              direction="out"
              sender="You"
              time={sentAt}
              className="max-w-[85%] self-end motion-safe:animate-message-in"
            >
              <p>{command.ask}</p>
            </Bubble>
            <div className="flex w-full max-w-80 flex-col gap-0.5 self-start motion-safe:animate-message-in motion-safe:[animation-delay:180ms]">
              <Bubble direction="in" sender="Pingflow" time={sentAt}>
                {command.reply}
              </Bubble>
              {command.id === "move" && (
                <ul
                  aria-label="Reply options"
                  className="divide-y divide-line overflow-hidden rounded-md bg-surface text-center text-ui-sm"
                >
                  <li className="flex h-9 items-center justify-center font-medium text-ink">
                    Move to Thu 16:00
                  </li>
                  <li className="flex h-9 items-center justify-center text-ink-2">
                    Other times
                  </li>
                </ul>
              )}
            </div>
          </div>
        </ChatPanel>
      </div>
    </div>
  );
}
