"use client";

import {
  CalendarDays,
  Ellipsis,
  History,
  Inbox,
  LogOut,
  type LucideIcon,
  Settings,
  ToggleRight,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Overlay } from "@/components/app/overlay";
import { Mark } from "@/components/mark";
import { signOut } from "@/lib/auth/actions";
import { cx } from "@/lib/cx";

type Item = { href: string; label: string; icon: LucideIcon };

const primary: Item[] = [
  { href: "/app", label: "Attention", icon: Inbox },
  { href: "/app/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/app/customers", label: "Customers", icon: Users },
  { href: "/app/activity", label: "Activity", icon: History },
];

const secondary: Item[] = [
  { href: "/app/automations", label: "Automations", icon: ToggleRight },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

function isCurrent(pathname: string, href: string) {
  return href === "/app"
    ? pathname === "/app"
    : pathname === href || pathname.startsWith(`${href}/`);
}

function Count({ value }: { value: number }) {
  if (value < 1) return null;
  return (
    <span
      aria-hidden
      className="absolute -top-1 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-ink px-1 text-label leading-none font-semibold text-canvas tabular-nums ring-2 ring-canvas"
    >
      {value > 9 ? "9+" : value}
    </span>
  );
}

function RailLink({
  item,
  pathname,
  count = 0,
}: {
  item: Item;
  pathname: string;
  count?: number;
}) {
  const current = isCurrent(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      aria-label={count > 0 ? `${item.label}, ${count} waiting` : undefined}
      className="group flex w-full flex-col items-center gap-1 rounded-md py-1.5 text-label"
    >
      <span
        className={cx(
          "relative grid h-8 w-12 place-items-center rounded-full transition-[background-color] duration-150",
          current ? "bg-accent text-ink" : "text-ink-2 group-hover:bg-sunken",
        )}
      >
        <Icon aria-hidden className="size-5" strokeWidth={1.75} />
        <Count value={count} />
      </span>
      <span className={current ? "font-medium text-ink" : "text-ink-2"}>
        {item.label}
      </span>
    </Link>
  );
}

// Desktop and tablet: a compact labelled rail. Phones: a labelled tab bar
// with Automations, Settings and Sign out under More.
export function AppNav({
  attentionCount,
  email,
}: {
  attentionCount: number;
  email: string | null;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const moreCurrent = secondary.some((item) => isCurrent(pathname, item.href));

  return (
    <>
      <nav
        aria-label="Pingflow"
        className="sticky top-0 hidden h-dvh w-22 shrink-0 flex-col items-center border-r border-line bg-canvas px-1.5 py-4 md:flex"
      >
        <Link
          href="/app"
          aria-label="Pingflow, go to Attention"
          className="mb-5 grid size-10 place-items-center rounded-md"
        >
          <Mark className="size-7" />
        </Link>
        <ul className="flex w-full flex-col gap-1.5">
          {primary.map((item) => (
            <li key={item.href}>
              <RailLink
                item={item}
                pathname={pathname}
                count={item.href === "/app" ? attentionCount : 0}
              />
            </li>
          ))}
        </ul>
        <ul className="mt-auto flex w-full flex-col gap-1.5 border-t border-line pt-3">
          {secondary.map((item) => (
            <li key={item.href}>
              <RailLink item={item} pathname={pathname} />
            </li>
          ))}
          <li>
            <form action={signOut}>
              <button
                type="submit"
                title={email ? `Signed in as ${email}` : undefined}
                className="group flex w-full flex-col items-center gap-1 rounded-md py-1.5 text-label text-ink-2"
              >
                <span className="grid h-8 w-12 place-items-center rounded-full transition-[background-color] duration-150 group-hover:bg-sunken">
                  <LogOut aria-hidden className="size-5" strokeWidth={1.75} />
                </span>
                Sign out
              </button>
            </form>
          </li>
        </ul>
      </nav>

      <nav
        aria-label="Pingflow"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      >
        <ul className="grid grid-cols-5">
          {primary.map((item) => {
            const current = isCurrent(pathname, item.href);
            const Icon = item.icon;
            const count = item.href === "/app" ? attentionCount : 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  aria-label={
                    count > 0 ? `${item.label}, ${count} waiting` : undefined
                  }
                  className="flex h-16 flex-col items-center justify-center gap-1 text-label"
                >
                  <span
                    className={cx(
                      "relative grid h-7 w-11 place-items-center rounded-full",
                      current ? "bg-accent text-ink" : "text-ink-2",
                    )}
                  >
                    <Icon aria-hidden className="size-5" strokeWidth={1.75} />
                    <Count value={count} />
                  </span>
                  <span
                    className={current ? "font-medium text-ink" : "text-ink-2"}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(true)}
              className="flex h-16 w-full flex-col items-center justify-center gap-1 text-label"
            >
              <span
                className={cx(
                  "grid h-7 w-11 place-items-center rounded-full",
                  moreCurrent ? "bg-accent text-ink" : "text-ink-2",
                )}
              >
                <Ellipsis aria-hidden className="size-5" strokeWidth={1.75} />
              </span>
              <span
                className={moreCurrent ? "font-medium text-ink" : "text-ink-2"}
              >
                More
              </span>
            </button>
          </li>
        </ul>
      </nav>

      <Overlay
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="More"
        description={email ? `Signed in as ${email}` : undefined}
      >
        <ul className="-mx-2 flex flex-col">
          {secondary.map((item) => {
            const Icon = item.icon;
            const current = isCurrent(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  onClick={() => setMoreOpen(false)}
                  className={cx(
                    "flex h-12 items-center gap-3 rounded-md px-2 text-body text-ink hover:bg-sunken",
                    current && "bg-sunken font-medium",
                  )}
                >
                  <Icon
                    aria-hidden
                    className="size-5 text-ink-2"
                    strokeWidth={1.75}
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li className="mt-1 border-t border-line pt-1">
            <form action={signOut}>
              <button
                type="submit"
                className="flex h-12 w-full items-center gap-3 rounded-md px-2 text-body text-ink hover:bg-sunken"
              >
                <LogOut
                  aria-hidden
                  className="size-5 text-ink-2"
                  strokeWidth={1.75}
                />
                Sign out
              </button>
            </form>
          </li>
        </ul>
      </Overlay>
    </>
  );
}
