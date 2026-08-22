"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAV_ITEMS, isAppNavItemActive } from "./AppNav";

/**
 * The only client-side piece of the header (Header.tsx itself stays an
 * async Server Component). Before this existed, the middle nav
 * (Sample Report/Pricing/Dashboard, `hidden md:flex`) and the Log In/Log
 * Out control (`hidden sm:inline`) simply vanished below their respective
 * breakpoints with no fallback — reachable on desktop, gone on a phone.
 * The primary CTA button next to this has no `hidden` class and stays
 * visible standalone at every width, so it isn't duplicated in here.
 *
 * Visible below `md` (768px), not `sm` (640px) — matching the wider of
 * the two breakpoints it's covering for. Using `sm:hidden` here would
 * leave a dead zone between 640-768px where the middle nav is already
 * hidden (`md:flex`) but this hasn't appeared yet either.
 */
export function MobileMenu({ loggedIn, variant = "marketing" }: { loggedIn: boolean; variant?: "marketing" | "app" }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Same rules as the desktop header (see Header.tsx): on app pages, drop
  // the Dashboard link and Log Out, because the page's own action bar
  // carries Log Out (alongside Feedback and Billing) and is visible at
  // every width — so keeping them here would reproduce the exact
  // duplication this variant exists to remove, just below the md
  // breakpoint instead of above it.
  const isApp = variant === "app";

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      >
        {open ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6l-12 12" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-40 border-b border-slate-200 bg-white px-6 py-4 shadow-md">
          {isApp ? (
            // Same split as the desktop app header: product nav, then
            // account items below a divider. No marketing links, and
            // nothing the page underneath already shows — the dashboard's
            // action bar is down to Run Analysis / View Full Report, so
            // Log Out appears exactly once at every width.
            <nav className="flex flex-col gap-4 text-sm text-slate-600">
              {APP_NAV_ITEMS.map((item) => {
                const active = isAppNavItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={active ? "font-medium text-slate-900" : "hover:text-slate-900"}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <span aria-hidden className="h-px w-full bg-slate-200" />
              <Link href="/feedback" onClick={() => setOpen(false)} className="hover:text-slate-900">
                Feedback
              </Link>
              <Link href="/billing" onClick={() => setOpen(false)} className="hover:text-slate-900">
                Billing
              </Link>
              <form action="/api/logout" method="post">
                <button type="submit" className="text-left hover:text-slate-900">
                  Log Out
                </button>
              </form>
            </nav>
          ) : (
            <nav className="flex flex-col gap-4 text-sm text-slate-600">
              <Link href="/sample-report" onClick={() => setOpen(false)} className="hover:text-slate-900">
                Sample Report
              </Link>
              <Link href="/pricing" onClick={() => setOpen(false)} className="hover:text-slate-900">
                Pricing
              </Link>
              <Link href="/dashboard" onClick={() => setOpen(false)} className="hover:text-slate-900">
                Dashboard
              </Link>
              {loggedIn ? (
                <form action="/api/logout" method="post">
                  <button type="submit" className="text-left hover:text-slate-900">
                    Log Out
                  </button>
                </form>
              ) : (
                <Link href="/login" onClick={() => setOpen(false)} className="hover:text-slate-900">
                  Log In
                </Link>
              )}
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
