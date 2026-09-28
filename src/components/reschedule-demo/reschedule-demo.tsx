import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { howItWorksId } from "@/lib/links";
import { CustomerThread } from "./customer-thread";
import { OwnerApproval } from "./owner-approval";
import { PingflowPanel } from "./pingflow-panel";

function Step({
  index,
  label,
  leadsOn = false,
  children,
}: {
  index: number;
  label: string;
  leadsOn?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-col">
      <p className="flex items-center gap-2 px-1 pb-2.5 text-ui-sm font-medium text-ink-2">
        <span
          aria-hidden
          className="grid size-5 place-items-center rounded-full border border-line-strong text-label text-ink-3 tabular-nums"
        >
          {index}
        </span>
        {label}
        {leadsOn && (
          <ArrowRight
            aria-hidden
            className="ml-auto hidden size-4 text-ink-3 xl:block"
          />
        )}
      </p>
      {children}
    </li>
  );
}

// Static first pass of the hero workflow: message → understood → checked →
// approval. The motion pass will connect these states.
export function RescheduleDemo({ className }: { className?: string }) {
  return (
    <figure
      id={howItWorksId}
      tabIndex={-1}
      className={cx(
        "scroll-mt-6 rounded-xl border border-line bg-sunken p-2.5 sm:p-4 lg:p-5",
        className,
      )}
    >
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5 px-1.5 pt-1 pb-4">
        <span className="text-ui font-medium text-ink">
          A learner asks to move a lesson
        </span>
        <span className="text-ui-sm text-ink-3">
          Product example · Driving instructor
        </span>
      </figcaption>
      <ol className="grid gap-5 xl:grid-cols-[1fr_1.5fr_1fr] xl:gap-4">
        <Step index={1} label="Sarah messages you" leadsOn>
          <CustomerThread />
        </Step>
        <Step index={2} label="Pingflow works it out" leadsOn>
          <PingflowPanel />
        </Step>
        <Step index={3} label="You approve in WhatsApp">
          <OwnerApproval />
        </Step>
      </ol>
    </figure>
  );
}
