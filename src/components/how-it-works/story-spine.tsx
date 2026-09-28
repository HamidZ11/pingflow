"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";

export type StoryStep = {
  id: string;
  kicker: string;
  title: string;
  body: ReactNode;
  visual: ReactNode;
  // Short description of the product visual for assistive technology.
  visualLabel: string;
};

// The example as one connected sequence. A rail runs down the left: steps
// the reader has scrolled past are filled, the current one is lime, later
// ones are hollow. Only the rail changes; the content is always visible.
// Without JavaScript every step shows as reached.
//
// `alternate` (homepage): from lg, every second step swaps sides so the
// product UI zig-zags down the page. The rail stays on the left.
export function StorySpine({
  steps,
  alternate = false,
}: {
  steps: StoryStep[];
  alternate?: boolean;
}) {
  const items = useRef<Array<HTMLLIElement | null>>([]);
  const [reached, setReached] = useState(steps.length);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.6;
      let count = 0;
      items.current.forEach((item, index) => {
        if (item && item.getBoundingClientRect().top < line) count = index + 1;
      });
      setReached(Math.max(1, count));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <ol className="space-y-20 lg:space-y-28">
      {steps.map((step, index) => {
        const state =
          index < reached - 1
            ? "done"
            : index === reached - 1
              ? "current"
              : "next";
        const last = index === steps.length - 1;
        // Alternating: every second step puts the product UI on the left.
        const flipped = alternate && index % 2 === 1;

        const heading = (
          <>
            <p className="text-ui-sm text-ink-3 tabular-nums">{step.kicker}</p>
            <h3 className="mt-2 text-title font-semibold text-balance text-ink">
              {step.title}
            </h3>
          </>
        );
        const visual = (
          <>
            <figcaption className="sr-only">{step.visualLabel}</figcaption>
            {step.visual}
          </>
        );

        return (
          <li
            key={step.id}
            ref={(item) => {
              items.current[index] = item;
            }}
            className={cx(
              "relative grid pl-9 lg:pl-12",
              alternate
                ? "gap-y-5 lg:grid-rows-[auto_1fr] lg:gap-x-16 lg:gap-y-3"
                : "gap-6 lg:gap-16",
              flipped ? "lg:grid-cols-[7fr_4fr]" : "lg:grid-cols-[4fr_7fr]",
            )}
          >
            <span
              aria-hidden
              className={cx(
                "absolute top-1 left-0 size-3 rounded-full border-[1.5px] transition-colors duration-300 motion-reduce:transition-none",
                state === "done" && "border-ink bg-ink",
                state === "current" && "border-ink bg-accent",
                state === "next" && "border-line-strong bg-canvas",
              )}
            />
            {!last && (
              <span
                aria-hidden
                className={cx(
                  "absolute top-5 -bottom-20 left-[5px] w-0.5 transition-colors duration-300 motion-reduce:transition-none lg:-bottom-28",
                  index + 1 < reached ? "bg-ink" : "bg-line-strong",
                )}
              />
            )}

            {alternate ? (
              // Narrow: heading, product, then the line as its caption.
              // Wide: heading and line beside the product, sides alternating.
              <>
                <div
                  className={cx(
                    "lg:row-start-1",
                    flipped ? "lg:col-start-2" : "lg:col-start-1",
                  )}
                >
                  {heading}
                </div>
                <figure
                  className={cx(
                    "lg:row-span-2 lg:row-start-1",
                    flipped ? "lg:col-start-1" : "lg:col-start-2",
                  )}
                >
                  {visual}
                </figure>
                <div
                  className={cx(
                    "max-w-104 text-lead text-pretty text-ink-2 lg:row-start-2",
                    flipped ? "lg:col-start-2" : "lg:col-start-1",
                  )}
                >
                  {step.body}
                </div>
              </>
            ) : (
              <>
                <div>
                  {heading}
                  <div className="mt-3 max-w-104 text-lead text-pretty text-ink-2">
                    {step.body}
                  </div>
                </div>
                <figure>{visual}</figure>
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}
