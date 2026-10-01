"use client";

import { Lock } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { selectClassName } from "@/components/app/fields";
import { Switch } from "@/components/app/switch";
import { useToast } from "@/components/app/toaster";
import { reminderLeadOptions } from "@/domain/reminders/policy";
import {
  type AutomationKey,
  setAutomation,
  setReminderLead,
} from "@/features/automations/actions";
import { cx } from "@/lib/cx";

export type AutomationState = Record<AutomationKey, boolean> & {
  reminderLeadMinutes: number;
};

const presets: { key: AutomationKey; title: string; description: string }[] = [
  {
    key: "reminders",
    title: "Booking reminders",
    description: "A short reminder to the customer before each booking.",
  },
  {
    key: "confirmations",
    title: "Booking confirmations",
    description:
      "Confirms a booking once it’s agreed, or a change once you approve it.",
  },
  {
    key: "availability",
    title: "Availability replies",
    description:
      "Answers “When are you free?” from customers Pingflow recognises, with free times from your schedule. It never books without you.",
  },
  {
    key: "bookingTime",
    title: "“When is my booking?” replies",
    description:
      "Tells a customer Pingflow recognises when their next booking is.",
  },
  {
    key: "cancellations",
    title: "Cancellation acknowledgement",
    description:
      "Lets a customer know their cancellation request has arrived and is with you.",
  },
];

// Opinionated presets, each simply on or off. Changes save straight away;
// if saving fails, the switch goes back and says why.
export function AutomationList({
  initial,
  whatsappConnected,
}: {
  initial: AutomationState;
  whatsappConnected: boolean;
}) {
  const toast = useToast();
  const [state, setOptimistic] = useOptimistic(
    initial,
    (current, patch: Partial<AutomationState>) => ({
      ...current,
      ...patch,
    }),
  );
  const [, startTransition] = useTransition();

  const toggle = (key: AutomationKey, enabled: boolean, title: string) =>
    startTransition(async () => {
      setOptimistic({ [key]: enabled });
      const result = await setAutomation(key, enabled);
      if (!result.ok)
        toast({
          message: `${title} wasn’t changed. ${result.error}`,
          tone: "error",
        });
    });

  return (
    <div className="space-y-6">
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {presets.map((preset) => {
          const on = state[preset.key];
          const descId = `automation-${preset.key}`;
          return (
            <li key={preset.key} className="px-4 py-4 sm:px-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-ui font-medium text-ink">
                    {preset.title}
                  </h2>
                  <p id={descId} className="mt-0.5 text-ui-sm text-ink-3">
                    {preset.description}
                  </p>
                </div>
                <Switch
                  checked={on}
                  onChange={(next) => toggle(preset.key, next, preset.title)}
                  label={preset.title}
                  describedBy={descId}
                />
              </div>
              {preset.key === "reminders" && (
                <div className="mt-3 flex items-center gap-3">
                  <label htmlFor="reminder-lead" className="text-ui text-ink-2">
                    When
                  </label>
                  <select
                    id="reminder-lead"
                    value={state.reminderLeadMinutes}
                    disabled={!on}
                    onChange={(e) => {
                      const minutes = Number(e.target.value);
                      startTransition(async () => {
                        setOptimistic({ reminderLeadMinutes: minutes });
                        const result = await setReminderLead(minutes);
                        if (!result.ok)
                          toast({ message: result.error, tone: "error" });
                      });
                    }}
                    className={cx(selectClassName, "w-44")}
                  >
                    {reminderLeadOptions.map((o) => (
                      <option key={o.minutes} value={o.minutes}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <AlwaysOn
        id="always-ask"
        title="Booking changes always ask you first"
        description="New bookings, moves and cancellations wait for your approval in Attention. This can’t be turned off."
      />
      <AlwaysOn
        id="one-question"
        title="Unclear messages get one question"
        description="If a message isn’t clear, Pingflow asks one short question. If the answer still isn’t clear, it tells the customer it’s been passed to you and leaves it in Attention."
      />

      <p className="text-ui-sm text-ink-3">
        {whatsappConnected
          ? "These go out on WhatsApp. Activity shows each one, and whether it was sent."
          : "WhatsApp isn’t connected yet, so nothing is sent to customers. Pingflow records what it would have sent in Activity."}
      </p>
    </div>
  );
}

function AlwaysOn({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex items-start justify-between gap-4 rounded-lg bg-sunken px-4 py-4 sm:px-5"
    >
      <div>
        <h2 id={id} className="text-ui font-medium text-ink">
          {title}
        </h2>
        <p className="mt-0.5 text-ui-sm text-ink-2">{description}</p>
      </div>
      <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm bg-surface px-2.5 text-ui-sm font-medium text-ink-2">
        <Lock aria-hidden className="size-3.5" />
        Always on
      </span>
    </section>
  );
}
