"use client";

import { useState, useTransition } from "react";
import {
  FieldError,
  inputClassName,
  Label,
  selectClassName,
} from "@/components/app/fields";
import { Spinner } from "@/components/app/spinner";
import { useToast } from "@/components/app/toaster";
import { Button } from "@/components/button-link";
import type { ScheduleMode } from "@/domain/availability/engine";
import {
  bufferHintFor,
  businessTypes,
  type ServiceDraft,
  servicePlaceholderFor,
  validateHours,
  validateServices,
  type WeekHours,
} from "@/domain/onboarding/setup";
import {
  saveSchedule,
  saveServices,
  updateBusiness,
} from "@/features/settings/actions";
import { HoursEditor } from "@/features/setup/hours-editor";
import {
  FlexibleHoursNote,
  ScheduleModeChoice,
} from "@/features/setup/schedule-mode-choice";
import { ServicesEditor } from "@/features/setup/services-editor";
import type { ActionResult } from "@/lib/errors";
import { cx } from "@/lib/cx";

function useSave() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const save = (run: () => Promise<ActionResult>, onSaved?: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await run();
      if (result.ok) {
        toast({ message: result.message ?? "Saved." });
        onSaved?.();
      } else {
        setError(result.error);
      }
    });
  };
  return { error, pending, save };
}

function SaveRow({
  pending,
  dirty,
  error,
  label = "Save",
}: {
  pending: boolean;
  dirty: boolean;
  error: string | null;
  label?: string;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending || !dirty}>
        {pending && <Spinner />}
        {label}
      </Button>
      {!dirty && !error && (
        <span className="text-ui-sm text-ink-3">No changes</span>
      )}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

export function BusinessForm({
  name: initialName,
  businessType: initialType,
}: {
  name: string;
  businessType: string;
}) {
  const [name, setName] = useState(initialName);
  const [type, setType] = useState(initialType);
  const [saved, setSaved] = useState({ name: initialName, type: initialType });
  const { error, pending, save } = useSave();
  const dirty = name !== saved.name || type !== saved.type;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(
          () => updateBusiness({ name, businessType: type }),
          () => setSaved({ name, type }),
        );
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="business-name">Business name</Label>
          <input
            id="business-name"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            className={cx(inputClassName, "mt-1.5")}
          />
        </div>
        <div>
          <Label htmlFor="business-type">What you do</Label>
          <select
            id="business-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={cx(selectClassName, "mt-1.5")}
          >
            {businessTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <SaveRow pending={pending} dirty={dirty} error={error} />
    </form>
  );
}

type KeyedService = ServiceDraft & {
  key: string;
  id?: string;
  keepReason?: string;
};

export function ServicesForm({
  initial,
  businessType,
}: {
  initial: KeyedService[];
  businessType: string;
}) {
  const [services, setServices] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [showErrors, setShowErrors] = useState(false);
  const { error, pending, save } = useSave();
  const check = validateServices(services);
  const dirty = JSON.stringify(services) !== saved;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (check.summary || check.errors.some((x) => x.name)) {
          setShowErrors(true);
          return;
        }
        save(
          () =>
            saveServices(
              services.map(({ id, name, durationMinutes, bufferMinutes }) => ({
                id,
                name,
                durationMinutes,
                bufferMinutes,
              })),
            ),
          // The page reloads with the saved list (new services get their
          // IDs), and this form is keyed to it, so it starts afresh.
          () => setSaved(JSON.stringify(services)),
        );
      }}
    >
      <ServicesEditor
        services={services}
        errors={showErrors ? check.errors : undefined}
        onChange={setServices}
        placeholder={servicePlaceholderFor(businessType)}
        hint={bufferHintFor(businessType)}
        addLabel="Add a service"
      />
      <p className="mt-2 px-3 text-ui-sm text-ink-3">
        Changes apply to new bookings. Existing bookings keep their length.
      </p>
      <SaveRow
        pending={pending}
        dirty={dirty}
        error={error ?? (showErrors ? (check.summary ?? null) : null)}
        label="Save changes"
      />
    </form>
  );
}

export function ScheduleForm({
  initialMode,
  initialHours,
}: {
  initialMode: ScheduleMode;
  initialHours: WeekHours;
}) {
  const [mode, setMode] = useState(initialMode);
  const [hours, setHours] = useState(initialHours);
  const [saved, setSaved] = useState(
    JSON.stringify({ mode: initialMode, hours: initialHours }),
  );
  const { error, pending, save } = useSave();
  const check = validateHours(hours);
  const dirty = JSON.stringify({ mode, hours }) !== saved;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(
          () => saveSchedule({ mode, hours }),
          () => setSaved(JSON.stringify({ mode, hours })),
        );
      }}
    >
      <ScheduleModeChoice value={mode} onChange={setMode} />
      <div className="mt-4">
        {mode === "regular" ? (
          <HoursEditor
            hours={hours}
            errors={check.errors}
            onChange={setHours}
          />
        ) : (
          <FlexibleHoursNote keepsRegular />
        )}
      </div>
      <SaveRow
        pending={pending}
        dirty={dirty}
        error={error ?? (mode === "regular" ? (check.summary ?? null) : null)}
        label="Save changes"
      />
    </form>
  );
}
