import { cx } from "@/lib/cx";

// A small working indicator for buttons and panels. Motion stops for people
// who prefer less; the label keeps the state readable either way.
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cx("size-4 motion-safe:animate-spin", className)}
    >
      <circle
        cx="8"
        cy="8"
        r="6.25"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1.5"
      />
      <path
        d="M14.25 8A6.25 6.25 0 0 0 8 1.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
