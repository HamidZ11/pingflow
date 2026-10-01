"use client";

import { useId, useState, useTransition } from "react";
import {
  DetailList,
  FieldError,
  inputClassName,
  Label,
  selectClassName,
} from "@/components/app/fields";
import { Overlay } from "@/components/app/overlay";
import { Spinner } from "@/components/app/spinner";
import { useToast } from "@/components/app/toaster";
import { Button } from "@/components/button-link";
import { halfHours } from "@/domain/onboarding/setup";
import { blockTime, removeBlock } from "@/features/schedule/actions";
import type { GridBlock } from "@/features/schedule/data";
import { cx } from "@/lib/cx";

// Blocked time: hours the owner isn't available (a car service, a day off).
// Pingflow never offers blocked time to anyone.

export function BlockTimeSheet({
  date,
  today,
  onClose,
}: {
  date: string | null;
  today: string;
  onClose: () => void;
}) {
  return (
    <Overlay
      open={date !== null}
      onClose={onClose}
      title="Block time"
      description="Pingflow won’t offer this time to anyone."
    >
      {date && (
        <BlockTimeForm key={date} date={date} today={today} onDone={onClose} />
      )}
    </Overlay>
  );
}

function BlockTimeForm({
  date: initialDate,
  today,
  onDone,
}: {
  date: string;
  today: string;
  onDone: () => void;
}) {
  const id = useId();
  const toast = useToast();
  const [date, setDate] = useState(initialDate);
  const [start, setStart] = useState("12:00");
  const [end, setEnd] = useState("13:00");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await blockTime({ date, start, end, label });
          if (result.ok) {
            toast({ message: result.message ?? "Blocked." });
            onDone();
          } else {
            setError(result.error);
          }
        });
      }}
      className="space-y-5"
    >
      <div>
        <Label htmlFor={`${id}-date`}>Day</Label>
        <input
          id={`${id}-date`}
          type="date"
          value={date}
          min={today}
          required
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className={cx(inputClassName, "mt-1.5 max-w-[12rem]")}
        />
      </div>
      <div className="flex items-end gap-3">
        <div>
          <Label htmlFor={`${id}-start`}>From</Label>
          <select
            id={`${id}-start`}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={cx(selectClassName, "mt-1.5 w-28")}
          >
            {halfHours.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`${id}-end`}>To</Label>
          <select
            id={`${id}-end`}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={cx(selectClassName, "mt-1.5 w-28")}
          >
            {halfHours.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <Label htmlFor={`${id}-label`}>
          What for? <span className="font-normal text-ink-3">(optional)</span>
        </Label>
        <input
          id={`${id}-label`}
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Car service"
          className={cx(inputClassName, "mt-1.5")}
        />
      </div>
      {error && <FieldError>{error}</FieldError>}
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" disabled={pending} onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Spinner /> Blocking…
            </>
          ) : (
            "Block time"
          )}
        </Button>
      </div>
    </form>
  );
}

export function BlockSheet({
  block,
  onClose,
}: {
  block: GridBlock | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Overlay
      open={block !== null}
      onClose={() => {
        setError(null);
        onClose();
      }}
      dismissible={!pending}
      title={block?.label ?? "Blocked time"}
      description="Blocked time"
    >
      {block && (
        <>
          <DetailList
            items={[{ label: "When", value: `${block.day}, ${block.time}` }]}
          />
          {error && <FieldError>{error}</FieldError>}
          {!block.past && (
            <Button
              variant="secondary"
              className="mt-6"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await removeBlock(block.id);
                  if (result.ok) {
                    toast({ message: result.message ?? "Removed." });
                    onClose();
                  } else {
                    setError(result.error);
                  }
                })
              }
            >
              {pending && <Spinner />}
              Free this time
            </Button>
          )}
        </>
      )}
    </Overlay>
  );
}
