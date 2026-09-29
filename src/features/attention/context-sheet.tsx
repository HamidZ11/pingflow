"use client";

import Link from "next/link";
import { Overlay } from "@/components/app/overlay";
import { Bubble } from "@/components/reschedule-demo/chat";
import type { DayEntry, TimedRequestItem } from "@/features/attention/data";
import { cx } from "@/lib/cx";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-label font-medium text-ink-3">{title}</h3>
      <div className="mt-1.5 text-ui text-ink">{children}</div>
    </section>
  );
}

const entryStyles: Record<DayEntry["kind"], string> = {
  booking: "border border-line-strong bg-sunken",
  current: "border border-dashed border-ink-3 bg-surface",
  travel: "hatch",
  blocked: "hatch border border-line-strong",
  free: "border border-dashed border-line-strong bg-surface",
  proposal: "bg-accent",
};

// Everything behind a request, for when the card isn't enough: who it is,
// what they said, the booking, what Pingflow understood and why it proposed
// the time it did.
export function ContextSheet({
  item,
  open,
  onClose,
}: {
  item: TimedRequestItem;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Overlay
      open={open}
      onClose={onClose}
      title="Context"
      description={item.headline}
      footer={
        <Link
          href={`/app/schedule?view=day&date=${item.requested.date}`}
          className="inline-flex h-10 items-center rounded-md border border-line-strong bg-surface px-4 text-ui font-medium text-ink hover:border-ink-3"
        >
          Open {item.requested.day} in Schedule
        </Link>
      }
    >
      <div className="space-y-5">
        <Section title="Customer">
          <Link
            href={`/app/customers/${item.customer.id}`}
            className="font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            {item.customer.name}
          </Link>
          {item.customer.contact && (
            <p className="text-ink-3">{item.customer.contact}</p>
          )}
        </Section>

        {item.message && (
          <Section title="Original message">
            <div className="flex rounded-md bg-chat p-3">
              <Bubble
                direction="in"
                sender={item.customer.firstName}
                time={{
                  label: item.message.time,
                  dateTime: item.message.dateTime,
                }}
                className="max-w-[92%]"
              >
                <p>{item.message.body}</p>
              </Bubble>
            </div>
          </Section>
        )}

        {item.type === "reschedule" ? (
          <>
            <Section title="Current booking">
              <p>
                {item.service.name} · {item.current.day}, {item.current.time}
              </p>
              <p className="text-ink-3">
                {[item.service.length, item.service.buffer, item.series]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </Section>

            <Section title="Requested change">
              <p>Move to {item.requested.long}</p>
            </Section>

            <Section title="What Pingflow understood">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-ink-3">Request</dt>
                <dd>Move one booking</dd>
                <dt className="text-ink-3">Customer</dt>
                <dd>{item.customer.name}, recognised by their number</dd>
                <dt className="text-ink-3">Booking</dt>
                <dd>
                  Found: {item.current.day}, {item.current.time}
                </dd>
                <dt className="text-ink-3">Wants</dt>
                <dd>{item.requested.short}</dd>
                {item.series && (
                  <>
                    <dt className="text-ink-3">Series</dt>
                    <dd>Only this week’s booking moves</dd>
                  </>
                )}
              </dl>
            </Section>
          </>
        ) : (
          <>
            <Section title="Requested booking">
              <p>
                {item.service.name} · {item.requested.long}
              </p>
              <p className="text-ink-3">
                {[item.service.length, item.service.buffer]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </Section>

            <Section title="What Pingflow understood">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-ink-3">Request</dt>
                <dd>A new booking</dd>
                <dt className="text-ink-3">Customer</dt>
                <dd>{item.customer.name}, recognised by their number</dd>
                <dt className="text-ink-3">Service</dt>
                <dd>{item.service.name}</dd>
                <dt className="text-ink-3">Wants</dt>
                <dd>{item.requested.short}</dd>
              </dl>
            </Section>
          </>
        )}

        <Section title="Proposed time">
          {item.proposal ? (
            <>
              <p>
                <span
                  className={cx(
                    "-mx-1 rounded-xs px-1 font-medium",
                    item.proposal.stillFree && "bg-accent",
                  )}
                >
                  {item.proposal.day}, {item.proposal.time}
                </span>
              </p>
              <p className="mt-0.5 text-ink-3">
                {item.proposal.stillFree
                  ? item.proposal.reason
                  : "No longer free: it has been taken since."}
              </p>
            </>
          ) : (
            <p className="text-ink-3">Nothing free that matches.</p>
          )}
          <h4 className="mt-4 text-label font-medium text-ink-3">
            {item.requestedDay.label}
          </h4>
          <ol className="mt-2 space-y-1.5">
            {item.requestedDay.entries.map((entry) => (
              <li
                key={entry.key}
                className={cx(
                  "flex items-baseline justify-between gap-3 rounded-sm px-2.5 py-1.5 text-ui-sm",
                  entryStyles[entry.kind],
                )}
              >
                <span
                  className={cx(
                    "min-w-0 truncate",
                    entry.kind === "proposal"
                      ? "font-medium text-ink"
                      : "text-ink",
                    (entry.kind === "travel" || entry.kind === "free") &&
                      "text-ink-2",
                  )}
                >
                  {entry.label}
                </span>
                <span className="shrink-0 text-ink-2 tabular-nums">
                  {entry.time}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </Overlay>
  );
}
