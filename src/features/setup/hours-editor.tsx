"use client";

import { Switch } from "@/components/app/switch";
import { selectClassName } from "@/components/app/fields";
import { halfHours, type WeekHours, weekdays } from "@/domain/onboarding/setup";
import type { Weekday } from "@/domain/time/zoned";
import { cx } from "@/lib/cx";

// A week of opening hours: each day on or off, with a start and finish.
export function HoursEditor({
  hours,
  errors,
  onChange,
}: {
  hours: WeekHours;
  errors?: Partial<Record<Weekday, string>>;
  onChange: (hours: WeekHours) => void;
}) {
  const update = (weekday: Weekday, patch: Partial<WeekHours[Weekday]>) =>
    onChange({ ...hours, [weekday]: { ...hours[weekday], ...patch } });

  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
      {weekdays.map(({ weekday, label }) => {
        const day = hours[weekday];
        const error = errors?.[weekday];
        const id = `hours-${weekday}`;
        return (
          <li key={weekday} className="px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex w-36 items-center gap-1.5">
                <Switch
                  checked={day.open}
                  onChange={(open) => update(weekday, { open })}
                  label={`Work on ${label}`}
                  showState={false}
                />
                <span className="text-ui font-medium text-ink">{label}</span>
              </div>
              {day.open ? (
                <div className="flex items-center gap-2">
                  <select
                    aria-label={`${label} start`}
                    value={day.start}
                    onChange={(e) => update(weekday, { start: e.target.value })}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-error` : undefined}
                    className={cx(selectClassName, "w-26")}
                  >
                    {halfHours.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <span className="text-ui text-ink-3">to</span>
                  <select
                    aria-label={`${label} finish`}
                    value={day.end}
                    onChange={(e) => update(weekday, { end: e.target.value })}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-error` : undefined}
                    className={cx(selectClassName, "w-26")}
                  >
                    {halfHours.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="text-ui text-ink-3">Not working</span>
              )}
            </div>
            {error && (
              <p
                id={`${id}-error`}
                className="mt-1 text-ui-sm font-medium text-alert"
              >
                {error}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
