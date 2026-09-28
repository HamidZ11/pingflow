"use client";

import { useId, useState, type ComponentProps, type FormEvent } from "react";
import { Button } from "@/components/button-link";
import { cx } from "@/lib/cx";

const fieldClassName =
  "w-full rounded-md border border-line-strong bg-surface px-3.5 text-body text-ink transition-[border-color] duration-150 placeholder:text-ink-3 hover:border-ink-3 focus-visible:border-ink focus-visible:-outline-offset-1 user-invalid:border-alert";

type FieldProps = {
  label: string;
  hint?: string;
  optional?: boolean;
  className?: string;
};

function FieldLabel({
  id,
  hintId,
  label,
  hint,
  optional,
}: Pick<FieldProps, "label" | "hint" | "optional"> & {
  id: string;
  hintId?: string;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-ui font-medium text-ink">
          {label}
        </label>
        {optional && <span className="text-ui-sm text-ink-3">Optional</span>}
      </div>
      {hint && (
        <p id={hintId} className="mt-1 text-ui-sm text-ink-3">
          {hint}
        </p>
      )}
    </>
  );
}

function TextField({
  label,
  hint,
  optional,
  className,
  ...input
}: FieldProps & ComponentProps<"input">) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className={className}>
      <FieldLabel
        id={id}
        hintId={hintId}
        label={label}
        hint={hint}
        optional={optional}
      />
      <input
        id={id}
        aria-describedby={hintId}
        required={!optional}
        className={cx(fieldClassName, "mt-2 h-12")}
        {...input}
      />
    </div>
  );
}

function TextareaField({
  label,
  hint,
  optional,
  className,
  ...textarea
}: FieldProps & ComponentProps<"textarea">) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className={className}>
      <FieldLabel
        id={id}
        hintId={hintId}
        label={label}
        hint={hint}
        optional={optional}
      />
      <textarea
        id={id}
        aria-describedby={hintId}
        required={!optional}
        className={cx(fieldClassName, "mt-2 resize-y py-3 leading-normal")}
        {...textarea}
      />
    </div>
  );
}

export function ContactForm({ className }: { className?: string }) {
  const [status, setStatus] = useState<string | null>(null);

  // There is no backend yet. Nothing is sent, and the form says so rather
  // than pretending it worked.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Sending isn’t connected yet, so nothing was sent.");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cx("flex flex-col gap-6", className)}
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <TextField label="Name" name="name" autoComplete="name" />
        <TextField
          label="Work email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
        />
      </div>
      <TextField
        label="Business"
        name="business"
        hint="What you do, e.g. driving instructor."
        autoComplete="organization"
        optional
      />
      <TextareaField label="What can we help with?" name="message" rows={6} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" className="w-full sm:w-auto">
          Send message
        </Button>
        <p role="status" className="text-ui-sm text-ink-2">
          {status}
        </p>
      </div>
    </form>
  );
}
