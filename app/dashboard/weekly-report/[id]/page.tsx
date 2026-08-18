import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSessionAccountId } from "@/lib/auth/session";
import {
  getBusinessForAccount,
  getWeeklyReportById,
  getSampleReviewsForRun,
  getDashboardData,
  getSubscriptionForAccount,
} from "@/lib/db/queries";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { BfcacheGuard } from "@/components/BfcacheGuard";
import { DemoDataBanner } from "@/components/dashboard/DemoDataBanner";
import { ReportBody } from "@/components/report/ReportBody";
import { WeeklyReportView } from "@/components/dashboard/WeeklyReportView";

export default async function WeeklyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const accountId = await getSessionAccountId();
  if (!accountId) redirect("/signup");

  const business = await getBusinessForAccount(accountId);
  if (!business) redirect("/signup");

  const report = await getWeeklyReportById(id);
  if (!report || report.businessId !== business.id) notFound();

  const sampleReviews = await getSampleReviewsForRun(business.id, report.periodStart, report.periodEnd);
  const { hasDemoData } = await getDashboardData(business.id);
  const subscription = await getSubscriptionForAccount(accountId);
  // See the matching comment in app/dashboard/page.tsx — based on
  // subscription.status alone, not stripeSubscriptionId, which can be null
  // on a genuinely trialing/active row (an incomplete reconciliation) and
  // shouldn't be a second point of failure on top of status.
  const hasStartedSubscription = subscription != null && subscription.status !== "none";
  const isActiveOrTrialing = subscription?.status === "active" || subscription?.status === "trialing";
  // Same gap this closes on the main dashboard (app/dashboard/page.tsx) —
  // without this, a canceled/past_due account could still view a real
  // report directly by URL even though the dashboard itself hides it.
  // Purely a display-time check; the report row itself is untouched.
  const subscriptionInactive = !hasDemoData && !isActiveOrTrialing;

  return (
    <>
      <BfcacheGuard />
      <Header />
      {hasDemoData && <DemoDataBanner showSubscriptionCta={!hasStartedSubscription} />}
      <WeeklyReportView businessId={business.id} />
      <main className="flex-1 bg-slate-50 py-10">
        <div className="mx-auto max-w-3xl px-6">
          {subscriptionInactive ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-8 text-center">
              <p className="text-slate-700">Your subscription is inactive. Reactivate to see your real report.</p>
              <Link
                href="/billing"
                className="mt-4 inline-block rounded-md bg-teal-700 px-6 py-2.5 text-sm font-medium text-white hover:bg-teal-800"
              >
                Reactivate Subscription
              </Link>
            </div>
          ) : (
            <ReportBody businessName={business.name} report={report} sampleReviews={sampleReviews} />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
