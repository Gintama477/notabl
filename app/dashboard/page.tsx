import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionAccountId } from "@/lib/auth/session";
import { getBusinessForAccount, getDashboardData, getSubscriptionForAccount, findDuplicateBusiness } from "@/lib/db/queries";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { BfcacheGuard } from "@/components/BfcacheGuard";
import { DemoDataBanner } from "@/components/dashboard/DemoDataBanner";
import { ConnectReviewsCard } from "@/components/dashboard/ConnectReviewsCard";
import { DuplicateBusinessNotice } from "@/components/dashboard/DuplicateBusinessNotice";
import { MetricsRow } from "@/components/dashboard/MetricsRow";
import {
  WhatPatientsLove,
  WhatPatientsDislike,
  NewThisWeek,
  IssuesGettingWorse,
  Opportunities,
  RecommendedActions,
} from "@/components/dashboard/Sections";
import { RunAnalysisButton } from "@/components/dashboard/RunAnalysisButton";
import { track } from "@/lib/analytics/track";

export default async function DashboardPage() {
  const accountId = await getSessionAccountId();
  if (!accountId) redirect("/signup");

  const business = await getBusinessForAccount(accountId);
  if (!business) redirect("/signup");

  const data = await getDashboardData(business.id);
  const subscription = await getSubscriptionForAccount(accountId);
  // Based on subscription.status alone — NOT stripeSubscriptionId. A row
  // can genuinely have status "trialing"/"active" with stripeCustomerId/
  // stripeSubscriptionId still null (e.g. a webhook that never landed, or
  // any other incomplete reconciliation) — requiring that second field on
  // top of status was pure fragility with no real benefit, and it's
  // exactly what silently hid this whole flow for a real account before.
  // A signup starts at status "none" (see createAccountWithDemoBusiness in
  // lib/db/queries.ts), so "not none" already means a real checkout
  // happened at some point, whether or not the record is fully populated.
  const hasStartedSubscription = subscription != null && subscription.status !== "none";
  const isActiveOrTrialing = subscription?.status === "active" || subscription?.status === "trialing";

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
  const emergingIssues = data.latestReport ? JSON.parse(data.latestReport.emergingIssuesJson) : [];
  const recommendedActions = data.latestReport ? JSON.parse(data.latestReport.recommendedActionsJson) : [];

  return (
    <>
      <BfcacheGuard />
      <Header />
      {data.hasDemoData && <DemoDataBanner showSubscriptionCta={!hasStartedSubscription} />}
      <main className="flex-1 bg-slate-50 py-10">
        <div className="mx-auto max-w-6xl px-6">
          {duplicateBusiness && <DuplicateBusinessNotice />}

          {showConnectReviewsCard && (
            <div className="mb-8">
              <ConnectReviewsCard />
            </div>
          )}

          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Dashboard</p>
              <h1 className="font-serif text-2xl font-semibold text-slate-900">{business.name}</h1>
              {data.latestReport && (
                <p className="mt-1 text-sm text-slate-500">
                  Latest analysis period: {new Date(data.latestReport.periodStart).toLocaleDateString()} –{" "}
                  {new Date(data.latestReport.periodEnd).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/billing"
                className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
              >
                Billing
              </Link>
              <RunAnalysisButton />
              {data.latestReport && (
                <Link
                  href={`/dashboard/weekly-report/${data.latestReport.id}`}
                  className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
                >
                  View Full Report
                </Link>
              )}
              <form action="/api/logout" method="post">
                <button className="rounded-md px-2 py-2 text-sm text-slate-500 hover:text-slate-800">
                  Log Out
                </button>
              </form>
            </div>
          </div>

          {subscriptionInactive ? (
            <div className="mt-10 rounded-lg border border-amber-200 bg-amber-50 p-8 text-center">
              <p className="text-slate-700">Your subscription is inactive. Reactivate to see your real report.</p>
              <Link
                href="/billing"
                className="mt-4 inline-block rounded-md bg-teal-700 px-6 py-2.5 text-sm font-medium text-white hover:bg-teal-800"
              >
                Reactivate Subscription
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-8">
                <MetricsRow
                  totalReviews={data.totalReviews}
                  avgRating={data.avgRating}
                  positivePct={data.positivePct}
                  negativePct={data.negativePct}
                  emergingIssuesCount={data.emergingIssuesCount}
                  importantThemesCount={data.importantThemesCount}
                />
              </div>

              {!data.latestReport ? (
                <div className="mt-10 rounded-lg border border-slate-200 bg-white p-8 text-center">
                  <p className="text-slate-600">
                    No analysis has run yet for this business. Click &ldquo;Run Analysis Now&rdquo; above to generate your first report.
                  </p>
                </div>
              ) : (
                <div className="mt-8 grid gap-6 lg:grid-cols-2">
                  <WhatPatientsLove items={topPositiveThemes} />
                  <WhatPatientsDislike items={topNegativeThemes} />
                  <NewThisWeek items={emergingIssues} />
                  <IssuesGettingWorse rollups={data.rollups} />
                  <Opportunities rollups={data.rollups} />
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
