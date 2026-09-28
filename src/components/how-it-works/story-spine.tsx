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
export function StorySpine({ steps }: { steps: StoryStep[] }) {
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

        return (
          <li
            key={step.id}
            ref={(item) => {
              items.current[index] = item;
            }}
            className="relative grid gap-6 pl-9 lg:grid-cols-[4fr_7fr] lg:gap-16 lg:pl-12"
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

            <div>
              <p className="text-ui-sm text-ink-3 tabular-nums">
                {step.kicker}
              </p>
              <h3 className="mt-2 text-title font-semibold text-balance text-ink">
                {step.title}
              </h3>
              <div className="mt-3 max-w-[26rem] text-lead text-pretty text-ink-2">
                {step.body}
              </div>
            </div>

            <figure>
              <figcaption className="sr-only">{step.visualLabel}</figcaption>
              {step.visual}
            </figure>
          </li>
        );
      })}
    </ol>
  );
}
