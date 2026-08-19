import Link from "next/link";

// Shown on the main dashboard only while a subscribed, real-data business
// hasn't had a single view of its review-request page yet — see
// hasReviewRequestPageView (lib/db/queries.ts) and app/dashboard/page.tsx.
// An unused feature justifies nothing, so this stops showing itself the
// moment the QR code/link has actually been put in front of one patient.
export function ReviewRequestsPrompt() {
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
