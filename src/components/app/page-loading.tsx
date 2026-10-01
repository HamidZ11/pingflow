import { pageClassName } from "@/components/app/page-header";
import { cx } from "@/lib/cx";

// Shown while an app screen loads: the page's own width and shape, quietly
// pulsing, so nothing jumps sideways when the content arrives.
export function PageLoading({
  width = "narrow",
  body = "cards",
}: {
  width?: "narrow" | "medium" | "wide";
  body?: "cards" | "list" | "grid";
}) {
  const block = "bg-sunken motion-safe:animate-pulse";
  return (
    <div className={pageClassName(width)} aria-busy="true" aria-label="Loading">
      <div className="pt-6 pb-5 md:pt-8 md:pb-6">
        <div className={cx("h-7 w-40 rounded-sm", block)} />
        <div className={cx("mt-2 h-4 w-64 max-w-full rounded-xs", block)} />
      </div>
      {body === "cards" && (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-44 rounded-lg border border-line bg-surface motion-safe:animate-pulse"
            />
          ))}
        </div>
      )}
      {body === "list" && (
        <div className="rounded-lg border border-line bg-surface">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="border-b border-line px-4 py-4 last:border-b-0"
            >
              <div className={cx("h-4 w-48 max-w-full rounded-xs", block)} />
            </div>
          ))}
        </div>
      )}
      {body === "grid" && (
        <>
          <div className={cx("mb-4 h-10 w-full rounded-md", block)} />
          <div className="h-[32rem] rounded-lg border border-line bg-surface motion-safe:animate-pulse" />
        </>
      )}
    </div>
  );
}
