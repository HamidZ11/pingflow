import { Plus } from "lucide-react";
import { cx } from "@/lib/cx";

// Native <details>: keyboard, screen-reader state and find-in-page come for
// free. The open/close animation lives in globals.css (.disclosure).
export function FaqList({
  items,
  className,
}: {
  items: Array<{ question: string; answer: string }>;
  className?: string;
}) {
  return (
    <div className={cx("border-t border-line-strong", className)}>
      {items.map((item) => (
        <details
          key={item.question}
          className="disclosure group border-b border-line"
        >
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-4 text-body font-medium text-ink transition-[color] duration-150 hover:text-ink-2 [&::-webkit-details-marker]:hidden">
            {item.question}
            <Plus
              aria-hidden
              className="size-4 shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
            />
          </summary>
          {/* Wide enough to belong to the row, still a comfortable measure. */}
          <p className="max-w-3xl pr-10 pb-5 text-ui text-ink-2">
            {item.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
