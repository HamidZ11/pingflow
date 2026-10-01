"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/button-link";
import { FLEXIBLE_BOOKABLE_DAY } from "@/domain/availability/engine";
import { addDays } from "@/domain/time/zoned";
import {
  AddBookingSheet,
  type AddBookingPreset,
} from "@/features/schedule/add-booking-sheet";
import { BlockSheet, BlockTimeSheet } from "@/features/schedule/block-sheets";
import { BookingSheet } from "@/features/schedule/booking-sheet";
import type {
  BookingDetail,
  GridBlock,
  GridDay,
  ScheduleData,
} from "@/features/schedule/data";
import { type GridHandlers, TimeGrid } from "@/features/schedule/time-grid";
import { cx } from "@/lib/cx";

type View = "day" | "week";

function href(view: View, date: string) {
  return `/app/schedule?view=${view}&date=${date}`;
}

// The Schedule screen. Without an explicit view, phones get the day and
// larger screens the week; both are rendered and CSS picks, so nothing
// jumps after load. Sheets for inspecting and changing things live here.
export function ScheduleWorkspace({
  data,
  timeZone,
}: {
  data: ScheduleData;
  timeZone: string;
}) {
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [block, setBlock] = useState<GridBlock | null>(null);
  const [addPreset, setAddPreset] = useState<AddBookingPreset>(null);
  const [blockDate, setBlockDate] = useState<string | null>(null);

  const firstBookableDay = data.date < data.today ? data.today : data.date;
  const handlers: GridHandlers = {
    onBooking: (b) => setBooking(b.detail),
    onBlock: (b) => setBlock(b),
    onFree: (day) => setAddPreset({ date: day.date }),
  };

  const selected = data.days.find((d) => d.date === data.date) ?? data.days[0];
  const mobileView: View = data.view ?? "day";
  const desktopView: View = data.view ?? "week";

  return (
    <>
      <PageHeader
        title="Schedule"
        description={
          data.mode === "flexible"
            ? `Flexible hours: any time from ${FLEXIBLE_BOOKABLE_DAY.start} to ${FLEXIBLE_BOOKABLE_DAY.end} is free unless it’s booked or blocked.`
            : "Your working hours, bookings and time off."
        }
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setBlockDate(firstBookableDay)}
            >
              Block time
            </Button>
            <Button onClick={() => setAddPreset({ date: firstBookableDay })}>
              <Plus aria-hidden className="size-4" />
              Add booking
            </Button>
          </>
        }
      />

      {/* Phones */}
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-body font-semibold text-ink">
            {mobileView === "day"
              ? `${selected.relativeLabel === selected.label ? "" : `${selected.relativeLabel} · `}${selected.label}`
              : data.weekLabel}
          </h2>
          <Stepper view={mobileView} data={data} />
        </div>
        {mobileView === "day" && <DayStrip data={data} />}
        <ViewSwitch view={mobileView} date={data.date} className="mt-3" />
        <div className="mt-4">
          {mobileView === "day" ? (
            <TimeGrid
              data={data}
              days={[selected]}
              density="day"
              timeZone={timeZone}
              handlers={handlers}
            />
          ) : (
            <Agenda data={data} handlers={handlers} />
          )}
        </div>
      </div>

      {/* Tablets and up */}
      <div className="hidden md:block">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Stepper view={desktopView} data={data} />
            <h2 className="ml-2 text-body font-semibold text-ink">
              {desktopView === "week" ? data.weekLabel : selected.label}
            </h2>
          </div>
          <ViewSwitch view={desktopView} date={data.date} />
        </div>
        {desktopView === "week" ? (
          <TimeGrid
            data={data}
            days={data.days}
            density="week"
            timeZone={timeZone}
            handlers={handlers}
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <TimeGrid
              data={data}
              days={[selected]}
              density="day"
              timeZone={timeZone}
              handlers={handlers}
            />
            <DaySummary day={selected} data={data} />
          </div>
        )}
        <Legend mode={data.mode} />
      </div>

      <BookingSheet booking={booking} onClose={() => setBooking(null)} />
      <BlockSheet block={block} onClose={() => setBlock(null)} />
      <AddBookingSheet
        preset={addPreset}
        data={data}
        onClose={() => setAddPreset(null)}
      />
      <BlockTimeSheet
        date={blockDate}
        today={data.today}
        onClose={() => setBlockDate(null)}
      />
    </>
  );
}

function Stepper({ view, data }: { view: View; data: ScheduleData }) {
  const step = view === "week" ? 7 : 1;
  const unit = view === "week" ? "week" : "day";
  const isCurrent =
    view === "week"
      ? data.days.some((d) => d.isToday)
      : data.date === data.today;
  const control =
    "grid h-10 w-10 place-items-center text-ink-2 transition-[background-color,color] duration-150 hover:bg-sunken hover:text-ink md:h-9 md:w-9";
  return (
    <div className="flex items-center gap-2">
      <div className="flex overflow-hidden rounded-md border border-line-strong bg-surface">
        <Link
          href={href(view, addDays(data.date, -step))}
          aria-label={`Previous ${unit}`}
          className={control}
        >
          <ChevronLeft aria-hidden className="size-4" />
        </Link>
        <Link
          href={href(view, addDays(data.date, step))}
          aria-label={`Next ${unit}`}
          className={cx(control, "border-l border-line")}
        >
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      </div>
      <Link
        href={href(view, data.today)}
        aria-current={isCurrent ? "date" : undefined}
        className={cx(
          "inline-flex h-10 items-center rounded-md border border-line-strong bg-surface px-3 text-ui font-medium text-ink transition-[border-color] duration-150 hover:border-ink-3 md:h-9",
          isCurrent && "text-ink-3",
        )}
      >
        Today
      </Link>
    </div>
  );
}

function ViewSwitch({
  view,
  date,
  className,
}: {
  view: View;
  date: string;
  className?: string;
}) {
  return (
    <nav
      aria-label="Schedule view"
      className={cx(
        "inline-flex rounded-md border border-line-strong bg-sunken p-0.5",
        className,
      )}
    >
      {(["day", "week"] as const).map((v) => (
        <Link
          key={v}
          href={href(v, date)}
          aria-current={view === v ? "page" : undefined}
          className={cx(
            "inline-flex h-10 min-w-18 items-center justify-center rounded-sm px-3 text-ui transition-[background-color,color] duration-150 md:h-8 md:min-w-16",
            view === v
              ? "bg-surface font-medium text-ink shadow-raised"
              : "text-ink-2 hover:text-ink",
          )}
        >
          {v === "day" ? "Day" : "Week"}
        </Link>
      ))}
    </nav>
  );
}

// Phones: the week as seven tappable days, each showing how busy it is.
function DayStrip({ data }: { data: ScheduleData }) {
  return (
    <nav aria-label="Days this week" className="mt-3">
      <ol className="grid grid-cols-7 gap-1">
        {data.days.map((day) => {
          const selected = day.date === data.date;
          const count = day.bookings.length;
          return (
            <li key={day.date}>
              <Link
                href={href("day", day.date)}
                aria-current={selected ? "date" : undefined}
                aria-label={`${day.label}, ${day.closed ? "not working" : `${count} ${count === 1 ? "booking" : "bookings"}`}`}
                className={cx(
                  "flex h-16 flex-col items-center justify-center gap-0.5 rounded-md border text-ui transition-[background-color,border-color] duration-150",
                  selected
                    ? "border-ink bg-ink text-canvas"
                    : "border-line bg-surface text-ink hover:border-line-strong",
                )}
              >
                <span
                  className={cx(
                    "text-label",
                    selected ? "text-canvas/75" : "text-ink-3",
                  )}
                >
                  {day.weekdayShort}
                </span>
                <span
                  className={cx(
                    "font-medium tabular-nums",
                    day.isToday && !selected && "rounded-full bg-accent px-1.5",
                  )}
                >
                  {day.dayOfMonth}
                </span>
                <span aria-hidden className="flex h-1.5 gap-0.5">
                  {Array.from({ length: Math.min(count, 4) }, (_, i) => (
                    <span
                      key={i}
                      className={cx(
                        "size-1 rounded-full",
                        selected ? "bg-canvas/80" : "bg-ink-3",
                      )}
                    />
                  ))}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// Phones, week view: one row per day, a list rather than seven thin columns.
function Agenda({
  data,
  handlers,
}: {
  data: ScheduleData;
  handlers: GridHandlers;
}) {
  return (
    <ol className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
      {data.days.map((day) => {
        const entries = [
          ...day.bookings.map((b) => ({
            at: b.top,
            kind: "booking" as const,
            b,
          })),
          ...day.blocks.map((b) => ({ at: b.top, kind: "block" as const, b })),
          ...day.free.map((f) => ({ at: f.top, kind: "free" as const, f })),
        ].sort((a, b) => a.at - b.at);
        return (
          <li
            key={day.date}
            className={cx("px-4 py-3.5", day.isPast && "bg-canvas")}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-ui font-medium text-ink">
                {day.weekdayShort} {day.dayOfMonth}
                {day.isToday && (
                  <span className="ml-2 rounded-xs bg-accent px-1.5 py-0.5 text-label font-medium text-ink">
                    Today
                  </span>
                )}
              </h3>
              <Link
                href={href("day", day.date)}
                className="-my-2 -mr-2 inline-flex h-10 items-center px-2 text-ui-sm text-ink-2 underline decoration-line-strong underline-offset-4"
              >
                Open day<span className="sr-only">, {day.label}</span>
              </Link>
            </div>
            {day.closed && entries.length === 0 ? (
              <p className="mt-1 text-ui-sm text-ink-3">Not working</p>
            ) : entries.length === 0 ? (
              <p className="mt-1 text-ui-sm text-ink-3">Nothing booked</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {entries.map((entry) =>
                  entry.kind === "booking" ? (
                    <li key={entry.b.id}>
                      <button
                        type="button"
                        onClick={() => handlers.onBooking(entry.b)}
                        className={cx(
                          "flex min-h-11 w-full items-center gap-3 rounded-sm border px-3 py-2 text-left text-ui",
                          entry.b.moved
                            ? "border-ink/25 bg-accent"
                            : entry.b.past
                              ? "border-line bg-canvas text-ink-3"
                              : "border-line-strong bg-sunken",
                        )}
                      >
                        <span className="w-11 shrink-0 tabular-nums">
                          {entry.b.time.split("–")[0]}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">
                            {entry.b.customerName}
                          </span>
                          <span
                            className={
                              entry.b.moved ? "text-ink" : "text-ink-3"
                            }
                          >
                            {" "}
                            · {entry.b.serviceName}
                          </span>
                        </span>
                        {entry.b.moved && (
                          <span className="text-label font-medium">Moved</span>
                        )}
                        {entry.b.requested && (
                          <span
                            aria-label="Asked to move"
                            className="size-2.5 shrink-0 rounded-full border-[1.5px] border-ink bg-accent"
                          />
                        )}
                      </button>
                    </li>
                  ) : entry.kind === "block" ? (
                    <li key={entry.b.id}>
                      <button
                        type="button"
                        onClick={() => handlers.onBlock(entry.b, day)}
                        className="hatch flex min-h-11 w-full items-center gap-3 rounded-sm border border-line-strong bg-surface px-3 py-2 text-left text-ui"
                      >
                        <span className="rounded-xs bg-surface/90 tabular-nums">
                          {entry.b.time.split("–")[0]}
                        </span>
                        <span className="rounded-xs bg-surface/90 font-medium text-ink-2">
                          {entry.b.label}
                        </span>
                      </button>
                    </li>
                  ) : (
                    <li key={entry.f.key}>
                      <button
                        type="button"
                        onClick={() => handlers.onFree(day)}
                        className="flex min-h-11 w-full items-center gap-3 rounded-sm border border-dashed border-line-strong px-3 py-2 text-left text-ui text-ink-2"
                      >
                        <span className="w-11 shrink-0 tabular-nums">
                          {entry.f.time.split("–")[0]}
                        </span>
                        <span>Free until {entry.f.time.split("–")[1]}</span>
                      </button>
                    </li>
                  ),
                )}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// Day view, larger screens: the numbers behind the day at a glance.
function DaySummary({ day, data }: { day: GridDay; data: ScheduleData }) {
  const upcoming = day.bookings.filter((b) => !b.past);
  return (
    <aside
      aria-label={`${day.label} summary`}
      className="h-fit rounded-lg border border-line bg-surface px-4 py-4 text-ui"
    >
      <h3 className="font-medium text-ink">{day.relativeLabel}</h3>
      <dl className="mt-3 space-y-2.5">
        <div>
          <dt className="text-ui-sm text-ink-3">Hours</dt>
          <dd className="text-ink tabular-nums">
            {day.hours ?? "Not working"}
          </dd>
        </div>
        <div>
          <dt className="text-ui-sm text-ink-3">Bookings</dt>
          <dd className="text-ink">
            {day.bookings.length === 0
              ? "None"
              : `${day.bookings.length}${upcoming.length !== day.bookings.length ? `, ${upcoming.length} still to come` : ""}`}
          </dd>
        </div>
        <div>
          <dt className="text-ui-sm text-ink-3">Free</dt>
          <dd className="text-ink tabular-nums">
            {data.mode === "flexible"
              ? "Any time not booked or blocked"
              : day.free.length === 0
                ? "Nothing free"
                : day.free.map((f) => f.time).join(", ")}
          </dd>
        </div>
      </dl>
      {data.date !== data.today && (
        <Link
          href={href("week", data.date)}
          className="mt-4 inline-block text-ui-sm text-ink-2 underline decoration-line-strong underline-offset-4"
        >
          See the whole week
        </Link>
      )}
    </aside>
  );
}

function Legend({ mode }: { mode: ScheduleData["mode"] }) {
  const item = "inline-flex items-center gap-2";
  return (
    <ul
      aria-label="Key"
      className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-ui-sm text-ink-3"
    >
      <li className={item}>
        <span
          aria-hidden
          className="h-3 w-4 rounded-xs border border-line-strong bg-sunken"
        />
        Booked
      </li>
      <li className={item}>
        <span aria-hidden className="hatch h-3 w-4 rounded-xs" />
        Travel time or blocked
      </li>
      {mode === "regular" ? (
        <>
          <li className={item}>
            <span
              aria-hidden
              className="h-3 w-4 rounded-xs border border-dashed border-line-strong"
            />
            Free
          </li>
          <li className={item}>
            <span
              aria-hidden
              className="h-3 w-4 rounded-xs bg-canvas ring-1 ring-line"
            />
            Outside working hours
          </li>
        </>
      ) : (
        <li className={item}>
          <span
            aria-hidden
            className="h-3 w-4 rounded-xs bg-surface ring-1 ring-line"
          />
          Free unless booked or blocked
        </li>
      )}
      <li className={item}>
        <span
          aria-hidden
          className="size-2.5 rounded-full border-[1.5px] border-ink bg-accent"
        />
        Asked to move
      </li>
      <li className={item}>
        <span aria-hidden className="h-3 w-4 rounded-xs bg-accent" />
        Moved today
      </li>
    </ul>
  );
}
