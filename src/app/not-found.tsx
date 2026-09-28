import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/button-link";
import { SiteFooter } from "@/components/site-footer";
import { cx } from "@/lib/cx";
import { containerClassName } from "@/lib/layout";
import { howItWorksHref } from "@/lib/links";

export const metadata: Metadata = {
  title: "Page not found",
};

// Every unmatched URL lands here, inside the root layout (so the header is
// already in place). Same type roles and rhythm as the other page intros.
export default function NotFound() {
  return (
    <>
      <main>
        <section
          aria-labelledby="not-found-title"
          className={cx(
            containerClassName,
            "pt-16 pb-24 sm:pt-20 lg:pt-28 lg:pb-32",
          )}
        >
          <p className="flex items-center gap-2.5 text-ui font-medium text-ink-3">
            {/* The site's "you are here" marker, as on its progress rails. */}
            <span
              aria-hidden
              className="size-3 rounded-full border-[1.5px] border-ink bg-accent"
            />
            <span className="tabular-nums">404</span>
          </p>
          <h1
            id="not-found-title"
            className="mt-4 max-w-3xl text-display font-semibold text-balance text-ink"
          >
            This page got lost in the admin.
          </h1>
          <p className="mt-5 max-w-132 text-lead text-pretty text-ink-2">
            The page you’re looking for doesn’t exist or may have moved.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href="/" size="lg">
              Back home
            </ButtonLink>
            <ButtonLink href={howItWorksHref} size="lg" variant="secondary">
              How it works
              <ArrowRight aria-hidden className="size-4 text-ink-3" />
            </ButtonLink>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
