"use client";

import { useId, useState, useTransition } from "react";
import {
  FieldError,
  Hint,
  inputClassName,
  Label,
  selectClassName,
} from "@/components/app/fields";
import { Overlay } from "@/components/app/overlay";
import { Spinner } from "@/components/app/spinner";
import { useToast } from "@/components/app/toaster";
import { Button } from "@/components/button-link";
import type { Relationship } from "@/domain/contacts/phone";
import {
  createBooking,
  createCustomerAndBooking,
} from "@/features/schedule/actions";
import type { ScheduleData } from "@/features/schedule/data";
import { SlotPicker } from "@/features/schedule/slot-picker";
import { cx } from "@/lib/cx";

const NEW = "__new__";

export type AddBookingPreset = { date: string } | null;

// A one-off booking: who, what, and a time the engine says is free.
export function AddBookingSheet({
  preset,
  data,
  onClose,
}: {
  preset: AddBookingPreset;
  data: ScheduleData;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Overlay
      open={preset !== null}
      onClose={onClose}
      dismissible={!pending}
      title="Add a booking"
      description="Only free times are offered, allowing for travel time."
    >
      {preset && (
        <AddBookingForm
          key={preset.date}
          preset={preset}
          data={data}
          onPending={setPending}
          onDone={onClose}
        />
      )}
    </Overlay>
  );
}

function AddBookingForm({
  preset,
  data,
  onPending,
  onDone,
}: {
  preset: NonNullable<AddBookingPreset>;
  data: ScheduleData;
  onPending: (pending: boolean) => void;
  onDone: () => void;
}) {
  const id = useId();
  const toast = useToast();
  const [customerId, setCustomerId] = useState(data.customers[0]?.id ?? NEW);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [relationship, setRelationship] = useState<Relationship>("self");
  const [contactName, setContactName] = useState("");
  const [serviceId, setServiceId] = useState(data.services[0]?.id ?? "");
  const [date, setDate] = useState(preset.date);
  const [choice, setChoice] = useState<{
    startsAt: string;
    label: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slotsVersion, setSlotsVersion] = useState(0);
  const [pending, startTransition] = useTransition();
  const isNew = customerId === NEW;

  function submit() {
    setError(null);
    if (!choice) return setError("Choose a time.");
    if (isNew && !newName.trim()) return setError("Add the customer’s name.");
    onPending(true);
    startTransition(async () => {
      const result = isNew
        ? await createCustomerAndBooking({
            customer: {
              name: newName,
              phone: newPhone,
              relationship,
              contactName,
            },
            serviceId,
            startsAt: choice.startsAt,
          })
        : await createBooking({
            customerId,
            serviceId,
            startsAt: choice.startsAt,
          });
      onPending(false);
      if (result.ok) {
        toast({ message: result.message });
        onDone();
      } else {
        setError(result.error);
        // Nothing was saved. Keep what they typed; show fresh times.
        if (result.slotTaken) {
          setChoice(null);
          setSlotsVersion((v) => v + 1);
        }
      }
    });
  }

  if (data.services.length === 0) {
    return (
      <p className="text-ui text-ink-2">
        Add a service in Settings before adding bookings.
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-5"
    >
      <div>
        <Label htmlFor={`${id}-customer`}>Customer</Label>
        <select
          id={`${id}-customer`}
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className={cx(selectClassName, "mt-1.5")}
        >
          {data.customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={NEW}>New customer…</option>
        </select>
      </div>

      {isNew && (
        <fieldset className="space-y-4 rounded-md border border-line bg-canvas px-4 py-4">
          <legend className="sr-only">New customer</legend>
          <div>
            <Label htmlFor={`${id}-name`}>Name</Label>
            <input
              id={`${id}-name`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoComplete="off"
              className={cx(inputClassName, "mt-1.5")}
            />
          </div>
          <div>
            <Label htmlFor={`${id}-who`}>Who messages you?</Label>
            <select
              id={`${id}-who`}
              value={relationship}
              onChange={(e) => setRelationship(e.target.value as Relationship)}
              className={cx(selectClassName, "mt-1.5")}
            >
              <option value="self">They do</option>
              <option value="parent">A parent</option>
              <option value="guardian">A guardian</option>
              <option value="partner">A partner</option>
              <option value="other">Someone else</option>
            </select>
          </div>
          {relationship !== "self" && (
            <div>
              <Label htmlFor={`${id}-contact`}>Their name</Label>
              <input
                id={`${id}-contact`}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className={cx(inputClassName, "mt-1.5")}
              />
            </div>
          )}
          <div>
            <Label htmlFor={`${id}-phone`}>
              WhatsApp number{" "}
              <span className="font-normal text-ink-3">(optional)</span>
            </Label>
            <input
              id={`${id}-phone`}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="07700 900123"
              aria-describedby={`${id}-phone-hint`}
              className={cx(inputClassName, "mt-1.5")}
            />
            <Hint id={`${id}-phone-hint`}>
              How Pingflow will recognise their messages.
            </Hint>
          </div>
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${id}-service`}>Service</Label>
          <select
            id={`${id}-service`}
            value={serviceId}
            onChange={(e) => {
              setServiceId(e.target.value);
              setChoice(null);
            }}
            className={cx(selectClassName, "mt-1.5")}
          >
            {data.services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.length}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`${id}-date`}>Starting from</Label>
          <input
            id={`${id}-date`}
            type="date"
            value={date}
            min={data.today}
            onChange={(e) => {
              if (e.target.value) {
                setDate(e.target.value);
                setChoice(null);
              }
            }}
            className={cx(inputClassName, "mt-1.5")}
          />
        </div>
      </div>

      <div>
        <SlotPicker
          name={`${id}-time`}
          label="Time"
          query={{ from: date, days: 5, serviceId, version: slotsVersion }}
          value={choice?.startsAt ?? null}
          onChange={(startsAt, label) => setChoice({ startsAt, label })}
          emptyMessage="Nothing free for this service in these five days. Try a later date."
        />
      </div>

      <div role="alert">{error && <FieldError>{error}</FieldError>}</div>

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" disabled={pending} onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !choice}>
          {pending ? (
            <>
              <Spinner /> Adding…
            </>
          ) : choice ? (
            `Book ${choice.label}`
          ) : (
            "Choose a time"
          )}
        </Button>
      </div>
    </form>
  );
}
