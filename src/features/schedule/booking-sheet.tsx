"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { DetailList, inputClassName, Label } from "@/components/app/fields";
import { Overlay } from "@/components/app/overlay";
import { Spinner } from "@/components/app/spinner";
import { useToast } from "@/components/app/toaster";
import { Button } from "@/components/button-link";
import { cancelBooking, moveBooking } from "@/features/schedule/actions";
import type { BookingDetail } from "@/features/schedule/data";
import { SlotPicker } from "@/features/schedule/slot-picker";

type Mode = "view" | "move" | "cancel";

// One booking: its details, and moving or cancelling it. For a recurring
// booking, only this occurrence changes.
export function BookingSheet({
  booking,
  onClose,
}: {
  booking: BookingDetail | null;
  onClose: () => void;
}) {
  return (
    <Overlay
      open={booking !== null}
      onClose={onClose}
      title={booking ? `${booking.customerName}` : ""}
      description={
        booking
          ? `${booking.serviceName} · ${booking.day}, ${booking.time}`
          : undefined
      }
    >
      {booking && (
        <BookingBody key={booking.id} booking={booking} onDone={onClose} />
      )}
    </Overlay>
  );
}

function BookingBody({
  booking,
  onDone,
}: {
  booking: BookingDetail;
  onDone: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("view");
  const [date, setDate] = useState(booking.date);
  const [choice, setChoice] = useState<{
    startsAt: string;
    label: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const finish = (
    result: { ok: true; message?: string } | { ok: false; error: string },
  ) => {
    if (result.ok) {
      toast({ message: result.message ?? "Done." });
      onDone();
    } else {
      setError(result.error);
    }
  };

  return (
    <div>
      {booking.request && (
        <div className="mb-5 flex items-start gap-2.5 rounded-md bg-night px-3.5 py-3 text-ui text-night-text">
          <span
            aria-hidden
            className="mt-1.5 size-2 shrink-0 rounded-full bg-accent"
          />
          <p>
            {booking.request.summary}{" "}
            <Link
              href="/app"
              className="font-medium text-accent underline underline-offset-4"
            >
              Review in Attention
            </Link>
          </p>
        </div>
      )}
      {booking.movedFrom && (
        <p className="mb-5 rounded-md bg-accent px-3.5 py-2.5 text-ui text-ink">
          Moved today from {booking.movedFrom}.
        </p>
      )}

      <DetailList
        items={[
          {
            label: "Customer",
            value: (
              <>
                <Link
                  href={`/app/customers/${booking.customerId}`}
                  className="font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                >
                  {booking.customerName}
                </Link>
                {booking.contact && (
                  <span className="block text-ink-3">{booking.contact}</span>
                )}
              </>
            ),
          },
          { label: "When", value: `${booking.day}, ${booking.time}` },
          {
            label: "Length",
            value: [booking.length, booking.buffer].filter(Boolean).join(" · "),
          },
          { label: "Repeats", value: booking.series ?? "One-off" },
          {
            label: "Reminder",
            value:
              booking.reminder ?? (booking.past ? "None" : "Not scheduled"),
          },
        ]}
      />

      {error && (
        <p
          role="alert"
          className="mt-5 rounded-md bg-alert/5 px-3 py-2.5 text-ui text-alert"
        >
          {error}
        </p>
      )}

      {booking.past ? (
        <p className="mt-6 text-ui text-ink-3">
          This booking has already happened.
        </p>
      ) : mode === "view" ? (
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setMode("move")}>
            Move
          </Button>
          <Button variant="ghost" onClick={() => setMode("cancel")}>
            Cancel booking
          </Button>
        </div>
      ) : mode === "move" ? (
        <section
          aria-labelledby="move-title"
          className="mt-6 border-t border-line pt-5"
        >
          <h3 id="move-title" className="text-ui font-medium text-ink">
            Move to
          </h3>
          {booking.series && (
            <p className="mt-0.5 text-ui-sm text-ink-3">
              Only this {booking.day.split(" ")[0]} moves. The weekly booking
              stays as it is.
            </p>
          )}
          <div className="mt-3 max-w-[12rem]">
            <Label
              htmlFor="move-date"
              className="text-ui-sm font-normal text-ink-3"
            >
              Starting from
            </Label>
            <input
              id="move-date"
              type="date"
              value={date}
              onChange={(e) => {
                if (e.target.value) {
                  setDate(e.target.value);
                  setChoice(null);
                }
              }}
              className={`${inputClassName} mt-1`}
            />
          </div>
          <div className="mt-4">
            <SlotPicker
              name={`move-${booking.id}`}
              label="Free times"
              query={{ from: date, days: 3, bookingId: booking.id }}
              value={choice?.startsAt ?? null}
              onChange={(startsAt, label) => setChoice({ startsAt, label })}
            />
          </div>
          <div className="sticky bottom-0 -mx-5 mt-5 flex flex-wrap justify-end gap-2 border-t border-line bg-surface px-5 pt-3 md:-mx-6 md:px-6">
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setMode("view")}
            >
              Back
            </Button>
            <Button
              disabled={!choice || pending}
              onClick={() =>
                choice &&
                startTransition(async () =>
                  finish(
                    await moveBooking({
                      bookingId: booking.id,
                      startsAt: choice.startsAt,
                    }),
                  ),
                )
              }
            >
              {pending ? (
                <>
                  <Spinner /> Moving…
                </>
              ) : choice ? (
                `Move to ${choice.label}`
              ) : (
                "Choose a time"
              )}
            </Button>
          </div>
        </section>
      ) : (
        <section
          aria-labelledby="cancel-title"
          className="mt-6 rounded-md border border-alert/25 bg-alert/5 px-4 py-4"
        >
          <h3 id="cancel-title" className="text-ui font-medium text-ink">
            Cancel this booking?
          </h3>
          <p className="mt-1 text-ui text-ink-2">
            The time becomes free and the reminder is cancelled.{" "}
            {booking.customerName.split(" ")[0]} isn’t messaged: WhatsApp isn’t
            connected yet.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                startTransition(async () =>
                  finish(await cancelBooking(booking.id)),
                )
              }
            >
              {pending ? (
                <>
                  <Spinner /> Cancelling…
                </>
              ) : (
                "Cancel booking"
              )}
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setMode("view")}
            >
              Keep it
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
