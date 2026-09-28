import type { ReactNode } from "react";

// The opening of a secondary page: eyebrow, title, one short paragraph.
// Same type roles and rhythm as the homepage hero.
export function PageIntro({
  eyebrow,
  title,
  titleId,
  className,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  titleId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <p className="text-ui font-medium text-ink-3">{eyebrow}</p>
      <h1
        id={titleId}
        className="mt-3 text-display font-semibold text-balance text-ink"
      >
        {title}
      </h1>
      <p className="mt-5 max-w-[33rem] text-lead text-pretty text-ink-2">
        {children}
      </p>
    </div>
  );
}
