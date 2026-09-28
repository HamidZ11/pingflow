import { ArrowRight, CalendarDays, Check } from "lucide-react";
import type { ReactNode } from "react";
import { scenario } from "./scenario";

function Stage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-night-line pt-3.5">
      <p className="mb-3 flex items-center gap-2 text-label font-medium text-night-text-2">
        <span className="grid size-4 place-items-center rounded-full bg-accent text-night">
          <Check aria-hidden className="size-2.5" strokeWidth={3.5} />
        </span>
        {title}
      </p>
      {children}
    </div>
  );
}

// Values Pingflow read from the highlighted parts of the message.
function FromMessage({ children }: { children: ReactNode }) {
  return (
    <span className="underline decoration-accent decoration-[1.5px] underline-offset-[3px]">
      {children}
    </span>
  );
}

// Friday 15:00–19:00 as a small calendar column. Positions are fractions of
// the four visible hours so the rows can change height without re-maths.
const firstHour = 15;
const visibleHours = [15, 16, 17, 18];

function span(start: number, end: number) {
  const hours = visibleHours.length;
  return {
    top: `calc(${((start - firstHour) / hours) * 100}% + 2px)`,
    height: `calc(${((end - start) / hours) * 100}% - 4px)`,
  };
}

function FridayCalendar() {
  const { proposal } = scenario;

  return (
    <div className="overflow-hidden rounded-md border border-night-line">
      <div className="flex items-baseline justify-between gap-3 border-b border-night-line px-3 py-2 text-label">
        <span className="font-medium text-night-text">{proposal.day}</span>
        <span className="text-night-text-3">Your schedule</span>
      </div>
      <div className="relative">
        {visibleHours.map((hour) => (
          <div
            key={hour}
            aria-hidden
            className="h-8 border-t border-night-line/60 first:border-t-0"
          >
            <span className="block w-12 px-3 pt-1 text-label text-night-text-3 tabular-nums">
              {hour}:00
            </span>
          </div>
        ))}
        <ul className="absolute inset-y-0 right-2 left-12 text-label">
          <li
            className="absolute inset-x-0 flex items-center rounded-xs border border-night-line bg-night-2 px-2 text-night-text-2"
            style={span(15.5, 16.5)}
          >
            <span className="truncate">
              Lesson · Omar <span className="sr-only">15:30 to 16:30</span>
            </span>
          </li>
          <li
            className="absolute inset-x-0 rounded-xs bg-[repeating-linear-gradient(135deg,var(--color-night-line)_0_2px,transparent_2px_5px)]"
            style={span(16.5, 16.75)}
          >
            <span className="sr-only">Travel time, 16:30 to 16:45</span>
          </li>
          <li
            className="absolute inset-x-0 flex items-center justify-between gap-2 rounded-xs bg-accent px-2 font-medium text-night tabular-nums"
            style={span(17, 18)}
          >
            <span className="truncate">
              {proposal.start}–{proposal.end}
            </span>
            <span>Free</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

export function PingflowPanel() {
  const { customer, receivedAt, lesson } = scenario;

  return (
    <div className="@container flex flex-1 flex-col rounded-lg bg-night p-4 text-night-text sm:p-5">
      <div className="flex items-center justify-between gap-3 text-label">
        <p className="flex items-center gap-2 font-medium text-night-text-2">
          <span aria-hidden className="size-2 rounded-full bg-accent" />
          Pingflow
        </p>
        <time
          dateTime={receivedAt.dateTime}
          className="text-night-text-3 tabular-nums"
        >
          {receivedAt.label}
        </time>
      </div>
      <p className="mt-2 mb-4 text-body font-medium tracking-[-0.01em]">
        Reschedule request
      </p>

      {/* Wide enough: what was read and found on the left, the calendar
          check on the right. Narrow: one column in the same order. */}
      <div className="grid flex-1 content-start gap-4 @[24rem]:grid-cols-2 @[24rem]:gap-5">
        <div className="flex flex-col gap-4">
          <Stage title="Understood">
            <dl className="grid gap-2 text-ui-sm">
              <div>
                <dt className="text-label text-night-text-3">Customer</dt>
                <dd>{customer.name}</dd>
              </div>
              <div>
                <dt className="text-label text-night-text-3">Lesson</dt>
                <dd>
                  <FromMessage>Tomorrow</FromMessage>, {lesson.day}
                </dd>
              </div>
              <div>
                <dt className="text-label text-night-text-3">Move to</dt>
                <dd>
                  <FromMessage>Friday, after 16:00</FromMessage>
                </dd>
              </div>
            </dl>
          </Stage>

          <Stage title="Found">
            <div className="flex items-start gap-2.5 rounded-md bg-night-2 px-3 py-2.5">
              <CalendarDays
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-night-text-3"
              />
              <div className="min-w-0">
                <p className="text-ui-sm tabular-nums">
                  {lesson.day}, {lesson.start}–{lesson.end}
                </p>
                <p className="text-label text-night-text-3">
                  Weekly lesson · this week only
                </p>
              </div>
            </div>
          </Stage>
        </div>

        <Stage title="Checked">
          <FridayCalendar />
          <p className="mt-2.5 text-ui-sm text-night-text-2">
            First free hour after 16:00, allowing travel time.
          </p>
        </Stage>
      </div>

      <p className="mt-4 flex items-center gap-2 border-t border-night-line pt-3.5 text-ui-sm text-night-text">
        <ArrowRight aria-hidden className="size-4 text-accent" />
        Sent to you for approval
      </p>
    </div>
  );
}
