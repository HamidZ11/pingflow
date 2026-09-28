"use client";

import { useId } from "react";
import {
  FLEXIBLE_BOOKABLE_DAY,
  type ScheduleMode,
} from "@/domain/availability/engine";
import { cx } from "@/lib/cx";

const options: { value: ScheduleMode; title: string; description: string }[] = [
  {
    value: "regular",
    title: "Regular hours",
    description: "The same pattern each week",
  },
  {
    value: "flexible",
    title: "Flexible hours",
    description: "My availability changes from week to week",
  },
];

// Regular or flexible hours: a native radio group, so arrow keys move
// between the two and the choice is announced. Kept compact: it sits above
// the weekly hours rather than replacing the page.
export function ScheduleModeChoice({
  value,
  onChange,
}: {
  value: ScheduleMode;
  onChange: (mode: ScheduleMode) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="text-ui font-medium text-ink">
        How do you usually work?
      </legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <label key={option.value} className="relative">
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="radio-chip peer sr-only"
              />
              <span
                className={cx(
                  "flex h-full cursor-pointer items-start gap-3 rounded-md border bg-surface px-3.5 py-3 transition-[border-color,box-shadow] duration-150",
                  selected
                    ? "border-ink ring-1 ring-ink"
                    : "border-line hover:border-line-strong",
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    "mt-0.5 size-4 shrink-0 rounded-full border bg-surface",
                    selected ? "border-[5px] border-ink" : "border-line-strong",
                  )}
                />
                <span>
                  <span className="block text-ui font-medium text-ink">
                    {option.title}
                  </span>
                  <span className="block text-ui-sm text-ink-3">
                    {option.description}
                  </span>
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** What flexible hours means, shown in place of the weekly hours. */
export function FlexibleHoursNote({ keepsRegular = false }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-4">
      <p className="text-ui text-ink">
        Pingflow will treat time as available unless you have a booking or block
        it.
      </p>
      <p className="mt-1 text-ui-sm text-ink-3">
        It only offers times between {FLEXIBLE_BOOKABLE_DAY.start} and{" "}
        {FLEXIBLE_BOOKABLE_DAY.end}.
        {keepsRegular &&
          " Your regular hours are kept, in case you switch back."}
      </p>
    </div>
  );
}
