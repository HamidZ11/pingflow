"use client";

import { useState } from "react";
import { Overlay } from "@/components/app/overlay";
import { Spinner } from "@/components/app/spinner";
import { Button } from "@/components/button-link";
import type { RescheduleItem } from "@/features/attention/data";
import { SlotPicker } from "@/features/schedule/slot-picker";

// Real alternatives from the availability engine, starting on the day the
// customer asked for. Picking one and confirming approves the move to it.
export function ChooseTimeSheet({
  item,
  open,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  item: RescheduleItem;
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (startsAt: string) => void;
}) {
  const [choice, setChoice] = useState<{
    startsAt: string;
    label: string;
  } | null>(null);

  return (
    <Overlay
      open={open}
      onClose={() => {
        setChoice(null);
        onClose();
      }}
      dismissible={!busy}
      title={`Choose another time for ${item.customer.firstName}`}
      description={`${item.customer.firstName} asked for ${item.requested.short}.`}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!choice || busy}
            onClick={() => choice && onConfirm(choice.startsAt)}
          >
            {busy ? (
              <>
                <Spinner />
                Approving…
              </>
            ) : choice ? (
              `Approve ${choice.label}`
            ) : (
              "Choose a time"
            )}
          </Button>
        </>
      }
    >
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md bg-alert/5 px-3 py-2.5 text-ui text-alert"
        >
          {error}
        </p>
      )}
      {open && (
        <SlotPicker
          name={`choose-${item.id}`}
          label={`Free times for ${item.customer.firstName}`}
          query={{
            from: item.requested.date,
            days: 7,
            bookingId: item.bookingId,
          }}
          value={choice?.startsAt ?? null}
          onChange={(startsAt, label) => setChoice({ startsAt, label })}
          proposed={
            item.proposal?.stillFree ? item.proposal.startsAt : undefined
          }
          highlight={{
            date: item.requested.date,
            after: item.requested.earliestTime,
            note: `Matches what ${item.customer.firstName} asked for`,
          }}
          emptyMessage="Nothing free in the week from the day they asked for. Decline, or handle it yourself."
        />
      )}
    </Overlay>
  );
}
