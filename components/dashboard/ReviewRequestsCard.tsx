import Link from "next/link";
import type { ReviewRequestStats } from "@/lib/db/queries";

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
    | { state: "active"; qrSvg: string; stats: ReviewRequestStats; windowDays: number }
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

  const { qrSvg, stats, windowDays } = props;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        {/* Server-generated SVG from our own trusted qrcode library (see
            lib/reviews/reviewRequestQr.ts) — not user-supplied content, so
            dangerouslySetInnerHTML is safe here, same as on the full
            review-requests page. */}
        <div className="mx-auto shrink-0 sm:mx-0" dangerouslySetInnerHTML={{ __html: qrSvg }} />

        <div className="flex-1">
          <p className="font-serif text-base font-semibold text-slate-900">Get More Reviews</p>
          <p className="mt-0.5 text-xs text-slate-500">Last {windowDays} days</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Scans" value={stats.pageViews} />
            <MiniStat label="Clicked public review" value={stats.publicClicks} />
            <MiniStat label="Private feedback" value={stats.privateSubmissions} />
            <MiniStat label="New reviews" value={stats.newReviewsInWindow} />
          </div>
        </div>

        <Link
          href="/dashboard/review-requests"
          className="shrink-0 rounded-md border border-slate-300 bg-white px-4 py-2 text-center text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50"
        >
          View full page
        </Link>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-serif text-lg font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
