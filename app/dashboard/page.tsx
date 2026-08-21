import Link from "next/link";
import type { ComponentProps } from "react";
import { redirect } from "next/navigation";
import { getSessionAccountId } from "@/lib/auth/session";
import {
  getBusinessForAccount,
  getDashboardData,
  getSubscriptionForAccount,
  findDuplicateBusiness,
  getThemeExcerptsForBusiness,
  getNewReviewsForRun,
  hasReviewRequestPageView,
  getReviewRequestStats,
} from "@/lib/db/queries";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { BfcacheGuard } from "@/components/BfcacheGuard";
import { DemoDataBanner } from "@/components/dashboard/DemoDataBanner";
import { ConnectReviewsCard } from "@/components/dashboard/ConnectReviewsCard";
import { ReviewRequestsCard } from "@/components/dashboard/ReviewRequestsCard";
import { DuplicateBusinessNotice } from "@/components/dashboard/DuplicateBusinessNotice";
import { MetricsRow } from "@/components/dashboard/MetricsRow";
import {
  WhatPatientsLove,
  WhatPatientsDislike,
  IssuesGettingWorse,
  Opportunities,
  RecommendedActions,
} from "@/components/dashboard/Sections";
import { NewThisWeek } from "@/components/dashboard/NewThisWeek";
import { RunAnalysisButton } from "@/components/dashboard/RunAnalysisButton";
import { track } from "@/lib/analytics/track";
import { inactiveSubscriptionMessage } from "@/lib/billing/statusCopy";
import { formatLastUpdated } from "@/lib/reports/formatLastUpdated";
import { generateReviewRequestQrSvg } from "@/lib/reviews/reviewRequestQr";
import { OUTSCRAPER_REVIEWS_LIMIT } from "@/lib/reviews/outscraperProvider";
import { getSiteUrl } from "@/lib/siteUrl";

export default async function DashboardPage() {
  const accountId = await getSessionAccountId();
  if (!accountId) redirect("/signup");

  const business = await getBusinessForAccount(accountId);
  if (!business) redirect("/signup");

  const data = await getDashboardData(business.id);
  const subscription = await getSubscriptionForAccount(accountId);
  const isActiveOrTrialing = subscription?.status === "active" || subscription?.status === "trialing";
  // Whether checkout will actually give this account a free trial — same
  // signal StripeBillingProvider.createCheckoutSession already uses to
  // decide whether to skip trial_period_days. A returning customer whose
  // trial already ran out once (stripeCustomerId set from a prior real
  // checkout, even if that subscription has since lapsed) isn't eligible
  // for a second one; the banner's copy has to reflect that instead of
  // promising "days free" it won't actually deliver.
  const hasUsedTrialBefore = subscription?.stripeCustomerId != null;

  // The one remaining gap between "subscribed" and "seeing your real
  // report" — a paying customer who hasn't connected Google reviews yet.
  const showConnectReviewsCard = isActiveOrTrialing && data.hasDemoData;

  // Real review data is only ever shown to a currently active/trialing
  // subscription — a canceled or payment-failed account keeps its actual
  // stored reviews/reports untouched (this is purely a display-time
  // check), but stops seeing them until they reactivate. Accounts still on
  // demo data are unaffected either way.
  const subscriptionInactive = !data.hasDemoData && !isActiveOrTrialing;

  const duplicateBusiness = await findDuplicateBusiness({
    name: business.name,
    city: business.city,
    state: business.state,
    excludeAccountId: accountId,
  });

  await track("dashboard_viewed", { accountId, businessId: business.id });

  const topPositiveThemes = data.latestReport ? JSON.parse(data.latestReport.topPositiveThemesJson) : [];
  const topNegativeThemes = data.latestReport ? JSON.parse(data.latestReport.topNegativeThemesJson) : [];
  const recommendedActions = data.latestReport ? JSON.parse(data.latestReport.recommendedActionsJson) : [];

  // A couple of real, verbatim quotes per theme, keyed by sentiment — the
  // business's whole current analysis, not just its latest run (see
  // getThemeExcerptsForBusiness's doc comment). Returns {} on its own for a
  // business with nothing analyzed yet, so no latestRun guard is needed here.
  const excerptsByTheme = await getThemeExcerptsForBusiness(business.id, 2);

  // The literal "what came in since last time" list — deliberately not the
  // AI-summarized emergingIssues theme list (that's a cumulative theme
  // rollup, kept on the Full Report page instead, since the theme cards
  // above are never empty under the cumulative model and this is meant to
  // be the one honest, possibly-empty-on-a-quiet-week section).
  //
  // Deliberately NOT data.latestReport.periodStart/periodEnd — a business's
  // latest report row can be a leftover from before the cumulative-report
  // redesign (or just an old run reused by cost-control dedup because
  // nothing's changed since), so its stored period isn't guaranteed to mean
  // "the last 7 days." This section computes its own real trailing-7-day
  // window instead of trusting whatever period happens to be on that row.
  const newReviewsWindowEnd = new Date();
  const newReviewsWindowStart = new Date(newReviewsWindowEnd);
  newReviewsWindowStart.setUTCDate(newReviewsWindowStart.getUTCDate() - 7);

  const newReviews = data.latestReport
    ? await getNewReviewsForRun(business.id, newReviewsWindowStart.toISOString(), newReviewsWindowEnd.toISOString())
    : [];

  // The "get more reviews" card is permanent for any subscribed, real-data
  // business — it never disappears, only changes state (see
  // components/dashboard/ReviewRequestsCard.tsx for why hiding it entirely
  // once used was the bug this replaced). Default to the onboarding pitch;
  // only fetch the QR thumbnail and live stats if there's actually
  // something to show (the page has been viewed at least once, and the
  // business has a slug to build a link from).
  const showReviewRequestsCard = !data.hasDemoData && !subscriptionInactive;
  let reviewRequestsCardProps: ComponentProps<typeof ReviewRequestsCard> = { state: "onboarding" };
  if (showReviewRequestsCard && business.slug && (await hasReviewRequestPageView(business.id))) {
    const reviewRequestsWindowDays = 30;
    const shortLink = `${getSiteUrl()}/r/${business.slug}`;
    const qrSvg = await generateReviewRequestQrSvg(shortLink, 112);
    const statsWindowEnd = new Date();
    const statsWindowStart = new Date(statsWindowEnd);
    statsWindowStart.setUTCDate(statsWindowStart.getUTCDate() - reviewRequestsWindowDays);
    const stats = await getReviewRequestStats(business.id, statsWindowStart.toISOString(), statsWindowEnd.toISOString());
    reviewRequestsCardProps = { state: "active", qrSvg, shortLink, stats, windowDays: reviewRequestsWindowDays };
  }

  return (
    <>
      <BfcacheGuard />
      <Header />
      {data.hasDemoData && (
        <DemoDataBanner showSubscriptionCta={!isActiveOrTrialing} hasUsedTrialBefore={hasUsedTrialBefore} />
      )}
      <main className="flex-1 bg-slate-50 py-10">
        <div className="mx-auto max-w-6xl px-6">
          {duplicateBusiness && <DuplicateBusinessNotice />}

          {showConnectReviewsCard && (
            <div className="mb-8">
              <ConnectReviewsCard />
            </div>
          )}

          {/*
            Title and actions share a row starting at lg:, not sm: — at
            sm/md widths the two competed for space and forced the action
            bar to wrap early even though the actions themselves fit fine
            on their own line; stacking them (title full-width, actions
            full-width below) up to lg gives the action bar the whole
            container to lay out in.
          */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Dashboard</p>
              <h1 className="font-serif text-2xl font-semibold text-slate-900">{business.name}</h1>
              {/* createdAt, NOT periodStart/periodEnd — those are internal
                  comparison anchors for the trend math and are never shown
                  to a customer (see lib/db/schema.pg.ts). Under the
                  cumulative model there's no period to display; when the
                  analysis last ran is the only date that means anything. */}
              {data.latestReport && (
                <p className="mt-1 text-sm text-slate-500">
                  Last updated {formatLastUpdated(data.latestReport.createdAt)}
                </p>
              )}
            </div>
            {/*
              Hierarchy, left to right: links to the two sub-pages (styled
              consistently with each other, and with Run Analysis Now — same
              outline-button treatment, since all three act on the
              business's own data), then the one primary action (View Full
              Report, solid teal), then the account-level items (Billing,
              Log Out) — deliberately plain text, housekeeping rather than
              content actions, but grouped into their own bordered pill
              (not just a divider) so that IF this whole row still wraps on
              a narrow viewport, that group reads as one deliberate cluster
              wherever it lands rather than orphaned text stranded on its
              own line.
            */}
            <div className="flex flex-wrap items-center gap-2">
              {!data.hasDemoData && (
                <>
                  <Link
                    href="/dashboard/reviews"
                    className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  >
                    All Reviews
                  </Link>
                  <Link
                    href="/dashboard/review-requests"
                    className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  >
                    Get More Reviews
                  </Link>
                </>
              )}
              <RunAnalysisButton />
              {data.latestReport && (
                <Link
                  href={`/dashboard/weekly-report/${data.latestReport.id}`}
                  className="rounded-md bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-teal-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-teal-800 hover:shadow-md hover:shadow-teal-900/20"
                >
                  View Full Report
                </Link>
              )}
              <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5">
                <Link href="/feedback" className="text-sm text-slate-500 hover:text-slate-800">
                  Feedback
                </Link>
                <span aria-hidden className="h-3 w-px bg-slate-300" />
                <Link href="/billing" className="text-sm text-slate-500 hover:text-slate-800">
                  Billing
                </Link>
                <span aria-hidden className="h-3 w-px bg-slate-300" />
                <form action="/api/logout" method="post">
                  <button className="text-sm text-slate-500 hover:text-slate-800">Log Out</button>
                </form>
              </div>
            </div>
          </div>

          {subscriptionInactive ? (
            <div className="mt-10 rounded-lg border border-amber-200 bg-amber-50 p-8 text-center">
              <p className="text-slate-700">{inactiveSubscriptionMessage(subscription?.status)}</p>
              <Link
                href="/billing"
                className="mt-4 inline-block rounded-md bg-teal-700 px-6 py-2.5 text-sm font-medium text-white hover:bg-teal-800"
              >
                Reactivate Subscription
              </Link>
            </div>
          ) : (
            <>
              {data.possiblyTruncated && (
                <div className="mt-8 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                  Analyzing your most recent {OUTSCRAPER_REVIEWS_LIMIT} reviews — your practice may have more on
                  Google than we imported.
                </div>
              )}

              <div className={data.possiblyTruncated ? "mt-4" : "mt-8"}>
                <MetricsRow
                  totalReviews={data.totalReviews}
                  reviewsAnalyzedCount={data.reviewsAnalyzedCount}
                  avgRating={data.avgRating}
                  positivePct={data.positivePct}
                  negativePct={data.negativePct}
                  emergingIssuesCount={data.emergingIssuesCount}
                  importantThemesCount={data.importantThemesCount}
                />
              </div>

              {/* Full-width, deliberately interrupting the analysis
                  sections below — this is the other half of the product,
                  and burying it under six report cards is how it got lost
                  in the first place. Never hidden for a subscribed,
                  real-data business (see showReviewRequestsCard above). */}
              {showReviewRequestsCard && (
                <div className="mt-8">
                  <ReviewRequestsCard {...reviewRequestsCardProps} />
                </div>
              )}

              {!data.latestReport ? (
                <div className="mt-10 rounded-lg border border-slate-200 bg-white p-8 text-center">
                  <p className="text-slate-600">
                    No analysis has run yet for this business. Click &ldquo;Run Analysis Now&rdquo; above to generate your first report.
                  </p>
                </div>
              ) : (
                <div className="mt-8 grid gap-6 lg:grid-cols-2">
                  <WhatPatientsLove items={topPositiveThemes} excerptsByTheme={excerptsByTheme} />
                  <WhatPatientsDislike items={topNegativeThemes} excerptsByTheme={excerptsByTheme} />
                  <NewThisWeek reviews={newReviews} />
                  <IssuesGettingWorse rollups={data.rollups} excerptsByTheme={excerptsByTheme} />
                  <Opportunities rollups={data.rollups} excerptsByTheme={excerptsByTheme} />
                  <RecommendedActions items={recommendedActions} />
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
