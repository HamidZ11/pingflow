"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { cx } from "@/lib/cx";

type NavLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  activeClassName?: string;
};

// Marks the link to the current page. Hash links (the homepage demo anchor)
// are never "current".
export function NavLink({
  href,
  className,
  activeClassName,
  ...props
}: NavLinkProps) {
  const pathname = usePathname();
  const current = !href.includes("#") && pathname === href;

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cx(className, current && activeClassName)}
      {...props}
    />
  );
}
