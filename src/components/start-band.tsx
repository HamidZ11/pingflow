import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/button-link";
import { containerClassName } from "@/lib/layout";
import { howItWorksHref, startFreeHref } from "@/lib/links";
import { cx } from "@/lib/cx";

// The closing band on secondary pages: the page settles on a tinted surface
// before the footer, with the offer still in view.
export function StartBand({
  title = "Try Pingflow on your own WhatsApp.",
  secondary = { href: howItWorksHref, label: "See how it works" },
}: {
  title?: ReactNode;
  secondary?: { href: string; label: string };
}) {
  return (
    <section
      aria-labelledby="start-band-title"
      className="border-t border-line bg-sunken"
    >
      <div
        className={cx(
          containerClassName,
          "flex flex-col gap-8 py-16 lg:flex-row lg:items-end lg:justify-between lg:py-20",
        )}
      >
        <div>
          <h2
            id="start-band-title"
            className="text-headline font-semibold text-balance text-ink"
          >
            {title}
          </h2>
          <p className="mt-3 text-lead text-ink-2">
            Free trial, then £10 a month.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={startFreeHref} size="lg">
            Start free
          </ButtonLink>
          <ButtonLink href={secondary.href} size="lg" variant="secondary">
            {secondary.label}
            <ArrowRight aria-hidden className="size-4 text-ink-3" />
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
