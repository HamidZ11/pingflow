import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

// The top of every app screen: a compact title, one line of purpose, and
// the screen's own actions. The title takes focus (tabIndex -1) so focus has
// somewhere sensible to land after a sheet closes.
export function PageHeader({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("pt-6 pb-5 md:pt-8 md:pb-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1
            tabIndex={-1}
            className="text-heading font-semibold text-ink focus-visible:outline-none"
          >
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-ui text-ink-3">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
      {children}
    </header>
  );
}

/** The standard horizontal padding and width for an app screen. */
export function pageClassName(width: "narrow" | "medium" | "wide" = "narrow") {
  return cx(
    "mx-auto w-full px-4 sm:px-6 md:px-8 lg:px-10",
    width === "narrow" && "max-w-[48rem]",
    width === "medium" && "max-w-[64rem]",
    width === "wide" && "max-w-[90rem]",
  );
}
