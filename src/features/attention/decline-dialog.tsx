"use client";

import { Overlay } from "@/components/app/overlay";
import { Spinner } from "@/components/app/spinner";
import { Button } from "@/components/button-link";
import type { RescheduleItem } from "@/features/attention/data";

// Declining messages the customer, so the reply is shown before it goes.
export function DeclineDialog({
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
  onConfirm: () => void;
}) {
  return (
    <Overlay
      open={open}
      onClose={onClose}
      dismissible={!busy}
      variant="dialog"
      title={`Decline ${item.customer.firstName}’s request?`}
      description={`The booking stays on ${item.current.day}, ${item.current.time}.`}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Keep request
          </Button>
          <Button disabled={busy} onClick={onConfirm}>
            {busy ? (
              <>
                <Spinner />
                Declining…
              </>
            ) : (
              "Decline and reply"
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
      <p className="text-ui text-ink-2">Pingflow will reply:</p>
      <div className="mt-2 flex justify-end rounded-md bg-chat p-3">
        {/* A draft, so no timestamp or delivery ticks. */}
        <p className="max-w-[92%] rounded-md rounded-tr-xs bg-bubble-out px-3 py-2 text-ui text-ink">
          {item.declineReply}
        </p>
      </div>
      <p className="mt-3 text-ui-sm text-ink-3">
        WhatsApp isn’t connected yet, so this is recorded but not sent.
      </p>
    </Overlay>
  );
}
