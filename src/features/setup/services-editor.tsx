"use client";

import { Plus, Trash2 } from "lucide-react";
import { useId } from "react";
import {
  FieldError,
  inputClassName,
  selectClassName,
} from "@/components/app/fields";
import {
  bufferOptions,
  durationOptions,
  type ServiceDraft,
  type ServiceErrors,
} from "@/domain/onboarding/setup";
import { formatDuration } from "@/domain/time/format";
import { cx } from "@/lib/cx";

type EditableService = ServiceDraft & {
  key: string;
  /** Why this service can't be removed right now (e.g. upcoming bookings). */
  keepReason?: string;
};

// The services a business offers: name, length, and travel/setup time after.
// Controlled, so onboarding and Settings can both use it. Example wording
// comes from the business type (see domain/onboarding/business-types).
export function ServicesEditor<T extends EditableService>({
  services,
  errors,
  onChange,
  placeholder,
  hint,
  addLabel = "Add another service",
}: {
  services: T[];
  errors?: ServiceErrors;
  onChange: (services: T[]) => void;
  placeholder: string;
  hint: string;
  addLabel?: string;
}) {
  const baseId = useId();

  const update = (index: number, patch: Partial<ServiceDraft>) =>
    onChange(services.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  return (
    <div>
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {services.map((service, index) => {
          const id = `${baseId}-${index}`;
          const error = errors?.[index]?.name;
          return (
            <li key={service.key} className="px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_8.5rem_8.5rem_auto] sm:items-end">
                <div>
                  <label
                    htmlFor={`${id}-name`}
                    className="text-ui-sm text-ink-3"
                  >
                    Service
                  </label>
                  <input
                    id={`${id}-name`}
                    value={service.name}
                    onChange={(e) => update(index, { name: e.target.value })}
                    maxLength={80}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-error` : undefined}
                    placeholder={placeholder}
                    className={cx(inputClassName, "mt-1")}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:contents">
                  <div>
                    <label
                      htmlFor={`${id}-duration`}
                      className="text-ui-sm text-ink-3"
                    >
                      Length
                    </label>
                    <select
                      id={`${id}-duration`}
                      value={service.durationMinutes}
                      onChange={(e) =>
                        update(index, {
                          durationMinutes: Number(e.target.value),
                        })
                      }
                      className={cx(selectClassName, "mt-1")}
                    >
                      {durationOptions.map((m) => (
                        <option key={m} value={m}>
                          {formatDuration(m)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor={`${id}-buffer`}
                      className="text-ui-sm text-ink-3"
                    >
                      Time after
                    </label>
                    <select
                      id={`${id}-buffer`}
                      value={service.bufferMinutes}
                      onChange={(e) =>
                        update(index, { bufferMinutes: Number(e.target.value) })
                      }
                      className={cx(selectClassName, "mt-1")}
                    >
                      {bufferOptions.map((m) => (
                        <option key={m} value={m}>
                          {m === 0 ? "None" : formatDuration(m)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onChange(services.filter((_, i) => i !== index))
                  }
                  disabled={
                    services.length === 1 || Boolean(service.keepReason)
                  }
                  aria-label={`Remove ${service.name.trim() || "this service"}`}
                  aria-describedby={
                    service.keepReason ? `${id}-keep` : undefined
                  }
                  className="grid size-11 place-items-center justify-self-end rounded-md text-ink-2 transition-[background-color,color] duration-150 hover:bg-sunken hover:text-ink disabled:opacity-40 md:size-10"
                >
                  <Trash2 aria-hidden className="size-4.5" />
                </button>
              </div>
              {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
              {service.keepReason && (
                <p id={`${id}-keep`} className="mt-1.5 text-ui-sm text-ink-3">
                  {service.keepReason}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() =>
          onChange([
            ...services,
            {
              key: crypto.randomUUID(),
              name: "",
              durationMinutes: 60,
              bufferMinutes: 0,
            } as T,
          ])
        }
        disabled={services.length >= 20}
        className="mt-3 inline-flex h-10 items-center gap-2 rounded-md px-3 text-ui font-medium text-ink transition-[background-color] duration-150 hover:bg-sunken"
      >
        <Plus aria-hidden className="size-4" />
        {addLabel}
      </button>
      <p className="mt-1 px-3 text-ui-sm text-ink-3">{hint}</p>
    </div>
  );
}
