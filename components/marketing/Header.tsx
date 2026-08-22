import Link from "next/link";
import { Logo } from "./Logo";
import { TrackedCtaLink } from "./TrackedCtaLink";
import { MobileMenu } from "./MobileMenu";
import { getSessionAccountId } from "@/lib/auth/session";

/**
 * Async Server Component — checks session state on every render so the
 * header never shows "Log In" to someone who's actually logged in (or vice
 * versa), the same way app/dashboard/page.tsx already does. Every current
 * usage renders it as plain JSX (`<Header />`) inside another Server
 * Component; a few pages that used to render it from a "use client" file
 * (app/signup, app/feedback, app/login/check-email) were split so the
 * Header itself stays server-rendered — a Client Component can't render an
 * async Server Component directly.
 */
export type HeaderVariant = "marketing" | "app";

export async function Header({ variant = "marketing" }: { variant?: HeaderVariant } = {}) {
  const accountId = await getSessionAccountId();
  const loggedIn = accountId !== null;
  // On app pages the header used to stack three redundancies on one screen:
  // a prominent teal "Go to Dashboard" button while already on the
  // dashboard, a "Dashboard" nav link beside it, and a "Log Out" sitting a
  // few pixels above the dashboard's own Log Out. The teal button was the
  // worst of the three — the loudest thing in the header, doing nothing,
  // and competing with the page's real primary action ("View Full Report")
  // for the same visual weight.
  //
  // Everything that acts on the account lives in the page's own action bar
  // instead, so what's left here is the logo (which already links home —
  // that's why there's no "Back to site" button, which would just be a
  // different redundancy) plus two quiet nav links that still go somewhere
  // new.
  const isApp = variant === "app";

  return (
    <header className="relative border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <Logo className="h-7 w-7" />
          <span className="font-serif text-lg font-semibold tracking-tight text-slate-900">
            Notabl
          </span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
          <Link href="/sample-report" className="hover:text-slate-900">
            Sample Report
          </Link>
          <Link href="/pricing" className="hover:text-slate-900">
            Pricing
          </Link>
          {/* Not on app pages — you're already there. */}
          {!isApp && (
            <Link href="/dashboard" className="hover:text-slate-900">
              Dashboard
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-3">
          {!isApp && (
            <>
              {loggedIn ? (
                <form action="/api/logout" method="post">
                  {/* md:inline, matching the nav's own breakpoint above — the
                      mobile menu covers everything below md, so this and the
                      nav appear/disappear together with no gap or overlap. */}
                  <button type="submit" className="hidden text-sm text-slate-600 hover:text-slate-900 md:inline">
                    Log Out
                  </button>
                </form>
              ) : (
                <Link href="/login" className="hidden text-sm text-slate-600 hover:text-slate-900 md:inline">
                  Log In
                </Link>
              )}
              {loggedIn ? (
                <Link
                  href="/dashboard"
                  className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
                >
                  Go to Dashboard
                </Link>
              ) : (
                <TrackedCtaLink
                  href="/signup"
                  className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
                >
                  Analyze My Reviews
                </TrackedCtaLink>
              )}
            </>
          )}
          <MobileMenu loggedIn={loggedIn} variant={variant} />
        </div>
      </div>
    </header>
  );
}
