"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Product navigation for logged-in pages (Header variant="app").
 *
 * A client component purely so it can read usePathname() and mark the
 * current page — Header itself is an async Server Component and can't.
 * Doing it here rather than threading a "currentPage" prop through all
 * seven app pages means a page added later gets the active state for free
 * instead of silently missing it.
 *
 * "Dashboard" is included deliberately, though the change that introduced
 * variant="app" dropped it. That was correct when the app header had no
 * nav at all and the link sat next to a redundant "Go to Dashboard"
 * button. Now that this is a persistent bar across every app page, leaving
 * it out breaks two things: /dashboard/weekly-report/[id] has no other way
 * back to the dashboard (the logo goes to the marketing home, not here),
 * and on /dashboard itself NO item would be active, which makes the
 * current-page marking look broken on the most-visited page.
 */
export const APP_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/reviews", label: "All Reviews" },
  { href: "/dashboard/review-requests", label: "Get More Reviews" },
] as const;

/**
 * Exact match for /dashboard, prefix match for the rest — otherwise
 * /dashboard would light up on every page beneath it. The prefix form is
 * what keeps "Get More Reviews" marked on
 * /dashboard/review-requests/print. Pages with no nav entry of their own
 * (the full report at /dashboard/weekly-report/[id], /billing) correctly
 * mark nothing rather than guessing at a parent.
 */
export function isAppNavItemActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={className}>
      {APP_NAV_ITEMS.map((item) => {
        const active = isAppNavItemActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "font-medium text-slate-900 underline decoration-teal-600 decoration-2 underline-offset-8"
                : "hover:text-slate-900"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
