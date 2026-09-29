"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/app/avatar";
import { Spinner } from "@/components/app/spinner";
import { useToast } from "@/components/app/toaster";
import { Button } from "@/components/button-link";
import { dismissNote } from "@/features/attention/actions";
import type { NoteItem } from "@/features/attention/data";

// A message that needs a personal reply, or something that failed. The owner
// deals with it (in WhatsApp, for now) and marks it handled.
export function NoteCard({ item }: { item: NoteItem }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const titleId = `${item.id}-title`;

  return (
    <article
      aria-labelledby={titleId}
      className="overflow-hidden rounded-lg border border-line bg-surface"
    >
      <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
        {item.customer && <Avatar name={item.customer.name} />}
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-body font-medium text-ink">
            {item.title}
          </h3>
          <p className="mt-0.5 text-ui-sm text-ink-3">
            {item.customer?.name ?? "Unknown contact"} · {item.receivedLabel}
          </p>
          {item.explanation && (
            <p className="mt-2 text-ui text-ink-2">{item.explanation}</p>
          )}
          {item.body && (
            <p className="mt-3 rounded-md bg-chat px-3 py-2 text-ui text-ink">
              {item.body}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-ui text-alert">
              {error}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line px-3 py-3 sm:px-5">
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await dismissNote(item.id);
              if (result.ok) toast({ message: result.message ?? "Done." });
              else setError(result.error);
            })
          }
        >
          {pending && <Spinner />}
          Mark as handled
        </Button>
        {item.customer && (
          <Link
            href={`/app/customers/${item.customer.id}`}
            className="inline-flex h-10 items-center rounded-md px-4 text-ui font-medium text-ink-2 hover:bg-sunken hover:text-ink"
          >
            Open customer
          </Link>
        )}
      </div>
    </article>
  );
}
