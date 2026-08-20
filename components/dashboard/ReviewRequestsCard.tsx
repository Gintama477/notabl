import Link from "next/link";
import type { ReviewRequestStats } from "@/lib/db/queries";
import { CopyLinkButton } from "./CopyLinkButton";

// Permanent, full-width panel for the "get more reviews" half of the
// product — sits directly below the metrics row so it's not buried under
// six analysis cards (see app/dashboard/page.tsx).
//
// Unlike a one-time nudge, something is ALWAYS shown in this slot for a
// subscribed, real-data business — it graduates from an onboarding pitch
// into a live value display rather than disappearing. The previous version
// (ReviewRequestsPrompt) hid itself entirely the moment
// hasReviewRequestPageView flipped true, which meant the only remaining
// entry point to half the product was a small gray "Review Requests" link
// in the action bar. hasReviewRequestPageView is still the right signal —
// it just now only decides WHICH state renders, never whether anything
// does.
export function ReviewRequestsCard(
  props:
    | { state: "onboarding" }
    | { state: "active"; qrSvg: string; shortLink: string; stats: ReviewRequestStats; windowDays: number }
) {
  if (props.state === "onboarding") {
    return (
      <div className="rounded-lg border border-teal-200 bg-teal-50 p-5">
        <p className="text-sm font-medium text-teal-900">Get more reviews, not just reports on the ones you have.</p>
        <p className="mt-1 text-sm text-teal-800">
          Print a QR code for the front desk or checkout counter that lets patients leave a public review or send
          private feedback — and see how many new reviews it actually brings in.
        </p>
        <Link
          href="/dashboard/review-requests"
          className="mt-3 inline-block rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
        >
          Print your review request cards
        </Link>
      </div>
    );
  }

  const { qrSvg, shortLink, stats, windowDays } = props;
  // A brand-new practice with nothing recorded yet reads as broken with four
  // zeros sitting where a metrics-style grid is elsewhere always populated —
  // swapped for a plain "not started" line instead. Rating movement isn't
  // part of this check: it's not shown on this card, only on the full page.
  const noActivity = stats.pageViews === 0 && stats.publicClicks === 0 && stats.privateSubmissions === 0 && stats.newReviewsInWindow === 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Left half: the QR as a deliberate object in its own container,
            with the link it actually points to directly beneath — the
            single highest-value addition here, since a QR code alone is
            useless in an email or text message and previously the owner
            had to click through to another page just to copy their own
            link. */}
        <div className="mx-auto w-full max-w-[220px] shrink-0 lg:mx-0">
          <div className="flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-4">
            {/* Server-generated SVG from our own trusted qrcode library
                (see lib/reviews/reviewRequestQr.ts) — not user-supplied
                content, so dangerouslySetInnerHTML is safe here, same as
                on the full review-requests page. */}
            <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
          </div>
          <div className="mt-3 flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-xs text-slate-700">{shortLink}</code>
            <CopyLinkButton text={shortLink} />
          </div>
        </div>

        {/* Right half: heading + stats as one grouped block, not spread
            across the full remaining width of a max-w-6xl dashboard. */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-serif text-base font-semibold text-slate-900">Get More Reviews</p>
              <p className="mt-0.5 text-xs text-slate-500">Last {windowDays} days</p>
            </div>
            <Link
              href="/dashboard/review-requests"
              className="shrink-0 rounded-md border border-slate-300 bg-white px-4 py-2 text-center text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50"
            >
              View full page
            </Link>
          </div>

          {noActivity ? (
            <p className="mt-4 text-sm text-slate-500">
              No scans yet — print your cards or share your link to get started.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-2 divide-x divide-y divide-slate-200 rounded-lg border border-slate-200 sm:max-w-md sm:grid-cols-4 sm:divide-y-0">
              <MiniStat label="Scans" value={stats.pageViews} />
              <MiniStat label="Clicked review" value={stats.publicClicks} />
              <MiniStat label="Private feedback" value={stats.privateSubmissions} />
              <MiniStat label="New reviews" value={stats.newReviewsInWindow} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Same visual language as MetricsRow's Metric tile above this card (serif
// number, uppercase label) so the two read as one design system instead of
// this looking like an unfinished draft next to it — grouped into one
// divided block rather than four separate bordered tiles, so it's visibly
// one related set rather than a duplicate of the metrics row.
function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-serif text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
