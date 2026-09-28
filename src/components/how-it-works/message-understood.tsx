import type { ReactNode } from "react";
import { Bubble } from "@/components/reschedule-demo/chat";
import { scenario } from "@/components/reschedule-demo/scenario";

function Highlight({ children }: { children: ReactNode }) {
  return (
    <mark className="-mx-0.5 rounded-xs bg-accent box-decoration-clone px-0.5 text-ink">
      {children}
    </mark>
  );
}

// Values read from the highlighted parts of the message carry the same lime.
function Field({
  label,
  value,
  note,
  fromMessage = false,
}: {
  label: string;
  value: string;
  note?: string;
  fromMessage?: boolean;
}) {
  return (
    <div>
      <dt className="text-label text-night-text-3">{label}</dt>
      <dd className="mt-0.5 text-ui text-night-text">
        {fromMessage ? (
          <span className="underline decoration-accent decoration-[1.5px] underline-offset-[3px]">
            {value}
          </span>
        ) : (
          value
        )}
        {note && (
          <span className="mt-0.5 block text-label text-night-text-3">
            {note}
          </span>
        )}
      </dd>
    </div>
  );
}

// One object, two layers: the WhatsApp message as it arrives, and what
// Pingflow understood from it underneath.
export function MessageUnderstood() {
  const { customer, receivedAt, lesson } = scenario;

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-raised">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-sunken text-label font-semibold text-ink-2"
        >
          {customer.initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-ui font-medium text-ink">
            {customer.name}
          </p>
          <p className="truncate text-label text-ink-3">
            Learner · weekly lessons
          </p>
        </div>
        <span className="text-label text-ink-3">WhatsApp</span>
      </div>

      <div className="flex bg-chat px-4 py-6">
        <Bubble
          direction="in"
          sender={customer.firstName}
          time={receivedAt}
          className="max-w-[85%]"
        >
          <p>
            Can we move <Highlight>tomorrow’s lesson</Highlight> to{" "}
            <Highlight>Friday after 4</Highlight>?
          </p>
        </Bubble>
      </div>

      <div className="bg-night px-4 py-4 text-night-text sm:px-5">
        <p className="flex items-center justify-between gap-3 text-label">
          <span className="flex items-center gap-2 font-medium text-night-text-2">
            <span aria-hidden className="size-2 rounded-full bg-accent" />
            Pingflow understood
          </span>
          <time
            dateTime={receivedAt.dateTime}
            className="text-night-text-3 tabular-nums"
          >
            {receivedAt.label}
          </time>
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">
          <Field label="Request" value="Reschedule" />
          <Field
            label="Customer"
            value={customer.name}
            note="Recognised by her number"
          />
          <Field
            label="Current lesson"
            value={`${lesson.day}, ${lesson.start}`}
            fromMessage
          />
          <Field label="Wants" value="Friday, after 16:00" fromMessage />
        </dl>
      </div>
    </div>
  );
}
