import { cx } from "@/lib/cx";

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : (parts[0]?.slice(0, 2) ?? "?");
  return letters.toUpperCase();
}

// Initials in a neutral disc: identity without pretending to be a photo.
export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cx(
        "grid size-9 shrink-0 place-items-center rounded-full bg-sunken text-label font-semibold text-ink-2",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
