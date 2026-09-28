import { ArrowDown } from "lucide-react";
import { ButtonLink } from "@/components/button-link";
import { HomeStory } from "@/components/home-story";
import { WhatsAppMark } from "@/components/whatsapp-mark";
import { howItWorksId, startFreeHref } from "@/lib/links";

export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="mx-auto max-w-page px-5 pt-10 pb-20 sm:px-8 sm:pt-16 lg:px-10 lg:pt-20 lg:pb-28"
    >
      <h1
        id="hero-title"
        className="text-display font-semibold text-balance text-ink"
      >
        <span className="block">
          Keep using{" "}
          {/* A lime block behind the word, drawn as a positioned layer so it
              adds no height or width. In em from the word's text box (which
              starts 0.968em above the baseline): 0.08em above the caps,
              ~0.11em below the baseline. "p." sits tight in this font, so the
              full stop is drawn 0.12em further right (relative positioning:
              the line's width, and so its line breaks, are unchanged). */}
          <span className="relative isolate whitespace-nowrap before:absolute before:top-[0.17em] before:right-[-0.13em] before:bottom-[0.14em] before:left-[-0.08em] before:-z-10 before:bg-accent">
            WhatsApp
          </span>
          <span className="relative left-[0.12em]">.</span>
        </span>
        <span className="block">Pingflow handles the admin behind it.</span>
      </h1>
      <p className="mt-6 max-w-[33rem] text-lead text-pretty text-ink-2">
        Customers message you as they always have. Pingflow checks your
        calendar, handles bookings, reschedules and reminders, and asks you
        before any booking changes.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <ButtonLink href={startFreeHref} size="lg">
          Start free
        </ButtonLink>
        <ButtonLink href={`#${howItWorksId}`} size="lg" variant="secondary">
          See how it works
          <ArrowDown aria-hidden className="size-4 text-ink-3" />
        </ButtonLink>
      </div>
      <p className="mt-5 text-ui-sm text-ink-3">
        Works with{" "}
        <span className="whitespace-nowrap">
          <WhatsAppMark className="mr-1.5 inline-block size-4 align-[-3px] text-whatsapp" />
          WhatsApp Business
        </span>
        . Calendar built in.
      </p>
      <HomeStory className="mt-8 sm:mt-10 lg:mt-14" />
    </section>
  );
}
