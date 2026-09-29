"use client";

import { ArrowRight, TriangleAlert } from "lucide-react";
import { type ReactNode, useState, useTransition } from "react";
import { Avatar } from "@/components/app/avatar";
import { Spinner } from "@/components/app/spinner";
import { useToast } from "@/components/app/toaster";
import { Button } from "@/components/button-link";
import { Bubble } from "@/components/reschedule-demo/chat";
import {
  approveRequest,
  declineRequest,
  takeOverRequest,
} from "@/features/attention/actions";
import { ChooseTimeSheet } from "@/features/attention/choose-time-sheet";
import { ContextSheet } from "@/features/attention/context-sheet";
import type {
  CancellationItem,
  RescheduleItem,
  TimedRequestItem,
} from "@/features/attention/data";
import { DeclineDialog } from "@/features/attention/decline-dialog";
import type { ActionResult } from "@/lib/errors";

type Busy = "approve" | "decline" | "take_over" | null;
type Sheet = "context" | "choose" | "decline" | null;

type RequestItem = RescheduleItem | TimedRequestItem | CancellationItem;

// A customer's request, with everything needed to decide without opening
// another screen: who, what they said, what Pingflow suggests, and the
// answers. Layers follow the site: the customer's message on the chat
// surface, Pingflow's suggestion on the night surface, the owner's decision.
function useAnswer(item: RequestItem) {
  const toast = useToast();
  const [busy, setBusy] = useState<Busy>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(kind: Exclude<Busy, null>, action: () => Promise<ActionResult>) {
    setError(null);
    setBusy(kind);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setSheet(null);
        toast({
          message: result.message ?? "Done.",
          action:
            kind === "approve" && item.type !== "cancellation"
              ? { href: "/app/schedule", label: "View schedule" }
              : undefined,
        });
        // The card is about to disappear; keep focus on the page.
        document.querySelector<HTMLElement>("main h1")?.focus();
      } else {
        setError(result.error);
        setBusy(null);
      }
    });
  }

  return {
    busy,
    sheet,
    setSheet,
    error,
    closeSheet: () => {
      setSheet(null);
      setError(null);
    },
    approve: (startsAt?: string) =>
      run("approve", () => approveRequest(item.id, startsAt)),
    decline: () => run("decline", () => declineRequest(item.id)),
    takeOver: () => run("take_over", () => takeOverRequest(item.id)),
  };
}

function Shell({
  item,
  busy,
  error,
  onContext,
  panel,
  actions,
  children,
}: {
  item: RequestItem;
  busy: Busy;
  error: string | null;
  onContext?: () => void;
  panel: ReactNode;
  actions: ReactNode;
  children?: ReactNode;
}) {
  const titleId = `${item.id}-title`;
  return (
    <article
      aria-labelledby={titleId}
      aria-busy={busy !== null}
      className="overflow-hidden rounded-lg border border-line bg-surface shadow-raised motion-safe:animate-message-in"
    >
      <div className="px-4 pt-4 pb-4 sm:px-5 sm:pt-5">
        <div className="flex items-start gap-3">
          <Avatar name={item.customer.name} />
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="text-body font-medium text-ink">
              {item.headline}
            </h3>
            <p className="mt-0.5 text-ui-sm text-ink-3">
              WhatsApp ·{" "}
              <time dateTime={item.receivedAt}>{item.receivedLabel}</time>
            </p>
          </div>
          {onContext && (
            <button
              type="button"
              onClick={onContext}
              className="-mt-1 -mr-1 hidden h-9 shrink-0 items-center rounded-md px-2.5 text-ui text-ink-2 underline decoration-line-strong underline-offset-4 transition-[color,background-color] duration-150 hover:bg-sunken hover:text-ink sm:inline-flex"
            >
              View context
            </button>
          )}
        </div>

        {item.message && (
          <div className="mt-4 flex rounded-md bg-chat p-3">
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
        )}
      </div>

      <div className="bg-night px-4 py-4 text-night-text sm:px-5">{panel}</div>

      {error && (
        <p
          role="alert"
          className="border-t border-line bg-alert/5 px-4 py-3 text-ui text-alert sm:px-5"
        >
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 border-t border-line p-3 sm:flex sm:flex-wrap sm:items-center sm:px-5">
        {actions}
      </div>
      {children}
    </article>
  );
}

function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-label font-medium text-night-text-2">
      <span aria-hidden className="size-2 rounded-full bg-accent" />
      {children}
    </p>
  );
}

function TakeOverButton({
  busy,
  onClick,
}: {
  busy: Busy;
  onClick: () => void;
}) {
  return (
    <Button variant="ghost" disabled={busy !== null} onClick={onClick}>
      {busy === "take_over" ? (
        <>
          <Spinner />
          Handing over…
        </>
      ) : (
        "I’ll handle it"
      )}
    </Button>
  );
}

/** Moving a booking, or making a new one: both approve a time. */
export function TimedRequestCard({ item }: { item: TimedRequestItem }) {
  const answer = useAnswer(item);
  const { busy } = answer;
  const { proposal } = item;
  const canApprove = Boolean(proposal?.stillFree);

  return (
    <Shell
      item={item}
      busy={busy}
      error={answer.error}
      onContext={() => answer.setSheet("context")}
      panel={
        <>
          <PanelLabel>Pingflow suggests</PanelLabel>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-start gap-x-3 sm:max-w-md">
            <div className="min-w-0">
              {item.type === "reschedule" ? (
                <>
                  <p className="text-label text-night-text-3">
                    Now<span className="sr-only">:</span>
                  </p>
                  <p className="mt-0.5 text-ui text-night-text-2">
                    {item.current.day}
                  </p>
                  <p className="text-ui text-night-text-2 tabular-nums">
                    {item.current.time}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-label text-night-text-3">
                    Asked for<span className="sr-only">:</span>
                  </p>
                  <p className="mt-0.5 text-ui text-night-text-2">
                    {item.requested.short}
                  </p>
                  <p className="text-ui text-night-text-2">
                    {item.service.name}
                  </p>
                </>
              )}
            </div>
            <ArrowRight aria-hidden className="mt-5 size-4 text-night-text-3" />
            <div className="min-w-0">
              <p className="text-label text-night-text-3">
                {proposal
                  ? "Proposed"
                  : item.type === "reschedule"
                    ? "Asked for"
                    : "Proposed"}
              </p>
              {proposal ? (
                <>
                  <p className="mt-0.5 text-ui font-medium">{proposal.day}</p>
                  <p className="text-ui tabular-nums">
                    <span
                      className={
                        proposal.stillFree
                          ? "-mx-1 rounded-xs bg-accent px-1 font-medium text-ink"
                          : "text-night-text-2 line-through decoration-night-text-3"
                      }
                    >
                      {proposal.time}
                    </span>
                  </p>
                </>
              ) : item.type === "reschedule" ? (
                <p className="mt-0.5 text-ui font-medium">
                  {item.requested.short}
                </p>
              ) : (
                <p className="mt-0.5 text-ui font-medium">Nothing free</p>
              )}
            </div>
          </div>
          {proposal?.stillFree && (
            <p className="mt-3 text-ui-sm text-night-text-2">
              {proposal.weekday} {proposal.start} is free. {proposal.reason}
            </p>
          )}
          {proposal && !proposal.stillFree && (
            <p className="mt-3 flex items-start gap-2 text-ui-sm text-night-text">
              <TriangleAlert
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-accent"
              />
              {proposal.weekday} {proposal.start} was free when{" "}
              {item.customer.firstName} asked, but it’s been taken since. Choose
              another time.
            </p>
          )}
          {!proposal && item.type === "booking" && (
            <p className="mt-3 text-ui-sm text-night-text-2">
              Nothing is free that day. Choose another time, or decline.
            </p>
          )}
        </>
      }
      actions={
        <>
          {canApprove && proposal && (
            <Button
              className="col-span-2"
              disabled={busy !== null}
              onClick={() => answer.approve()}
            >
              {busy === "approve" ? (
                <>
                  <Spinner />
                  Approving…
                </>
              ) : (
                <>
                  Approve {proposal.weekdayShort} {proposal.start}
                </>
              )}
            </Button>
          )}
          <Button
            variant={canApprove ? "secondary" : "primary"}
            className="col-span-2"
            disabled={busy !== null}
            onClick={() => answer.setSheet("choose")}
          >
            Choose another time
          </Button>
          <Button
            variant="ghost"
            disabled={busy !== null}
            onClick={() => answer.setSheet("decline")}
          >
            Decline
          </Button>
          <TakeOverButton busy={busy} onClick={answer.takeOver} />
          <Button
            variant="ghost"
            className="col-span-2 sm:hidden"
            onClick={() => answer.setSheet("context")}
          >
            View context
          </Button>
        </>
      }
    >
      <ContextSheet
        item={item}
        open={answer.sheet === "context"}
        onClose={() => answer.setSheet(null)}
      />
      <ChooseTimeSheet
        item={item}
        open={answer.sheet === "choose"}
        busy={busy === "approve"}
        error={answer.sheet === "choose" ? answer.error : null}
        onClose={answer.closeSheet}
        onConfirm={(startsAt) => answer.approve(startsAt)}
      />
      <DeclineDialog
        title={`Decline ${item.customer.firstName}’s request?`}
        description={
          item.type === "reschedule"
            ? `The booking stays on ${item.current.day}, ${item.current.time}.`
            : "Nothing will be booked."
        }
        reply={item.declineReply}
        channel={item.channel}
        open={answer.sheet === "decline"}
        busy={busy === "decline"}
        error={answer.sheet === "decline" ? answer.error : null}
        onClose={answer.closeSheet}
        onConfirm={answer.decline}
      />
    </Shell>
  );
}

/** Cancelling a booking: approve, decline or take it over. */
export function CancellationCard({ item }: { item: CancellationItem }) {
  const answer = useAnswer(item);
  const { busy } = answer;

  return (
    <Shell
      item={item}
      busy={busy}
      error={answer.error}
      panel={
        <>
          <PanelLabel>Pingflow understood</PanelLabel>
          <div className="mt-3 min-w-0">
            <p className="text-label text-night-text-3">
              Cancel<span className="sr-only">:</span>
            </p>
            <p className="mt-0.5 text-ui font-medium">
              {item.service.name} · {item.booking.day}
            </p>
            <p className="text-ui tabular-nums">{item.booking.time}</p>
          </div>
          {item.booking.active ? (
            <p className="mt-3 text-ui-sm text-night-text-2">
              {item.confirmReply
                ? `Approving cancels it and replies to ${item.customer.firstName}.`
                : "Approving cancels it. Confirmations are off, so no reply is sent."}
              {item.series ? " Only this booking is cancelled." : ""}
            </p>
          ) : (
            <p className="mt-3 flex items-start gap-2 text-ui-sm text-night-text">
              <TriangleAlert
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-accent"
              />
              This booking has already been cancelled or has passed.
            </p>
          )}
          {item.scopeNote && (
            <p className="mt-2 flex items-start gap-2 text-ui-sm text-night-text">
              <TriangleAlert
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-accent"
              />
              {item.scopeNote}
            </p>
          )}
        </>
      }
      actions={
        <>
          {item.booking.active && (
            <Button
              className="col-span-2"
              disabled={busy !== null}
              onClick={() => answer.approve()}
            >
              {busy === "approve" ? (
                <>
                  <Spinner />
                  Cancelling…
                </>
              ) : (
                "Approve cancellation"
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={busy !== null}
            onClick={() => answer.setSheet("decline")}
          >
            Decline
          </Button>
          <TakeOverButton busy={busy} onClick={answer.takeOver} />
        </>
      }
    >
      <DeclineDialog
        title={`Decline ${item.customer.firstName}’s cancellation?`}
        description={`The booking stays on ${item.booking.day}, ${item.booking.time}.`}
        reply={item.declineReply}
        channel={item.channel}
        open={answer.sheet === "decline"}
        busy={busy === "decline"}
        error={answer.sheet === "decline" ? answer.error : null}
        onClose={answer.closeSheet}
        onConfirm={answer.decline}
      />
    </Shell>
  );
}
