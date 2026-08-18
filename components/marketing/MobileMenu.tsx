"use client";

import { useState } from "react";
import Link from "next/link";

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
export function MobileMenu({ loggedIn }: { loggedIn: boolean }) {
  const [open, setOpen] = useState(false);

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
        </div>
      )}
    </div>
  );
}
