"use client";

import {
  ArrowLeft,
  Camera,
  Car,
  Check,
  Dog,
  Dumbbell,
  Ellipsis,
  GraduationCap,
  Lock,
  type LucideIcon,
  Scissors,
  SprayCan,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  inputClassName,
  Label,
  selectClassName,
} from "@/components/app/fields";
import { Spinner } from "@/components/app/spinner";
import { Switch } from "@/components/app/switch";
import { Button } from "@/components/button-link";
import { WhatsAppMark } from "@/components/whatsapp-mark";
import {
  type BusinessType,
  businessTypeLabel,
  businessTypes,
  emptyDraft,
  bufferHintFor,
  isStepValid,
  type SetupDraft,
  servicePlaceholderFor,
  servicesAfterChoosingType,
  validateHours,
  validateServices,
  weekdays,
} from "@/domain/onboarding/setup";
import { reminderLeadOptions } from "@/domain/reminders/policy";
import { completeOnboarding } from "@/features/onboarding/actions";
import { HoursEditor } from "@/features/setup/hours-editor";
import {
  FlexibleHoursNote,
  ScheduleModeChoice,
} from "@/features/setup/schedule-mode-choice";
import { ServicesEditor } from "@/features/setup/services-editor";
import { cx } from "@/lib/cx";

const icons: Record<BusinessType, LucideIcon> = {
  driving_instructor: Car,
  tutor: GraduationCap,
  personal_trainer: Dumbbell,
  cleaner: SprayCan,
  beauty: Scissors,
  dog_groomer: Dog,
  photographer: Camera,
  other: Ellipsis,
};

const steps = [
  {
    title: "What do you do?",
    intro:
      "Pingflow sets itself up around your work. You can change anything later.",
  },
  {
    title: "What do customers book?",
    intro:
      "Each service has a length, and the time you need afterwards before the next booking.",
  },
  {
    title: "When do you work?",
    intro: "Pingflow uses this to decide which times it can offer.",
  },
  {
    title: "How should Pingflow help?",
    intro:
      "Routine messages can go out on their own. Changes to bookings always wait for you.",
  },
  {
    title: "Connect WhatsApp",
    intro:
      "Pingflow works through your WhatsApp Business number, so customers keep messaging you as usual.",
  },
] as const;

type Keyed = SetupDraft["services"][number] & { key: string };

const withKeys = (services: SetupDraft["services"]): Keyed[] =>
  services.map((s) => ({ ...s, key: crypto.randomUUID() }));

export function OnboardingFlow() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [draft, setDraft] = useState<SetupDraft>(emptyDraft);
  const [services, setServices] = useState<Keyed[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Each step change moves focus to its heading, so screen reader and
  // keyboard users start at the top of the new question.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [step, done]);

  const current = { ...draft, services };
  const serviceCheck = validateServices(services);
  const hoursCheck = validateHours(draft.hours);

  // Suggestions follow the line of work until the owner changes them;
  // after that the list is theirs (see servicesAfterChoosingType).
  function chooseType(type: BusinessType) {
    const next = servicesAfterChoosingType(services, draft.businessType, type);
    if (next.replaced) setServices(withKeys(next.services));
    setDraft((d) => ({ ...d, businessType: type }));
  }

  function next() {
    const gate = (["type", "services", "hours"] as const)[step];
    if (gate && !isStepValid(gate, current)) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStep((s) => s + 1);
  }

  function finish() {
    setSubmitError(null);
    startTransition(async () => {
      const result = await completeOnboarding({
        ...draft,
        services: services.map(({ name, durationMinutes, bufferMinutes }) => ({
          name,
          durationMinutes,
          bufferMinutes,
        })),
      });
      if (result.ok) setDone(true);
      else setSubmitError(result.error);
    });
  }

  if (done) {
    const openDays = weekdays.filter((d) => draft.hours[d.weekday].open);
    return (
      <main className="px-5 pt-10 pb-24 sm:pt-16">
        <div className="mx-auto max-w-xl">
          <span
            aria-hidden
            className="grid size-11 place-items-center rounded-full bg-night text-accent"
          >
            <Check className="size-5" strokeWidth={2.5} />
          </span>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="mt-5 text-title font-semibold text-ink focus-visible:outline-none"
          >
            You’re ready.
          </h1>
          <p className="mt-2 text-body text-ink-2">
            When a customer needs something, Pingflow will bring it to
            Attention. Your schedule is ready for bookings now.
          </p>
          <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-surface text-ui">
            <li className="flex justify-between gap-4 px-4 py-3">
              <span className="text-ink-3">Business</span>
              <span className="text-right text-ink">
                {draft.name.trim() ||
                  businessTypeLabel(draft.businessType ?? "other")}
              </span>
            </li>
            <li className="flex justify-between gap-4 px-4 py-3">
              <span className="text-ink-3">Services</span>
              <span className="text-right text-ink">
                {services.map((s) => s.name.trim()).join(", ")}
              </span>
            </li>
            <li className="flex justify-between gap-4 px-4 py-3">
              <span className="text-ink-3">
                {draft.scheduleMode === "flexible" ? "Hours" : "Working days"}
              </span>
              <span className="text-right text-ink">
                {draft.scheduleMode === "flexible"
                  ? "Flexible"
                  : openDays.map((d) => d.short).join(", ")}
              </span>
            </li>
            <li className="flex justify-between gap-4 px-4 py-3">
              <span className="text-ink-3">WhatsApp</span>
              <span className="text-right text-ink">Not connected yet</span>
            </li>
          </ul>
          <Link
            href="/app"
            className="mt-8 inline-flex h-12 items-center rounded-md bg-ink px-5 text-body font-medium text-canvas transition-[background-color] duration-150 hover:bg-ink/85"
          >
            Go to Attention
          </Link>
        </div>
      </main>
    );
  }

  const { title, intro } = steps[step];
  const last = step === steps.length - 1;

  return (
    <main className="px-5 pt-6 pb-36 sm:pt-10">
      <div className="mx-auto max-w-2xl">
        <div>
          <p className="text-ui-sm text-ink-3 tabular-nums">
            Step {step + 1} of {steps.length}
          </p>
          <ol aria-hidden className="mt-2 grid grid-cols-5 gap-1.5">
            {steps.map((s, i) => (
              <li
                key={s.title}
                className={cx(
                  "h-1 rounded-full",
                  i < step && "bg-ink",
                  i === step && "bg-accent ring-1 ring-ink",
                  i > step && "bg-line",
                )}
              />
            ))}
          </ol>
        </div>

        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mt-8 text-title font-semibold text-ink focus-visible:outline-none"
        >
          {title}
        </h1>
        <p className="mt-2 max-w-xl text-body text-ink-2">{intro}</p>

        <div className="mt-8">
          {step === 0 && (
            <>
              <fieldset>
                <legend className="sr-only">Your line of work</legend>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {businessTypes.map((type) => {
                    const Icon = icons[type.value];
                    const selected = draft.businessType === type.value;
                    return (
                      <label key={type.value} className="relative">
                        <input
                          type="radio"
                          name="business-type"
                          value={type.value}
                          checked={selected}
                          onChange={() => chooseType(type.value)}
                          className="radio-chip peer sr-only"
                        />
                        <span
                          className={cx(
                            "flex h-26 cursor-pointer flex-col justify-between rounded-lg border bg-surface p-3.5 transition-[border-color,box-shadow] duration-150",
                            selected
                              ? "border-ink ring-1 ring-ink"
                              : "border-line hover:border-line-strong",
                          )}
                        >
                          <span className="flex items-start justify-between">
                            <Icon
                              aria-hidden
                              className="size-6 text-ink-2"
                              strokeWidth={1.6}
                            />
                            {selected && (
                              <span
                                aria-hidden
                                className="grid size-5 place-items-center rounded-full bg-ink text-accent"
                              >
                                <Check className="size-3" strokeWidth={3} />
                              </span>
                            )}
                          </span>
                          <span className="text-ui font-medium text-ink">
                            {type.label}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {showErrors && !draft.businessType && (
                <p role="alert" className="mt-3 text-ui font-medium text-alert">
                  Choose the closest match to continue.
                </p>
              )}
              <div className="mt-8 max-w-sm">
                <Label htmlFor="business-name">
                  Business name{" "}
                  <span className="font-normal text-ink-3">(optional)</span>
                </Label>
                <input
                  id="business-name"
                  value={draft.name}
                  maxLength={120}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, name: e.target.value }))
                  }
                  className={cx(inputClassName, "mt-1.5")}
                  autoComplete="organization"
                />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <ServicesEditor
                services={services}
                errors={showErrors ? serviceCheck.errors : undefined}
                onChange={setServices}
                placeholder={servicePlaceholderFor(draft.businessType)}
                hint={bufferHintFor(draft.businessType)}
              />
              {showErrors && serviceCheck.summary && (
                <p role="alert" className="mt-3 text-ui font-medium text-alert">
                  {serviceCheck.summary}
                </p>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <ScheduleModeChoice
                value={draft.scheduleMode}
                onChange={(scheduleMode) => {
                  setShowErrors(false);
                  setDraft((d) => ({ ...d, scheduleMode }));
                }}
              />
              <div className="mt-5">
                {draft.scheduleMode === "regular" ? (
                  <HoursEditor
                    hours={draft.hours}
                    errors={showErrors ? hoursCheck.errors : undefined}
                    onChange={(hours) => setDraft((d) => ({ ...d, hours }))}
                  />
                ) : (
                  <FlexibleHoursNote />
                )}
              </div>
              {showErrors &&
                draft.scheduleMode === "regular" &&
                hoursCheck.summary && (
                  <p
                    role="alert"
                    className="mt-3 text-ui font-medium text-alert"
                  >
                    {hoursCheck.summary}
                  </p>
                )}
            </>
          )}

          {step === 3 && (
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
              <li className="px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p
                      id="pref-reminders"
                      className="text-ui font-medium text-ink"
                    >
                      Send appointment reminders
                    </p>
                    <p
                      id="pref-reminders-hint"
                      className="mt-0.5 text-ui-sm text-ink-3"
                    >
                      A short message before each booking, from a template you
                      can see.
                    </p>
                  </div>
                  <Switch
                    checked={draft.remindersEnabled}
                    onChange={(on) =>
                      setDraft((d) => ({ ...d, remindersEnabled: on }))
                    }
                    label="Send appointment reminders"
                    describedBy="pref-reminders-hint"
                  />
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <label htmlFor="pref-lead" className="text-ui text-ink-2">
                    When
                  </label>
                  <select
                    id="pref-lead"
                    value={draft.reminderLeadMinutes}
                    disabled={!draft.remindersEnabled}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        reminderLeadMinutes: Number(e.target.value),
                      }))
                    }
                    className={cx(selectClassName, "w-44")}
                  >
                    {reminderLeadOptions.map((o) => (
                      <option key={o.minutes} value={o.minutes}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
              <li className="flex items-start justify-between gap-4 px-4 py-4">
                <div>
                  <p className="text-ui font-medium text-ink">
                    Answer “When are you free?” automatically
                  </p>
                  <p
                    id="pref-availability-hint"
                    className="mt-0.5 text-ui-sm text-ink-3"
                  >
                    Pingflow replies with free times from your schedule. It
                    never books without you.
                  </p>
                </div>
                <Switch
                  checked={draft.availabilityRepliesEnabled}
                  onChange={(on) =>
                    setDraft((d) => ({ ...d, availabilityRepliesEnabled: on }))
                  }
                  label="Answer availability questions automatically"
                  describedBy="pref-availability-hint"
                />
              </li>
              <li className="flex items-start justify-between gap-4 bg-canvas px-4 py-4">
                <div>
                  <p className="text-ui font-medium text-ink">
                    Always ask before moving or cancelling a booking
                  </p>
                  <p className="mt-0.5 text-ui-sm text-ink-2">
                    New bookings, moves and cancellations wait for your
                    approval. This can’t be turned off.
                  </p>
                </div>
                <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm bg-sunken px-2.5 text-ui-sm font-medium text-ink-2">
                  <Lock aria-hidden className="size-3.5" />
                  Always on
                </span>
              </li>
            </ul>
          )}

          {step === 4 && (
            <div className="rounded-lg border border-line bg-surface p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-md bg-sunken">
                  <WhatsAppMark className="size-5 text-whatsapp" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-ui font-medium text-ink">
                    WhatsApp Business
                  </p>
                  <p className="text-ui-sm text-ink-3">Your existing number</p>
                </div>
                <span className="rounded-sm bg-sunken px-2 py-1 text-label font-medium text-ink-2">
                  Coming next
                </span>
              </div>
              <p className="mt-4 text-ui text-ink-2">
                Connecting isn’t available yet. Until it is, Pingflow runs on
                your schedule here, and nothing is sent to customers.
              </p>
              <Button variant="secondary" className="mt-4" disabled>
                Connect WhatsApp Business
              </Button>
            </div>
          )}
        </div>

        {submitError && (
          <p
            role="alert"
            className="mt-6 rounded-md border border-alert/25 bg-alert/5 px-3.5 py-3 text-ui text-alert"
          >
            {submitError}
          </p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 py-3">
          {step > 0 ? (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setShowErrors(false);
                setStep((s) => s - 1);
              }}
            >
              <ArrowLeft aria-hidden className="size-4" />
              Back
            </Button>
          ) : (
            <span />
          )}
          {last ? (
            <Button size="lg" disabled={pending} onClick={finish}>
              {pending ? (
                <>
                  <Spinner />
                  Setting up…
                </>
              ) : (
                "Skip for now"
              )}
            </Button>
          ) : (
            <Button size="lg" onClick={next}>
              Continue
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
