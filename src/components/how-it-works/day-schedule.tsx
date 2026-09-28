import { Check } from "lucide-react";
import { scenario } from "@/components/reschedule-demo/scenario";
import { cx } from "@/lib/cx";

// Friday in Pingflow's own schedule, 14:00–19:00. Entries are positioned as
// fractions of the visible hours, so row height can change per breakpoint.
const firstHour = 14;
const hours = [14, 15, 16, 17, 18];

function clock(hour: number) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function place(from: number, to: number) {
  return {
    top: `calc(${((from - firstHour) / hours.length) * 100}% + 2px)`,
    height: `calc(${((to - from) / hours.length) * 100}% - 4px)`,
  };
}

export function DaySchedule() {
  const { customer, proposal } = scenario;

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-raised">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3">
        <div>
          <p className="text-ui font-medium text-ink">Friday 16 October</p>
          <p className="text-label text-ink-3">Your schedule</p>
        </div>
        <p className="rounded-sm bg-sunken px-2.5 py-1 text-ui-sm text-ink-2">
          Looking for: after 16:00 · 1 hour
        </p>
      </div>

      <div className="relative">
        {hours.map((hour) => (
          <div
            key={hour}
            aria-hidden
            className="h-12 border-t border-line first:border-t-0 sm:h-13"
          >
            <span className="block w-16 px-4 pt-1.5 text-ui-sm text-ink-3 tabular-nums">
              {clock(hour)}
            </span>
          </div>
        ))}

        <ul className="absolute inset-y-0 right-3 left-16">
          {scenario.friday.map((entry) => {
            const time = `${clock(entry.from)}–${clock(entry.to)}`;

            if (entry.kind === "buffer") {
              return (
                <li
                  key="buffer"
                  className="absolute inset-x-0 rounded-xs bg-[repeating-linear-gradient(135deg,var(--color-line-strong)_0_2px,transparent_2px_6px)]"
                  style={place(entry.from, entry.to)}
                >
                  <span className="sr-only">Travel time, {time}</span>
                </li>
              );
            }

            const proposed = entry.kind === "proposal";
            return (
              <li
                key={time}
                className={cx(
                  "absolute inset-x-0 flex items-center justify-between gap-3 rounded-sm px-3 text-ui-sm",
                  proposed
                    ? "bg-accent text-ink"
                    : "border border-line-strong bg-sunken text-ink",
                )}
                style={place(entry.from, entry.to)}
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">
                    {proposed ? "Free" : entry.name}
                  </span>{" "}
                  <span className={proposed ? "text-ink" : "text-ink-3"}>
                    · <span className="tabular-nums">{time}</span>
                  </span>
                </span>
                {proposed && (
                  <span className="shrink-0 font-medium">
                    For {customer.firstName}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="flex items-start gap-2.5 border-t border-line px-4 py-3 text-ui text-ink-2">
        <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-ink text-accent">
          <Check aria-hidden className="size-2.5" strokeWidth={3.5} />
        </span>
        <span>
          {proposal.weekday} {proposal.start} is the first free hour after
          16:00, allowing travel time.
        </span>
      </p>
    </div>
  );
}
