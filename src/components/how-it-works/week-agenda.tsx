import { scenario } from "@/components/reschedule-demo/scenario";
import { cx } from "@/lib/cx";

// The instructor's week in Pingflow's own schedule: one row per day, so it
// reads the same on a phone as on a desktop.
export function WeekAgenda() {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-raised">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="text-ui font-medium text-ink">This week</p>
          <p className="text-label text-ink-3">12–16 October</p>
        </div>
        <p className="text-label text-ink-3">Your schedule</p>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 border-b border-line bg-chat px-4 py-2.5 text-ui-sm text-ink-2">
        <li>Hours 09:00–19:00</li>
        <li>Lessons 1 hour</li>
        <li>15 min between lessons</li>
      </ul>

      <ol className="divide-y divide-line">
        {scenario.week.map((day) => (
          <li
            key={day.day}
            className="grid grid-cols-[3.5rem_1fr] items-start gap-x-3 px-4 py-3"
          >
            <p className="pt-1 text-ui text-ink">
              <span className="font-medium">{day.day}</span>{" "}
              <span className="text-ink-3 tabular-nums">{day.date}</span>
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {"blocked" in day && (
                <li className="rounded-xs bg-[repeating-linear-gradient(135deg,var(--color-line)_0_2px,transparent_2px_6px)] px-2 py-1 text-ui-sm text-ink-2">
                  {day.blocked}
                </li>
              )}
              {day.items.map((item) => {
                const moved = "moved" in item && item.moved;
                return (
                  <li
                    key={item.time}
                    className={cx(
                      "rounded-xs px-2 py-1 text-ui-sm",
                      moved ? "bg-accent text-ink" : "bg-sunken text-ink",
                    )}
                  >
                    <span className="tabular-nums">{item.time}</span>{" "}
                    {item.name}
                    {moved && <span className="font-medium"> · Moved</span>}
                  </li>
                );
              })}
              {"free" in day &&
                day.free.map((slot) => (
                  <li
                    key={slot}
                    className="rounded-xs border border-dashed border-line-strong px-2 py-[3px] text-ui-sm text-ink-2"
                  >
                    Free <span className="tabular-nums">{slot}</span>
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
