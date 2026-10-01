"use client";

import { useEffect, useState } from "react";
import { clockTimeOf, dateKeyOf, minutesOfDay } from "@/domain/time/zoned";
import type {
  GridBlock,
  GridBooking,
  GridDay,
  ScheduleData,
} from "@/features/schedule/data";
import { cx } from "@/lib/cx";

// The schedule's time grid: one column per day (seven for the week, one for
// a day). Working hours are white, the rest of the day is the canvas colour;
// bookings are neutral blocks with their travel time hatched below, blocked
// time is hatched, and free time is outlined and can be booked straight
// from the grid. Positions come from the server in minutes; the grid only
// scales them.

export type GridHandlers = {
  onBooking: (booking: GridBooking) => void;
  onBlock: (block: GridBlock, day: GridDay) => void;
  /** Add a booking on this day (from free time, or an open flexible day). */
  onFree: (day: GridDay) => void;
};

const at = (minutes: number) => ({ top: `calc(${minutes} * var(--ppm))` });
const span = (top: number, height: number) => ({
  top: `calc(${top} * var(--ppm))`,
  height: `calc(${height} * var(--ppm))`,
});

function useNowMinute(timeZone: string) {
  const [now, setNow] = useState<{ date: string; minute: number } | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow({
        date: dateKeyOf(d, timeZone),
        minute: minutesOfDay(clockTimeOf(d, timeZone)),
      });
    };
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, [timeZone]);
  return now;
}

export function TimeGrid({
  data,
  days,
  density,
  timeZone,
  handlers,
}: {
  data: ScheduleData;
  days: GridDay[];
  density: "week" | "day";
  timeZone: string;
  handlers: GridHandlers;
}) {
  const now = useNowMinute(timeZone);
  const total = data.range.end - data.range.start;
  const pxPerHour = density === "week" ? 52 : 64;
  const single = days.length === 1;

  return (
    <div
      className="overflow-clip rounded-lg border border-line bg-surface"
      style={{ ["--ppm" as string]: `${pxPerHour / 60}px` }}
    >
      {!single && (
        <div
          aria-hidden
          className="sticky top-0 z-20 grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-line bg-surface"
        >
          <div />
          {days.map((day) => (
            <div
              key={day.date}
              className="flex items-baseline justify-center gap-1.5 border-l border-line py-2.5 text-ui"
            >
              <span
                className={day.isToday ? "font-medium text-ink" : "text-ink-3"}
              >
                {day.weekdayShort}
              </span>
              <span
                className={cx(
                  "grid min-w-7 place-items-center rounded-full px-1.5 py-0.5 tabular-nums",
                  day.isToday
                    ? "bg-ink font-medium text-canvas"
                    : day.isPast
                      ? "text-ink-3"
                      : "text-ink",
                )}
              >
                {day.dayOfMonth}
              </span>
            </div>
          ))}
        </div>
      )}

      <div
        className={cx(
          "grid",
          single
            ? "grid-cols-[3.5rem_minmax(0,1fr)]"
            : "grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]",
        )}
      >
        <div
          aria-hidden
          className="relative"
          style={{ height: `calc(${total} * var(--ppm))` }}
        >
          {data.hourLabels.map((h, i) =>
            i === 0 || h.minute === total ? null : (
              <span
                key={h.minute}
                className="absolute right-2 -translate-y-1/2 text-label text-ink-3 tabular-nums"
                style={at(h.minute)}
              >
                {h.label}
              </span>
            ),
          )}
        </div>

        {days.map((day) => (
          <DayColumn
            key={day.date}
            day={day}
            data={data}
            total={total}
            density={density}
            nowMinute={
              now && now.date === day.date
                ? now.minute - data.range.start
                : null
            }
            handlers={handlers}
          />
        ))}
      </div>
    </div>
  );
}

function DayColumn({
  day,
  data,
  total,
  density,
  nowMinute,
  handlers,
}: {
  day: GridDay;
  data: ScheduleData;
  total: number;
  density: "week" | "day";
  nowMinute: number | null;
  handlers: GridHandlers;
}) {
  const roomy = density === "day";

  return (
    <section
      aria-label={`${day.label}${day.closed ? ", not working" : ""}`}
      className={cx(
        "relative border-l border-line bg-canvas",
        day.isToday && "bg-canvas",
      )}
      style={{ height: `calc(${total} * var(--ppm))` }}
    >
      {day.windows.map((w, i) => (
        <div
          key={i}
          aria-hidden
          className="absolute inset-x-0 bg-surface"
          style={span(w.top, w.height)}
        />
      ))}
      {data.hourLabels.slice(1, -1).map((h) => (
        <div
          key={h.minute}
          aria-hidden
          className="absolute inset-x-0 border-t border-line"
          style={at(h.minute)}
        />
      ))}
      {day.closed && (
        <p className="absolute inset-x-0 top-3 text-center text-label text-ink-3">
          Not working
        </p>
      )}
      {/* Flexible hours: the whole bookable day is open, so the day itself
          is the way in to adding a booking. */}
      {data.mode === "flexible" &&
        !day.isPast &&
        day.windows.map((w, i) => (
          <button
            key={`open-${i}`}
            type="button"
            onClick={() => handlers.onFree(day)}
            aria-label={`Add a booking on ${day.label}`}
            className="absolute inset-x-0 transition-[background-color] duration-150 hover:bg-canvas/60 focus-visible:-outline-offset-2"
            style={span(w.top, w.height)}
          />
        ))}

      <ul className="pointer-events-none absolute inset-0 [&_button]:pointer-events-auto">
        {day.free.map((free) => (
          <li
            key={free.key}
            className="absolute inset-x-1"
            style={span(free.top, free.height)}
          >
            <button
              type="button"
              onClick={() => handlers.onFree(day)}
              aria-label={`Free ${free.time}, ${day.label}. Add a booking`}
              className="group flex size-full items-start rounded-sm border border-dashed border-line-strong px-2 py-1 text-left transition-[background-color,border-color] duration-150 hover:border-ink-3 hover:bg-canvas"
            >
              {free.height >= 28 && (
                <span className="truncate text-label text-ink-3">
                  Free
                  {roomy && (
                    <span className="tabular-nums"> · {free.time}</span>
                  )}
                  <span className="text-ink-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                    {" "}
                    + Add
                  </span>
                </span>
              )}
            </button>
          </li>
        ))}

        {day.blocks.map((block) => (
          <li
            key={block.id}
            className="absolute inset-x-1"
            style={span(block.top, block.height)}
          >
            <button
              type="button"
              onClick={() => handlers.onBlock(block, day)}
              className="hatch flex size-full flex-col items-start overflow-hidden rounded-sm border border-line-strong bg-surface px-2 py-1 text-left"
            >
              <span className="max-w-full truncate rounded-xs bg-surface/90 text-ui-sm font-medium text-ink-2">
                {block.label}
              </span>
              {block.height >= 44 && (
                <span className="rounded-xs bg-surface/90 text-label text-ink-3 tabular-nums">
                  {block.time}
                </span>
              )}
              <span className="sr-only">, blocked, {day.label}</span>
            </button>
          </li>
        ))}

        {day.bookings.map((booking) => (
          <li key={booking.id} className="contents">
            {booking.bufferHeight > 0 && (
              <div
                aria-hidden
                className="hatch absolute inset-x-2 rounded-b-xs opacity-80"
                style={span(booking.top + booking.height, booking.bufferHeight)}
              />
            )}
            <button
              type="button"
              onClick={() => handlers.onBooking(booking)}
              className={cx(
                "absolute inset-x-1 flex flex-col overflow-hidden rounded-sm border px-2 text-left transition-[border-color,background-color] duration-150",
                booking.height < 44 ? "justify-center py-0.5" : "py-1.5",
                booking.moved
                  ? "border-ink/25 bg-accent text-ink hover:border-ink"
                  : booking.past
                    ? "border-line bg-canvas text-ink-3 hover:border-line-strong"
                    : "border-line-strong bg-sunken text-ink hover:border-ink-3",
              )}
              style={span(booking.top, booking.height)}
            >
              <span className="flex w-full min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate text-ui-sm font-medium">
                  {booking.customerName}
                </span>
                {booking.height < 44 && (
                  <span className="shrink-0 text-label tabular-nums opacity-75">
                    {booking.time.split("–")[0]}
                  </span>
                )}
                {booking.requested && (
                  <span
                    aria-hidden
                    className="ml-auto size-2.5 shrink-0 rounded-full border-[1.5px] border-ink bg-accent"
                  />
                )}
              </span>
              {booking.height >= 44 && (
                <span
                  className={cx(
                    "truncate text-label tabular-nums",
                    booking.moved ? "text-ink" : "text-ink-3",
                  )}
                >
                  {booking.time}
                  {roomy && ` · ${booking.serviceName}`}
                  {booking.moved && (roomy ? " · Moved" : "")}
                </span>
              )}
              {roomy && booking.moved && booking.height >= 64 && (
                <span className="truncate text-label text-ink">
                  Moved from {booking.detail.movedFrom}
                </span>
              )}
              <span className="sr-only">
                , {booking.serviceName}, {day.label}
                {booking.requested ? ", asked to move" : ""}
                {booking.moved ? ", moved today" : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {nowMinute !== null && nowMinute >= 0 && nowMinute <= total && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-ink"
          style={at(nowMinute)}
        >
          <span className="absolute -top-[5px] -left-[5px] size-2 rounded-full border-[1.5px] border-ink bg-accent" />
        </div>
      )}
    </section>
  );
}
