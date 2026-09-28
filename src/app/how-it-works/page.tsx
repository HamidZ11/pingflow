import { ArrowDown } from "lucide-react";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/button-link";
import { ActivityLog } from "@/components/how-it-works/activity-log";
import { ApprovalThread } from "@/components/how-it-works/approval-thread";
import { DaySchedule } from "@/components/how-it-works/day-schedule";
import { MessageUnderstood } from "@/components/how-it-works/message-understood";
import { OwnerCommands } from "@/components/how-it-works/owner-commands";
import {
  StorySpine,
  type StoryStep,
} from "@/components/how-it-works/story-spine";
import { WeekAgenda } from "@/components/how-it-works/week-agenda";
import { PageIntro } from "@/components/page-intro";
import { ProgressRail } from "@/components/progress-rail";
import { SiteFooter } from "@/components/site-footer";
import { StartBand } from "@/components/start-band";
import { cx } from "@/lib/cx";
import { containerClassName } from "@/lib/layout";
import { pricingHref, startFreeHref } from "@/lib/links";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "What happens when a customer messages your business: Pingflow works out what they need, checks your schedule, and handles the routine work or asks you first.",
};

const exampleId = "example";

// The canonical example, start to finish (scenario.ts holds the facts).
const story: StoryStep[] = [
  {
    id: "message",
    kicker: "14:12 · Message arrives",
    title: "Sarah asks to move her lesson",
    body: (
      <p>
        She messages your WhatsApp Business number, as she always has. Pingflow
        recognises her number, reads the message and works out what she’s asking
        for.
      </p>
    ),
    visual: <MessageUnderstood />,
    visualLabel:
      "Sarah’s WhatsApp message, and what Pingflow understood from it.",
  },
  {
    id: "schedule",
    kicker: "14:12 · Schedule checked",
    title: "Pingflow checks your schedule",
    body: (
      <p>
        It finds Sarah’s Tuesday lesson, then looks at Friday in your built-in
        schedule for the first free hour after 16:00, allowing for your other
        lessons and travel time.
      </p>
    ),
    visual: <DaySchedule />,
    visualLabel:
      "Friday in Pingflow’s schedule: Omar Ali 15:30 to 16:30, travel time, 17:00 to 18:00 free for Sarah, Priya Shah 18:00 to 19:00.",
  },
  {
    id: "approval",
    kicker: "14:12 → 14:15 · Waits for you",
    title: "Important changes wait for you",
    body: (
      <>
        <p>
          Moving a lesson matters, so Pingflow asks first, in your WhatsApp. You
          answer between lessons with one tap.
        </p>
        <p className="mt-5 border-l-2 border-ink pl-4 text-ui text-ink-2">
          Routine admin can happen automatically. Changes that matter still wait
          for you.
        </p>
      </>
    ),
    visual: <ApprovalThread />,
    visualLabel:
      "Pingflow’s approval request in the instructor’s WhatsApp, answered with Approve at 14:15.",
  },
  {
    id: "done",
    kicker: "14:15 · Done",
    title: "Pingflow does the rest",
    body: (
      <p>
        The lesson moves, your schedule updates, Sarah gets a confirmation and
        her reminder is booked in. Every step is recorded, so you can always see
        what happened.
      </p>
    ),
    visual: <ActivityLog />,
    visualLabel: "Activity for Sarah Khan after the change was approved.",
  },
];

const automatic = [
  "Reminders before each appointment",
  "Confirmations once a booking is agreed",
  "Answers to “When is my booking?”",
  "Messages from your approved templates",
];

const needsYou = [
  "New bookings, changes and cancellations",
  "Requests Pingflow isn’t sure about",
  "Unusual questions",
  "Complaints and anything out of the ordinary",
];

function Rule({
  title,
  description,
  items,
  marker,
}: {
  title: string;
  description: string;
  items: string[];
  marker: string;
}) {
  return (
    <div>
      <h3 className="flex items-center gap-3 text-lead font-medium text-ink">
        <span
          aria-hidden
          className={cx("size-3 shrink-0 rounded-full border-[1.5px]", marker)}
        />
        {title}
      </h3>
      <p className="mt-1 pl-6 text-ui text-ink-3">{description}</p>
      <ul className="mt-5 divide-y divide-line border-y border-line">
        {items.map((item) => (
          <li key={item} className="py-3 text-body text-ink">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <>
      <main>
        {/* 1. Hero */}
        <section
          aria-labelledby="how-title"
          className={cx(containerClassName, "pt-8 sm:pt-10 lg:pt-12")}
        >
          <PageIntro
            eyebrow="How it works"
            titleId="how-title"
            title={
              <>
                <span className="block">A message comes in.</span>
                <span className="block">Pingflow takes it from there.</span>
              </>
            }
          >
            Customers keep messaging you normally. Pingflow works out what they
            need, checks your schedule, and either handles the routine work or
            asks before anything important changes.
          </PageIntro>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href={startFreeHref} size="lg">
              Start free
            </ButtonLink>
            <ButtonLink href={`#${exampleId}`} size="lg" variant="secondary">
              See the full example
              <ArrowDown aria-hidden className="size-4 text-ink-3" />
            </ButtonLink>
          </div>
        </section>

        {/* 2–5. The example, as one connected sequence. */}
        <section
          id={exampleId}
          aria-labelledby="example-title"
          className={cx(containerClassName, "scroll-mt-6 pt-20 lg:pt-28")}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-t border-line-strong pt-8">
            <h2
              id="example-title"
              className="text-headline font-semibold text-ink"
            >
              One message, start to finish
            </h2>
            <p className="text-ui text-ink-3">
              Product example · Sarah is a learner driver
            </p>
          </div>
          <div className="mt-12 lg:mt-16">
            <StorySpine steps={story} />
          </div>
        </section>

        {/* 6. What runs on its own, and what waits. */}
        <section
          aria-labelledby="automatic-title"
          className={cx(containerClassName, "pt-24 lg:pt-36")}
        >
          <div className="max-w-2xl">
            <h2
              id="automatic-title"
              className="text-headline font-semibold text-balance text-ink"
            >
              What Pingflow does on its own
            </h2>
            <p className="mt-4 text-lead text-pretty text-ink-2">
              Routine admin runs automatically, using wording you’ve approved.
              Anything that changes a booking, or that Pingflow isn’t sure
              about, waits for you.
            </p>
          </div>
          <div className="mt-10 grid gap-10 md:grid-cols-2 md:gap-12 lg:mt-14 lg:gap-16">
            <Rule
              title="Handled automatically"
              description="No action needed from you."
              items={automatic}
              marker="border-ink bg-accent"
            />
            <Rule
              title="Needs you"
              description="Pingflow asks first, in WhatsApp."
              items={needsYou}
              marker="border-ink bg-canvas"
            />
          </div>
        </section>

        {/* 7. The other direction: the owner asks Pingflow. */}
        <section
          aria-labelledby="commands-title"
          className="mt-24 border-y border-line bg-sunken lg:mt-36"
        >
          <div className={cx(containerClassName, "py-20 lg:py-28")}>
            <OwnerCommands
              intro={
                <>
                  <h2
                    id="commands-title"
                    className="text-headline font-semibold text-balance text-ink"
                  >
                    It works the other way too.
                  </h2>
                  <p className="mt-4 max-w-[30rem] text-lead text-pretty text-ink-2">
                    Message Pingflow like you’d message an assistant. It answers
                    from your schedule and makes the changes you ask for.
                  </p>
                </>
              }
            />
          </div>
        </section>

        {/* 8. The built-in schedule. */}
        <section
          aria-labelledby="schedule-title"
          className={cx(containerClassName, "py-24 lg:py-36")}
        >
          <div className="grid items-center gap-10 lg:grid-cols-[5fr_7fr] lg:gap-16">
            <div>
              <h2
                id="schedule-title"
                className="text-headline font-semibold text-balance text-ink"
              >
                You don’t need another calendar.
              </h2>
              <p className="mt-4 max-w-[30rem] text-lead text-pretty text-ink-2">
                Pingflow has its own simple schedule: your hours, lessons,
                buffers and time off, all in one place. Check it on the web, or
                just ask in WhatsApp.
              </p>
              <p className="mt-6 text-ui text-ink-3">
                Already use Google Calendar? Sync is planned for later.
              </p>
            </div>
            <figure>
              <figcaption className="sr-only">
                A week in Pingflow’s schedule, with Sarah’s lesson now on Friday
                at 17:00.
              </figcaption>
              <WeekAgenda />
            </figure>
          </div>
        </section>

        {/* 9. Setup, kept simple. */}
        <section
          aria-labelledby="setup-title"
          className={cx(containerClassName, "pb-24 lg:pb-32")}
        >
          <div className="border-t border-line-strong pt-10 lg:pt-14">
            <h2
              id="setup-title"
              className="text-headline font-semibold text-ink"
            >
              Getting started
            </h2>
            <ProgressRail
              className="mt-10 lg:mt-14"
              steps={[
                {
                  id: "connect",
                  content: (
                    <>
                      <p className="text-ui-sm text-ink-3 tabular-nums">01</p>
                      <p className="mt-2 text-lead font-medium text-ink">
                        Connect WhatsApp Business
                      </p>
                      <p className="mt-1 text-ui text-ink-2">
                        Your number stays the same, so customers keep messaging
                        it as usual.
                      </p>
                    </>
                  ),
                },
                {
                  id: "hours",
                  content: (
                    <>
                      <p className="text-ui-sm text-ink-3 tabular-nums">02</p>
                      <p className="mt-2 text-lead font-medium text-ink">
                        Tell Pingflow when you work
                      </p>
                      <p className="mt-1 text-ui text-ink-2">
                        Your hours, how long appointments last, the gap you need
                        between them, and when reminders go out.
                      </p>
                    </>
                  ),
                },
                {
                  id: "handle",
                  content: (
                    <>
                      <p className="text-ui-sm text-ink-3 tabular-nums">03</p>
                      <p className="mt-2 text-lead font-medium text-ink">
                        Start letting it handle the admin
                      </p>
                      <p className="mt-1 text-ui text-ink-2">
                        Routine replies and reminders run on their own. Anything
                        important comes to you first.
                      </p>
                    </>
                  ),
                },
              ]}
            />
          </div>
        </section>

        {/* 10. Close. */}
        <StartBand
          title={
            <>
              <span className="block">Keep using WhatsApp.</span>
              <span className="block">Stop doing the admin.</span>
            </>
          }
          secondary={{ href: pricingHref, label: "See pricing" }}
        />
      </main>
      <SiteFooter />
    </>
  );
}
