import { pageClassName } from "@/components/app/page-header";

// Shown while an app screen loads: the page's shape, quietly pulsing.
export default function Loading() {
  return (
    <div
      className={pageClassName("narrow")}
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="pt-6 pb-5 md:pt-8 md:pb-6">
        <div className="h-7 w-40 rounded-sm bg-sunken motion-safe:animate-pulse" />
        <div className="mt-2 h-4 w-64 rounded-xs bg-sunken motion-safe:animate-pulse" />
      </div>
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-44 rounded-lg border border-line bg-surface motion-safe:animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
