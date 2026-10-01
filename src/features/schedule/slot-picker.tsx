"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/button-link";
import type { AvailabilityResponse } from "@/features/schedule/availability";
import { cx } from "@/lib/cx";

// Free start times from the availability engine, as one radio group grouped
// by day (arrow keys move through every time). Used wherever the owner picks
// a time: approving another time, adding a booking, moving one.

export type SlotQuery = {
  from: string;
  days: number;
  /** Bump to fetch again (for example after a time was taken). */
  version?: number;
  serviceId?: string;
  bookingId?: string;
};

type Result =
  | { key: string; status: "ready"; data: AvailabilityResponse }
  | { key: string; status: "error" };

function queryKey(q: SlotQuery) {
  const params = new URLSearchParams({ from: q.from, days: String(q.days) });
  if (q.serviceId) params.set("service", q.serviceId);
  if (q.bookingId) params.set("booking", q.bookingId);
  if (q.version) params.set("v", String(q.version));
  return params.toString();
}

export function SlotPicker({
  query,
  value,
  onChange,
  name,
  label,
  highlight,
  proposed,
  emptyMessage = "Nothing free on these days. Try another date.",
}: {
  query: SlotQuery;
  value: string | null;
  onChange: (startsAt: string, label: string) => void;
  name: string;
  /** Accessible name for the whole group. */
  label: string;
  /** Times that match what the customer asked for. */
  highlight?: { date: string; after: string | null; note: string };
  /** The time Pingflow proposed, marked as such. */
  proposed?: string;
  emptyMessage?: string;
}) {
  const key = queryKey(query);
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/availability?${key}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<AvailabilityResponse>;
      })
      .then((data) => {
        if (!cancelled) setResult({ key, status: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  const current = result?.key === key ? result : null;

  if (!current) {
    return (
      <div
        aria-busy="true"
        aria-label="Finding free times"
        className="space-y-5"
      >
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <div className="h-4 w-28 rounded-xs bg-sunken motion-safe:animate-pulse" />
            <div className="mt-2.5 flex gap-2">
              {[0, 1, 2, 3].map((j) => (
                <div
                  key={j}
                  className="h-10 w-16 rounded-md bg-sunken motion-safe:animate-pulse"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (current.status === "error") {
    return (
      <div className="rounded-md border border-line bg-canvas px-4 py-4">
        <p className="text-ui text-ink">Couldn’t load free times.</p>
        <p className="mt-0.5 text-ui-sm text-ink-3">
          Check your connection and try again.
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          onClick={() => {
            setResult(null);
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const { days, fitFor } = current.data;
  const anyFree = days.some((d) => d.slots.length > 0);

  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <p className="text-ui-sm text-ink-3">
        Times that fit {fitFor}.
        {highlight && (
          <>
            {" "}
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span
                aria-hidden
                className="size-2 rounded-full border border-ink bg-accent"
              />
              {highlight.note}
            </span>
          </>
        )}
      </p>
      {!anyFree && (
        <p className="mt-4 rounded-md bg-canvas px-4 py-3 text-ui text-ink-2">
          {emptyMessage}
        </p>
      )}
      <div className="mt-4 space-y-5">
        {days.map((day) => (
          <div key={day.date} role="group" aria-label={day.label}>
            <p className="flex items-baseline gap-2 text-ui font-medium text-ink">
              {day.relativeLabel}
              {day.relativeLabel !== day.label && (
                <span className="font-normal text-ink-3">{day.label}</span>
              )}
            </p>
            {day.slots.length === 0 ? (
              <p className="mt-1 text-ui-sm text-ink-3">Nothing free</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {day.slots.map((slot) => {
                  const matches =
                    highlight &&
                    day.date === highlight.date &&
                    (!highlight.after || slot.time >= highlight.after);
                  const isProposed = proposed === slot.startsAt;
                  const slotLabel = `${day.label}, ${slot.time}`;
                  return (
                    <label key={slot.startsAt} className="relative">
                      <input
                        type="radio"
                        name={name}
                        value={slot.startsAt}
                        checked={value === slot.startsAt}
                        onChange={() => onChange(slot.startsAt, slotLabel)}
                        aria-label={`${slotLabel}${isProposed ? ", proposed" : ""}${matches ? ", matches the request" : ""}`}
                        className="radio-chip peer sr-only"
                      />
                      <span
                        className={cx(
                          "flex h-10 min-w-16 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 text-ui text-ink tabular-nums transition-[background-color,border-color,color] duration-150",
                          "border-line-strong bg-surface hover:border-ink-3",
                          "peer-checked:border-ink peer-checked:bg-ink peer-checked:text-canvas",
                        )}
                      >
                        {matches && (
                          <span
                            aria-hidden
                            className="size-2 rounded-full border border-ink bg-accent"
                          />
                        )}
                        {slot.time}
                        {isProposed && (
                          <span className="text-label opacity-70">
                            Proposed
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </fieldset>
  );
}
