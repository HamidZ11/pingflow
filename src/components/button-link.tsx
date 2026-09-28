import type { ComponentProps } from "react";
import { cx } from "@/lib/cx";

type ButtonStyleProps = {
  variant?: "primary" | "secondary" | "accent";
  size?: "md" | "lg";
  className?: string;
};

const variantClasses = {
  primary: "bg-ink text-canvas hover:bg-ink/85 active:bg-ink/75",
  secondary:
    "border border-line-strong bg-surface text-ink hover:border-ink-3 active:bg-sunken",
  // Only on the night surface, where ink would disappear.
  accent:
    "bg-accent text-ink hover:bg-accent/85 active:bg-accent/75 focus-visible:outline-accent",
};

const sizeClasses = {
  md: "h-10 px-4 text-ui",
  lg: "h-12 px-5 text-body",
};

function buttonClassName({
  variant = "primary",
  size = "md",
  className,
}: ButtonStyleProps) {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-[color,background-color,border-color] duration-150",
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"a"> & ButtonStyleProps) {
  return (
    <a className={buttonClassName({ variant, size, className })} {...props} />
  );
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & ButtonStyleProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, className })}
      {...props}
    />
  );
}
