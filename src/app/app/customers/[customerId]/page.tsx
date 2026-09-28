import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader, pageClassName } from "@/components/app/page-header";
import { Bubble } from "@/components/reschedule-demo/chat";
import { loadCustomer } from "@/features/customers/data";
import { ResumeButton } from "@/features/customers/resume-button";
import { requireOwner } from "@/lib/auth/session";
import { cx } from "@/lib/cx";

export const metadata: Metadata = { title: "Customer" };

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cx("rounded-lg border border-line bg-surface", className)}
    >
      <h2 className="border-b border-line px-4 py-3 text-ui font-medium text-ink">
        {title}
      </h2>
      <div className="px-4 py-3.5">{children}</div>
    </section>
  );
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CustomerPage({
  params,
}: PageProps<"/app/customers/[customerId]">) {
  const { customerId } = await params;
  if (!uuidPattern.test(customerId)) notFound();
  const owner = await requireOwner();
  const customer = await loadCustomer(owner, customerId);
  if (!customer) notFound();
  const first = customer.name.split(" ")[0];

  return (
    <div className={pageClassName("medium")}>
      <Link
        href="/app/customers"
        className="mt-4 -ml-2 inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-ui text-ink-2 hover:bg-sunken hover:text-ink md:mt-6"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Customers
      </Link>
      <PageHeader
        className="pt-2 md:pt-2"
        title={customer.name}
        description={customer.regular ?? "No regular slot"}
      />

      {customer.pausedConversationId && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-night px-4 py-3.5 text-night-text">
          <p className="text-ui">
            You’re handling {first}’s messages
            {customer.pausedSince ? ` (since ${customer.pausedSince})` : ""}.
            Pingflow won’t reply to them until you let it.
          </p>
          <ResumeButton
            conversationId={customer.pausedConversationId}
            customerName={customer.name}
          />
        </div>
      )}
      {customer.openRequests > 0 && (
        <p className="mb-6 flex items-center gap-2.5 rounded-lg border border-line bg-surface px-4 py-3 text-ui text-ink">
          <span
            aria-hidden
            className="size-2.5 rounded-full border-[1.5px] border-ink bg-accent"
          />
          {first} has a request waiting.{" "}
          <Link
            href="/app"
            className="font-medium underline underline-offset-4"
          >
            Open Attention
          </Link>
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Panel title="Upcoming">
            {customer.upcoming.length === 0 ? (
              <p className="text-ui text-ink-3">Nothing booked.</p>
            ) : (
              <ul className="divide-y divide-line">
                {customer.upcoming.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-wrap justify-between gap-x-4 py-2 text-ui first:pt-0 last:pb-0"
                  >
                    <span className="text-ink tabular-nums">{b.when}</span>
                    <span className="text-ink-3">{b.service}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recent messages">
            {customer.messages.length === 0 ? (
              <p className="text-ui text-ink-3">No messages yet.</p>
            ) : (
              <ol className="-mx-4 -my-3.5 flex flex-col gap-2 bg-chat px-4 py-4">
                {customer.messages.map((m) => (
                  <li
                    key={m.id}
                    className={cx(
                      "flex max-w-[88%] flex-col",
                      m.direction === "outbound"
                        ? "items-end self-end"
                        : "self-start",
                    )}
                  >
                    <Bubble
                      direction={m.direction === "outbound" ? "out" : "in"}
                      sender={m.direction === "outbound" ? "Pingflow" : first}
                      time={{ label: m.time, dateTime: m.dateTime }}
                      delivered={!m.simulated}
                    >
                      <p>{m.body}</p>
                    </Bubble>
                    {m.simulated && (
                      <span className="mt-1 text-label text-ink-3">
                        Not sent: WhatsApp isn’t connected yet
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="History">
            {customer.past.length === 0 ? (
              <p className="text-ui text-ink-3">No past bookings.</p>
            ) : (
              <ul className="divide-y divide-line">
                {customer.past.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-wrap justify-between gap-x-4 py-2 text-ui first:pt-0 last:pb-0"
                  >
                    <span
                      className={cx(
                        "tabular-nums",
                        b.cancelled ? "text-ink-3 line-through" : "text-ink",
                      )}
                    >
                      {b.when}
                    </span>
                    <span className="text-ink-3">
                      {b.cancelled ? "Cancelled" : b.service}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="WhatsApp">
            {customer.contacts.length === 0 ? (
              <p className="text-ui text-ink-3">No number saved.</p>
            ) : (
              <ul className="space-y-3">
                {customer.contacts.map((c) => (
                  <li key={c.phone} className="text-ui">
                    <p className="font-medium text-ink">{c.name}</p>
                    <p className="text-ink-2 tabular-nums">{c.phone}</p>
                    <p className="text-ui-sm text-ink-3">
                      {c.relationshipLabel}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Notes">
            <p
              className={cx(
                "text-ui whitespace-pre-line",
                customer.notes ? "text-ink" : "text-ink-3",
              )}
            >
              {customer.notes ?? "No notes."}
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
