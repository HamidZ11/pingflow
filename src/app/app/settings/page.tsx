import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader, pageClassName } from "@/components/app/page-header";
import { Button } from "@/components/button-link";
import { defaultWeekHours, weekdays } from "@/domain/onboarding/setup";
import { formatLeadTime } from "@/domain/time/format";
import {
  loadAutomation,
  loadWorkingHours,
} from "@/features/schedule/engine-context";
import {
  BusinessForm,
  ScheduleForm,
  ServicesForm,
} from "@/features/settings/settings-forms";
import {
  loadOwnerNumber,
  OwnerCommandsCard,
} from "@/features/whatsapp/owner-commands";
import { loadWhatsAppSettings } from "@/features/whatsapp/settings-data";
import { WhatsAppSettingsCard } from "@/features/whatsapp/whatsapp-settings";
import { signOut } from "@/lib/auth/actions";
import { requireOwner } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Settings" };

const sections = [
  { id: "business", label: "Business" },
  { id: "services", label: "Services" },
  { id: "hours", label: "Working hours" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "reminders", label: "Reminders" },
  { id: "permissions", label: "Automation permissions" },
  { id: "account", label: "Account" },
];

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-6 border-t border-line pt-6"
    >
      <h2 id={`${id}-title`} className="text-body font-semibold text-ink">
        {title}
      </h2>
      {description && (
        <p className="mt-0.5 text-ui text-ink-3">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const owner = await requireOwner();
  const [business, services, hours, automation, whatsapp, ownerNumber] =
    await Promise.all([
      owner.supabase
        .from("businesses")
        .select("name, business_type, schedule_mode")
        .eq("id", owner.business.id)
        .single(),
      owner.supabase
        .from("services")
        // One query: each service with a count of its bookings still to come,
        // so a service that can't be removed says so up front.
        .select(
          "id, name, duration_minutes, buffer_minutes, upcoming:bookings(count)",
        )
        .eq("business_id", owner.business.id)
        .is("archived_at", null)
        .eq("upcoming.status", "confirmed")
        .gt("upcoming.ends_at", new Date().toISOString())
        .order("position"),
      loadWorkingHours(owner),
      loadAutomation(owner),
      loadWhatsAppSettings(owner),
      loadOwnerNumber(owner),
    ]);
  if (business.error) throw business.error;
  if (services.error) throw services.error;

  const week = defaultWeekHours();
  for (const { weekday } of weekdays)
    week[weekday] = { ...week[weekday], open: false };
  for (const rule of hours) {
    if (!week[rule.weekday].open)
      week[rule.weekday] = { open: true, start: rule.start, end: rule.end };
  }

  const automatic = [
    automation.reminders.enabled && "Reminders",
    automation.confirmationsEnabled && "Confirmations",
    automation.availabilityRepliesEnabled && "Availability replies",
    automation.bookingTimeRepliesEnabled && "“When is my booking?” replies",
    automation.cancellationAcknowledgementsEnabled &&
      "Cancellation acknowledgements",
  ].filter(Boolean) as string[];

  return (
    <div className={pageClassName("narrow")}>
      <PageHeader
        title="Settings"
        description="How your business works, in Pingflow."
      />
      <nav
        aria-label="Settings sections"
        className="-mx-1 mb-6 flex flex-wrap gap-1"
      >
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-sm px-2 py-1 text-ui-sm text-ink-2 hover:bg-sunken hover:text-ink"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className="space-y-10">
        <Section id="business" title="Business">
          <BusinessForm
            name={business.data.name ?? ""}
            businessType={business.data.business_type}
          />
        </Section>

        <Section
          id="services"
          title="Services"
          description="What customers book, how long it takes, and the time you need after."
        >
          <ServicesForm
            // Keyed to what's saved, so the form starts afresh after a save.
            key={services.data
              .map(
                (s) =>
                  `${s.id}:${s.name}:${s.duration_minutes}:${s.buffer_minutes}`,
              )
              .join("|")}
            businessType={business.data.business_type}
            initial={services.data.map((s) => {
              const upcoming = s.upcoming[0]?.count ?? 0;
              return {
                key: s.id,
                id: s.id,
                name: s.name,
                durationMinutes: s.duration_minutes,
                bufferMinutes: s.buffer_minutes,
                keepReason: upcoming
                  ? `Has ${upcoming} ${upcoming === 1 ? "booking" : "bookings"} coming up, so it can’t be removed yet.`
                  : undefined,
              };
            })}
          />
        </Section>

        <Section
          id="hours"
          title="Working hours"
          description="Pingflow uses this to decide which times it can offer."
        >
          <ScheduleForm
            key={business.data.schedule_mode}
            initialMode={business.data.schedule_mode}
            initialHours={week}
          />
        </Section>

        <Section id="whatsapp" title="WhatsApp">
          <WhatsAppSettingsCard
            settings={whatsapp}
            developerHint={process.env.NODE_ENV === "development"}
          />
          <OwnerCommandsCard
            number={ownerNumber}
            connected={
              whatsapp.state === "connected" ||
              whatsapp.state === "needs_attention"
            }
            developerHint={process.env.NODE_ENV === "development"}
          />
        </Section>

        <Section id="reminders" title="Reminders">
          <p className="text-ui text-ink">
            {automation.reminders.enabled
              ? `Reminders go out ${formatLeadTime(automation.reminders.leadMinutes)} each booking.`
              : "Reminders are off."}{" "}
            <Link
              href="/app/automations"
              className="text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink"
            >
              Change in Automations
            </Link>
          </p>
        </Section>

        <Section id="permissions" title="Automation permissions">
          <dl className="divide-y divide-line rounded-lg border border-line bg-surface text-ui">
            <div className="px-4 py-3">
              <dt className="text-ui-sm text-ink-3">Runs on its own</dt>
              <dd className="mt-0.5 text-ink">
                {automatic.length ? automatic.join(", ") : "Nothing"}
              </dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-ui-sm text-ink-3">Always asks you</dt>
              <dd className="mt-0.5 text-ink">
                New bookings, moves and cancellations
              </dd>
            </div>
          </dl>
          <Link
            href="/app/automations"
            className="mt-1 inline-flex h-10 items-center text-ui-sm text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink"
          >
            Manage automations
          </Link>
        </Section>

        <Section id="account" title="Account">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3.5">
            <div>
              <p className="text-ui-sm text-ink-3">Signed in as</p>
              <p className="text-ui font-medium break-all text-ink">
                {owner.email ?? "Unknown email"}
              </p>
            </div>
            <form action={signOut}>
              <Button type="submit" variant="secondary">
                Sign out
              </Button>
            </form>
          </div>
        </Section>
      </div>
    </div>
  );
}
