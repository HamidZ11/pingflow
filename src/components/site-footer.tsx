import Link from "next/link";
import { Mark } from "@/components/mark";
import { siteNav } from "@/lib/links";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-page flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <Link
          href="/"
          className="-mx-1 inline-flex items-center gap-2 self-start rounded-sm px-1 py-1 text-ui font-semibold tracking-[-0.02em] text-ink"
        >
          <Mark className="size-5" />
          Pingflow
        </Link>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {siteNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex h-8 items-center text-ui-sm text-ink-2 transition-[color] duration-150 hover:text-ink"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-ui-sm text-ink-3">
          © {new Date().getFullYear()} Pingflow
        </p>
      </div>
    </footer>
  );
}
