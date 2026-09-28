import { ActivityLog } from "@/components/how-it-works/activity-log";
import { ApprovalThread } from "@/components/how-it-works/approval-thread";
import { DaySchedule } from "@/components/how-it-works/day-schedule";
import { MessageUnderstood } from "@/components/how-it-works/message-understood";
import {
  StorySpine,
  type StoryStep,
} from "@/components/how-it-works/story-spine";
import { cx } from "@/lib/cx";
import { howItWorksId } from "@/lib/links";

// The homepage's proof: the same Sarah example and product UI as
// /how-it-works, with lighter copy so the product carries the story.
const steps: StoryStep[] = [
  {
    id: "message",
    kicker: "14:12 · Message arrives",
    title: "Sarah asks to move her lesson.",
    body: (
      <p>
        She messages your WhatsApp as usual. Pingflow works out what she wants.
      </p>
    ),
    visual: <MessageUnderstood />,
    visualLabel:
      "Sarah’s WhatsApp message, and what Pingflow understood from it.",
  },
  {
    id: "schedule",
    kicker: "14:12 · Schedule checked",
    title: "Pingflow checks your schedule.",
    body: <p>Friday 17:00 is the first free hour after 16:00.</p>,
    visual: <DaySchedule />,
    visualLabel:
      "Friday in Pingflow’s schedule: Omar Ali 15:30 to 16:30, travel time, 17:00 to 18:00 free for Sarah, Priya Shah 18:00 to 19:00.",
  },
  {
    id: "approval",
    kicker: "14:12 → 14:15 · Waits for you",
    title: "Important changes wait for you.",
    body: <p>Pingflow asks in your WhatsApp. One tap to approve.</p>,
    visual: <ApprovalThread />,
    visualLabel:
      "Pingflow’s approval request in the instructor’s WhatsApp, answered with Approve at 14:15.",
  },
  {
    id: "done",
    kicker: "14:15 · Done",
    title: "You approve. Pingflow handles the rest.",
    body: (
      <p>
        The lesson moves, your schedule updates, Sarah is confirmed and her
        reminder is set.
      </p>
    ),
    visual: <ActivityLog />,
    visualLabel: "Activity for Sarah Khan after the change was approved.",
  },
];

// Straight on from the hero: one short line, then the product doing it.
// "See how it works" in the hero scrolls here.
export function HomeStory({ className }: { className?: string }) {
  return (
    <section
      id={howItWorksId}
      tabIndex={-1}
      aria-labelledby="story-title"
      className={cx("scroll-mt-6", className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1">
        <h2 id="story-title" className="text-lead font-medium text-ink">
          Here’s what happens when a customer messages you.
        </h2>
        <p className="text-ui-sm text-ink-3">
          Product example · Driving instructor
        </p>
      </div>
      <div className="mt-6 sm:mt-8 lg:mt-12">
        <StorySpine steps={steps} alternate />
      </div>
    </section>
  );
}
