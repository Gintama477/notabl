"use client";

import Link from "next/link";
import { ReactNode } from "react";

/**
 * Wraps the primary landing-page CTA so main_cta_clicked fires on click,
 * without needing to convert the whole landing page (or Header) to a
 * client component. Fire-and-forget — never blocks navigation.
 */
export function TrackedCtaLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventName: "main_cta_clicked" }),
        }).catch(() => {});
      }}
    >
      {children}
    </Link>
  );
}
