import { Check } from "lucide-react";
import Link from "next/link";
import type { AttentionItem } from "@/features/attention/data";
import { NoteCard } from "@/features/attention/note-card";
import { RescheduleCard } from "@/features/attention/reschedule-card";
import { cx } from "@/lib/cx";

const categories = [
  {
    key: "approval",
    title: "Needs approval",
    marker: "border-ink bg-accent",
  },
  { key: "reply", title: "Needs a reply", marker: "border-ink bg-surface" },
  { key: "failed", title: "Something failed", marker: "border-alert bg-alert" },
] as const;

function categoryOf(item: AttentionItem) {
  return item.type === "reschedule" ? "approval" : item.category;
}

// Grouped by what the owner has to do. Empty groups are left out; with
// nothing at all, the screen says so plainly.
export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <section
        aria-labelledby="caught-up"
        className="flex flex-col items-start rounded-lg border border-line bg-surface px-5 py-8 sm:px-8 sm:py-10"
      >
        <span
          aria-hidden
          className="grid size-10 place-items-center rounded-full bg-night text-accent"
        >
          <Check className="size-5" strokeWidth={2.5} />
        </span>
        <h2 id="caught-up" className="mt-4 text-heading font-semibold text-ink">
          You’re all caught up.
        </h2>
        <p className="mt-1.5 max-w-md text-body text-ink-2">
          Pingflow will bring you back here when something needs you.
        </p>
        <Link
          href="/app/schedule"
          className="mt-6 inline-flex h-10 items-center rounded-md border border-line-strong bg-surface px-4 text-ui font-medium text-ink transition-[border-color] duration-150 hover:border-ink-3"
        >
          Open your schedule
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-10">
      {categories.map((category) => {
        const group = items.filter((item) => categoryOf(item) === category.key);
        if (group.length === 0) return null;
        return (
          <section key={category.key} aria-labelledby={`group-${category.key}`}>
            <h2
              id={`group-${category.key}`}
              className="flex items-center gap-2.5 text-ui font-medium text-ink"
            >
              <span
                aria-hidden
                className={cx(
                  "size-3 rounded-full border-[1.5px]",
                  category.marker,
                )}
              />
              {category.title}
              <span className="text-ink-3 tabular-nums">{group.length}</span>
            </h2>
            <ul className="mt-3 space-y-4">
              {group.map((item) => (
                <li key={item.id}>
                  {item.type === "reschedule" ? (
                    <RescheduleCard item={item} />
                  ) : (
                    <NoteCard item={item} />
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
