import { redirect, notFound } from "next/navigation";
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
  // See the matching comment in app/dashboard/page.tsx — stripeSubscriptionId
  // is the real "did checkout actually happen" signal, not subscription.status.
  const hasStartedSubscription = subscription?.stripeSubscriptionId != null;

  return (
    <>
      <Header />
      {hasDemoData && <DemoDataBanner showSubscriptionCta={!hasStartedSubscription} />}
      <WeeklyReportView businessId={business.id} />
      <main className="flex-1 bg-slate-50 py-10">
        <div className="mx-auto max-w-3xl px-6">
          <ReportBody businessName={business.name} report={report} sampleReviews={sampleReviews} />
        </div>
      </main>
      <Footer />
    </>
  );
}
