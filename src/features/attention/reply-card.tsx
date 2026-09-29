"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { Avatar } from "@/components/app/avatar";
import { FieldError, Label, textareaClassName } from "@/components/app/fields";
import { Overlay } from "@/components/app/overlay";
import { Spinner } from "@/components/app/spinner";
import { useToast } from "@/components/app/toaster";
import { Button } from "@/components/button-link";
import { Bubble } from "@/components/reschedule-demo/chat";
import { dismissNote, replyToMessage } from "@/features/attention/actions";
import { canSendReply, channelNote } from "@/features/attention/channel-note";
import type { ReplyItem } from "@/features/attention/data";

// A message Pingflow left for the owner to answer: it wasn't sure what it
// meant, it came from a number it doesn't know, or it needs a personal
// reply. Pingflow may have drafted an answer; nothing goes out until the
// owner sends it.
export function ReplyCard({ item }: { item: ReplyItem }) {
  const toast = useToast();
  const [replying, setReplying] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const titleId = `${item.id}-title`;

  return (
    <article
      aria-labelledby={titleId}
      className="overflow-hidden rounded-lg border border-line bg-surface"
    >
      <div className="px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <Avatar name={item.customer?.name ?? item.sender.name} />
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="text-body font-medium text-ink">
              {item.title}
            </h3>
            <p className="mt-0.5 text-ui-sm break-words text-ink-3">
              {item.sender.detail} ·{" "}
              <time dateTime={item.receivedAt}>{item.receivedLabel}</time>
            </p>
          </div>
        </div>
        {item.message && (
          <div className="mt-4 flex rounded-md bg-chat p-3">
            <Bubble
              direction="in"
              sender={item.sender.name}
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
        {item.explanation && (
          <p className="mt-3 text-ui text-ink-2">{item.explanation}</p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-ui text-alert">
            {error}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-line p-3 sm:flex sm:flex-wrap sm:items-center sm:px-5">
        <Button
          className="col-span-2"
          disabled={pending}
          onClick={() => setReplying(true)}
        >
          Reply
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          className={item.customer ? undefined : "col-span-2"}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await dismissNote(item.id);
              if (result.ok) {
                toast({ message: result.message ?? "Done." });
                document.querySelector<HTMLElement>("main h1")?.focus();
              } else setError(result.error);
            })
          }
        >
          {pending && <Spinner />}
          Mark as handled
        </Button>
        {item.customer && (
          <Link
            href={`/app/customers/${item.customer.id}`}
            className="inline-flex h-10 items-center justify-center rounded-md px-4 text-ui font-medium text-ink-2 hover:bg-sunken hover:text-ink"
          >
            Open customer
          </Link>
        )}
      </div>
      <ReplySheet
        item={item}
        open={replying}
        onClose={() => setReplying(false)}
      />
    </article>
  );
}

function ReplySheet({
  item,
  open,
  onClose,
}: {
  item: ReplyItem;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const id = useId();
  const [body, setBody] = useState(item.draft ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const whatsapp = item.channel.kind === "whatsapp";
  const sendable = canSendReply(item.channel);

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await replyToMessage(item.id, body);
      if (result.ok) {
        onClose();
        toast({ message: result.message ?? "Done." });
        document.querySelector<HTMLElement>("main h1")?.focus();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Overlay
      open={open}
      onClose={() => {
        setError(null);
        onClose();
      }}
      dismissible={!pending}
      title={`Reply to ${item.sender.name}`}
      description={item.title}
      footer={
        <>
          <Button variant="ghost" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending || !body.trim() || !sendable}
            onClick={send}
          >
            {pending ? (
              <>
                <Spinner />
                {whatsapp ? "Sending…" : "Recording…"}
              </>
            ) : whatsapp ? (
              "Send reply"
            ) : (
              "Record reply"
            )}
          </Button>
        </>
      }
    >
      {item.message && (
        <div className="mb-5 flex rounded-md bg-chat p-3">
          <Bubble
            direction="in"
            sender={item.sender.name}
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
      <Label htmlFor={`${id}-body`}>Your reply</Label>
      <textarea
        id={`${id}-body`}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={4096}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-note${error ? ` ${id}-error` : ""}`}
        className={`${textareaClassName} mt-2`}
      />
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
      <p id={`${id}-note`} className="mt-3 text-ui-sm text-ink-3">
        {item.draft
          ? "Pingflow drafted this from what it knows. Check it first. "
          : ""}
        {channelNote(item.channel, "reply")}
      </p>
    </Overlay>
  );
}
