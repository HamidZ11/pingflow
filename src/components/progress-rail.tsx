import { ArrowDown, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

// Steps joined by a line: vertical on small screens, horizontal from md.
// The first step is "now" (accent marker, solid line to the next step); later
// steps are quieter. `ongoing` adds a dashed tail after the last step for
// something that carries on, like a monthly plan.
//
// Geometry: markers are 12px. Vertically the ol gap is 40px, so a line runs
// from 4px under one marker to 4px above the next; horizontally the gap is
// 48px and the same 4px clearances apply.

const tones = {
  light: {
    now: "border-ink bg-accent",
    later: "border-line-strong bg-canvas",
    lineNow: "bg-ink",
    lineLater: "bg-line-strong",
    tail: "border-line-strong text-ink-3",
  },
  night: {
    now: "border-accent bg-accent",
    later: "border-night-text-3 bg-night",
    lineNow: "bg-accent",
    lineLater: "bg-night-line",
    tail: "border-night-text-3 text-night-text-3",
  },
};

export function ProgressRail({
  steps,
  tone = "light",
  ongoing = false,
  className,
}: {
  steps: Array<{ id: string; content: ReactNode }>;
  tone?: keyof typeof tones;
  ongoing?: boolean;
  className?: string;
}) {
  const colours = tones[tone];

  return (
    <ol
      className={cx(
        "grid gap-10 md:auto-cols-fr md:grid-flow-col md:gap-12",
        className,
      )}
    >
      {steps.map((step, index) => {
        const first = index === 0;
        const last = index === steps.length - 1;

        return (
          <li key={step.id} className="relative pl-9 md:pt-10 md:pl-0">
            <span
              aria-hidden
              className={cx(
                "absolute top-1 left-0 size-3 rounded-full border-[1.5px] md:top-0",
                first ? colours.now : colours.later,
              )}
            />
            {!last && (
              <span
                aria-hidden
                className={cx(
                  "absolute top-5 -bottom-10 left-[5px] w-0.5 md:top-[5px] md:-right-11 md:bottom-auto md:left-4 md:h-0.5 md:w-auto",
                  first ? colours.lineNow : colours.lineLater,
                )}
              />
            )}
            {last && ongoing && (
              <>
                <span
                  aria-hidden
                  className={cx(
                    "absolute top-5 bottom-3 left-[5px] border-l-[1.5px] border-dashed md:top-[5px] md:right-3 md:bottom-auto md:left-4 md:border-t-[1.5px] md:border-l-0",
                    colours.tail,
                  )}
                />
                <ArrowDown
                  aria-hidden
                  strokeWidth={2}
                  className={cx(
                    "absolute bottom-0 left-0 size-3 md:hidden",
                    colours.tail,
                  )}
                />
                <ArrowRight
                  aria-hidden
                  strokeWidth={2}
                  className={cx(
                    "absolute top-0 right-0 hidden size-3 md:block",
                    colours.tail,
                  )}
                />
              </>
            )}
            {step.content}
          </li>
        );
      })}
    </ol>
  );
}
