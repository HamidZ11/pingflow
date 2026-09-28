export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="9" className="fill-ink" />
      <circle cx="21.5" cy="10.5" r="4.5" className="fill-accent" />
    </svg>
  );
}
