"use client";

import { cx } from "@/lib/cx";

// An on/off control (role="switch"). The whole 44px-high hit area responds,
// and the state is also written out for anyone not reading the track.
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  describedBy,
  id,
  showState = true,
}: {
  checked: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  /** Accessible name, when there is no visible <label for>. */
  label?: string;
  describedBy?: string;
  id?: string;
  /** Write "On"/"Off" beside the track. */
  showState?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className="group -my-1.5 inline-flex h-11 shrink-0 items-center gap-2.5 rounded-md px-1 disabled:cursor-not-allowed"
    >
      <span
        aria-hidden
        className={cx(
          "relative h-6 w-10 rounded-full border transition-[background-color,border-color] duration-150",
          checked ? "border-ink bg-ink" : "border-line-strong bg-sunken",
          disabled && "opacity-60",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 left-0.5 size-[1.125rem] rounded-full transition-[translate,background-color] duration-150 motion-reduce:transition-none",
            checked ? "translate-x-4 bg-accent" : "bg-surface shadow-raised",
          )}
        />
      </span>
      {showState && (
        <span
          aria-hidden
          className="w-7 text-left text-ui-sm text-ink-2 tabular-nums"
        >
          {checked ? "On" : "Off"}
        </span>
      )}
    </button>
  );
}
