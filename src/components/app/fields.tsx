import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/lib/cx";

// Form controls for the app. 40px tall (44px on touch-first phones) so they
// are easy to hit, with the same border and focus treatment everywhere.

const control =
  "w-full rounded-md border border-line-strong bg-surface px-3 text-body text-ink transition-[border-color] duration-150 placeholder:text-ink-3 hover:border-ink-3 focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-0 aria-invalid:border-alert disabled:opacity-60 md:text-ui";

export const inputClassName = cx(control, "h-11 md:h-10");

export const textareaClassName = cx(
  control,
  "min-h-28 resize-y py-2.5 leading-normal",
);

export const selectClassName = cx(
  control,
  "h-11 appearance-none bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%2367645b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")] bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-9 md:h-10",
);

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cx("block text-ui font-medium text-ink", className)}
      {...props}
    />
  );
}

export function Hint({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 text-ui-sm text-ink-3">
      {children}
    </p>
  );
}

export function FieldError({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) {
  return (
    <p id={id} className="mt-1.5 text-ui-sm font-medium text-alert">
      {children}
    </p>
  );
}

/** A labelled block of content in a sheet or settings section. */
export function DetailList({
  items,
  className,
}: {
  items: { label: string; value: ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={cx("divide-y divide-line", className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="grid grid-cols-[7.5rem_1fr] gap-x-4 py-2.5 first:pt-0 last:pb-0"
        >
          <dt className="text-ui text-ink-3">{item.label}</dt>
          <dd className="min-w-0 text-ui text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
