import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionAccountId } from "@/lib/auth/session";
import {
  getBusinessForAccount,
  getDashboardData,
  getSubscriptionForAccount,
  getPaginatedReviewsForBusiness,
  getGoogleReviewsManageUrl,
  ReviewRatingFilter,
} from "@/lib/db/queries";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { BfcacheGuard } from "@/components/BfcacheGuard";
import { DraftReplyButton } from "@/components/dashboard/DraftReplyButton";
import { inactiveSubscriptionMessage } from "@/lib/billing/statusCopy";
import { formatReviewText } from "@/lib/reviews/formatReviewText";

const RATING_FILTERS: { value: ReviewRatingFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "high", label: "4–5★" },
  { value: "mid", label: "3★" },
  { value: "low", label: "1–2★" },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; rating?: string }>;
}) {
  const { page: pageParam, rating: ratingParam } = await searchParams;

  const accountId = await getSessionAccountId();
  if (!accountId) redirect("/signup");

  const business = await getBusinessForAccount(accountId);
  if (!business) redirect("/signup");

  // Same gating signals as app/dashboard/page.tsx — kept identical
  // deliberately so this page can never show real review data in a
  // situation the main dashboard wouldn't.
  const data = await getDashboardData(business.id);
  const subscription = await getSubscriptionForAccount(accountId);
  const isActiveOrTrialing = subscription?.status === "active" || subscription?.status === "trialing";
  const subscriptionInactive = !data.hasDemoData && !isActiveOrTrialing;

  const ratingFilter: ReviewRatingFilter =
    ratingParam === "high" || ratingParam === "mid" || ratingParam === "low" ? ratingParam : "all";
  const page = Math.max(1, Number(pageParam) || 1);

  const result =
    !data.hasDemoData && !subscriptionInactive
      ? await getPaginatedReviewsForBusiness(business.id, { page, pageSize: 25, ratingFilter })
      : null;

  // One lookup for the whole page, not per review — same active "google"
  // review source backs every review shown here.
  const googleReviewsUrl = result ? await getGoogleReviewsManageUrl(business.id) : null;

  function pageHref(nextPage: number, nextRating: ReviewRatingFilter) {
    const params = new URLSearchParams();
    if (nextRating !== "all") params.set("rating", nextRating);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/dashboard/reviews?${qs}` : "/dashboard/reviews";
  }

  return (
    <>
      <BfcacheGuard />
      <Header />
      <main className="flex-1 bg-slate-50 py-10">
        <div className="mx-auto max-w-3xl px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">All Reviews</p>
              <h1 className="font-serif text-2xl font-semibold text-slate-900">{business.name}</h1>
            </div>
            <Link href="/dashboard" className="text-sm font-medium text-slate-500 hover:text-slate-800">
              ← Back to Dashboard
            </Link>
          </div>

          {data.hasDemoData ? (
            <div className="mt-10 rounded-lg border border-amber-200 bg-amber-50 p-8 text-center">
              <p className="text-slate-700">Connect your Google reviews to see your real reviews here.</p>
              <Link
                href="/dashboard"
                className="mt-4 inline-block rounded-md bg-teal-700 px-6 py-2.5 text-sm font-medium text-white hover:bg-teal-800"
              >
                Go to Dashboard
              </Link>
            </div>
          ) : subscriptionInactive ? (
            <div className="mt-10 rounded-lg border border-amber-200 bg-amber-50 p-8 text-center">
              <p className="text-slate-700">{inactiveSubscriptionMessage(subscription?.status)}</p>
              <Link
                href="/billing"
                className="mt-4 inline-block rounded-md bg-teal-700 px-6 py-2.5 text-sm font-medium text-white hover:bg-teal-800"
              >
                Reactivate Subscription
              </Link>
            </div>
          ) : result ? (
            <>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                <div className="flex gap-2">
                  {RATING_FILTERS.map((f) => (
                    <Link
                      key={f.value}
                      href={pageHref(1, f.value)}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                        ratingFilter === f.value
                          ? "bg-teal-700 text-white"
                          : "border border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {f.label}
                    </Link>
                  ))}
                </div>
                <p className="text-sm text-slate-500">
                  {result.totalCount} review{result.totalCount === 1 ? "" : "s"} · Page {result.page} of{" "}
                  {result.totalPages}
                </p>
              </div>

              {result.reviews.length === 0 ? (
                <div className="mt-10 rounded-lg border border-slate-200 bg-white p-8 text-center">
                  <p className="text-slate-600">No reviews match this filter.</p>
                </div>
              ) : (
                <div className="mt-6 space-y-3">
                  {result.reviews.map((r) => (
                    <div key={r.id} className="rounded-md border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>{r.authorName || "Anonymous"}</span>
                        <span>
                          {"★".repeat(r.rating)}
                          {"☆".repeat(5 - r.rating)} · {fmtDate(r.reviewDate)}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{formatReviewText(r.reviewText)}</p>
                      <DraftReplyButton reviewId={r.id} googleReviewsUrl={googleReviewsUrl} />
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex items-center justify-between">
                {page > 1 ? (
                  <Link
                    href={pageHref(page - 1, ratingFilter)}
                    className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span />
                )}
                {page < result.totalPages ? (
                  <Link
                    href={pageHref(page + 1, ratingFilter)}
                    className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Next →
                  </Link>
                ) : (
                  <span />
                )}
              </div>
            </>
          ) : null}
        </div>
      </main>
      <Footer />
    </>
  );
}
