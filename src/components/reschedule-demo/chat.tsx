import { CheckCheck } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

// Restrained WhatsApp cues: bubbles, day chips, timestamps and ticks.
// Deliberately not a copy of the WhatsApp app or its branding.

export function ChatPanel({
  name,
  detail,
  avatar,
  children,
}: {
  name: string;
  detail: string;
  avatar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-line bg-chat">
      <div className="flex items-center gap-2.5 border-b border-line bg-surface px-3.5 py-2.5">
        {avatar}
        <div className="min-w-0 flex-1">
          <p className="truncate text-ui font-medium text-ink">{name}</p>
          <p className="truncate text-label text-ink-3">{detail}</p>
        </div>
        <span className="text-label text-ink-3">WhatsApp</span>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-2 px-3 py-4">
        {children}
      </div>
    </div>
  );
}

export function DayDivider({ children }: { children: ReactNode }) {
  return (
    <p className="self-center rounded-sm bg-surface/80 px-2 py-0.5 text-label text-ink-3">
      {children}
    </p>
  );
}

// Placement and width belong to the caller, so a bubble can sit alone in a
// thread or stretch to match attached reply buttons.
export function Bubble({
  direction,
  sender,
  time,
  className,
  children,
}: {
  direction: "in" | "out";
  sender: string;
  time: { label: string; dateTime: string };
  className?: string;
  children: ReactNode;
}) {
  const outgoing = direction === "out";

  return (
    <div
      className={cx(
        "rounded-md px-3 pt-2 pb-1.5 text-ui text-ink",
        outgoing ? "rounded-tr-xs bg-bubble-out" : "rounded-tl-xs bg-surface",
        className,
      )}
    >
      <span className="sr-only">{sender}: </span>
      {children}
      <p className="mt-0.5 flex items-center justify-end gap-1 text-label text-ink-3 tabular-nums">
        <time dateTime={time.dateTime}>{time.label}</time>
        {outgoing && <CheckCheck aria-hidden className="size-3.5" />}
      </p>
    </div>
  );
}
