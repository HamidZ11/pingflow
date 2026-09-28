import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { Mark } from "@/components/mark";
import { MobileMenu } from "@/components/mobile-menu";
import { NavLink } from "@/components/nav-link";
import { signInHref, siteNav, startFreeHref } from "@/lib/links";

const linkClassName =
  "inline-flex h-10 items-center rounded-sm px-2.5 text-ui whitespace-nowrap text-ink-2 transition-[color] duration-150 hover:text-ink";

export function SiteHeader() {
  return (
    <header className="mx-auto flex h-16 max-w-page items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
      <Link
        href="/"
        aria-label="Pingflow home"
        className="-mx-1 flex items-center gap-2 rounded-sm px-1 py-1 text-[1.0625rem] font-semibold tracking-[-0.02em]"
      >
        <Mark className="size-6" />
        Pingflow
      </Link>
      <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
        <ul className="hidden items-center gap-1 md:flex">
          {siteNav.map((item) => (
            <li key={item.href}>
              <NavLink
                href={item.href}
                className={linkClassName}
                activeClassName="font-medium text-ink"
              >
                {item.label}
              </NavLink>
            </li>
          ))}
          <li className="ml-3">
            {/* Sign-in isn't built yet; prefetching it would 404. */}
            <NavLink
              href={signInHref}
              prefetch={false}
              className={linkClassName}
              activeClassName="font-medium text-ink"
            >
              Sign in
            </NavLink>
          </li>
        </ul>
        <ButtonLink href={startFreeHref}>Start free</ButtonLink>
        {/* Below md the text links move into a menu; Start free stays visible. */}
        <div className="md:hidden">
          <MobileMenu />
        </div>
      </nav>
    </header>
  );
}
