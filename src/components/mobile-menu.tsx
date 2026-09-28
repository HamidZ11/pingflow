"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { NavLink } from "@/components/nav-link";
import { signInHref, siteNav } from "@/lib/links";

const rowClassName =
  "flex h-11 items-center rounded-sm px-3 text-body text-ink transition-[background-color] duration-150 hover:bg-sunken";

// A native popover: the browser handles Escape, clicking outside and
// returning focus to the button.
export function MobileMenu() {
  const panel = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const close = () => panel.current?.hidePopover();

  // The header stays mounted across client-side navigations, so an open menu
  // would otherwise survive the page change.
  useEffect(() => {
    panel.current?.hidePopover();
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        popoverTarget="site-menu"
        aria-label="Menu"
        className="grid size-10 place-items-center rounded-md text-ink transition-[background-color] duration-150 hover:bg-sunken"
      >
        <Menu aria-hidden className="size-5" />
      </button>
      <div
        id="site-menu"
        ref={panel}
        popover="auto"
        className="fixed inset-auto top-18 right-5 m-0 hidden w-[min(18rem,calc(100vw-2.5rem))] flex-col rounded-lg border border-line bg-surface p-1.5 text-ink shadow-raised open:flex sm:right-8"
      >
        <ul className="flex flex-col">
          {siteNav.map((item) => (
            <li key={item.href}>
              <NavLink
                href={item.href}
                className={rowClassName}
                activeClassName="bg-sunken font-medium"
                onClick={close}
              >
                {item.label}
              </NavLink>
            </li>
          ))}
          <li className="mt-1 border-t border-line pt-1">
            <NavLink
              href={signInHref}
              prefetch={false}
              className={rowClassName}
              activeClassName="bg-sunken font-medium"
              onClick={close}
            >
              Sign in
            </NavLink>
          </li>
        </ul>
      </div>
    </>
  );
}
