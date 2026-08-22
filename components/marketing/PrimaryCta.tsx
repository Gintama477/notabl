import Link from "next/link";
import { getSessionAccountId } from "@/lib/auth/session";
import { TrackedCtaLink } from "./TrackedCtaLink";

/**
 * The "sign up" call to action, in one place, aware of whether the visitor
 * already has an account.
 *
 * Every marketing CTA used to hardcode href="/signup", so an existing
 * customer clicking the biggest button on the page was invited to create a
 * second account — and the signup form would then quietly email them a
 * magic link instead (the "email already exists" path). Not broken, but it
 * reads as broken.
 *
 * An async Server Component, so it does its own session lookup and each
 * call site stays a plain `<PrimaryCta />` with nothing to thread through.
 * That means one session read per CTA rather than one per page — the
 * landing page renders two. Deliberately accepted: getSessionAccountId is
 * a cookie read plus a signature check, not a database query, and keeping
 * these self-contained is worth more than deduplicating it. This is only
 * the second line of defence anyway; the redirect guards on
 * app/signup/page.tsx and app/login/page.tsx are what actually protect a
 * bookmark, a typed URL, or a CTA added later that forgets to check.
 */
export async function PrimaryCta({
  className,
  label = "Analyze My Reviews",
  trackAsMainCta = false,
}: {
  className?: string;
  /** Logged-out label only. Logged in, it's always "Go to Dashboard". */
  label?: string;
  /**
   * Fire main_cta_clicked on click. Off by default, and deliberately never
   * set for the logged-in variant: a customer clicking through to their own
   * dashboard is not a signup-funnel event and would inflate conversion
   * numbers. Only the two landing-page CTAs that already fired it (Hero,
   * CtaSection) pass this — the pricing and sample-report buttons never
   * fired it, and turning it on for them here would change what the funnel
   * measures rather than just fixing a link.
   */
  trackAsMainCta?: boolean;
}) {
  const loggedIn = (await getSessionAccountId()) !== null;

  if (loggedIn) {
    return (
      <Link href="/dashboard" className={className}>
        Go to Dashboard
      </Link>
    );
  }

  if (trackAsMainCta) {
    return (
      <TrackedCtaLink href="/signup" className={className}>
        {label}
      </TrackedCtaLink>
    );
  }

  return (
    <Link href="/signup" className={className}>
      {label}
    </Link>
  );
}
