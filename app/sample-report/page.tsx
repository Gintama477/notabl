import { notFound } from "next/navigation";
import { PrimaryCta } from "@/components/marketing/PrimaryCta";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import {
  getSampleBusiness,
  getLatestWeeklyReport,
  getSampleReviewsForRun,
  getThemeExcerptsForBusiness,
  getReviewCountForBusiness,
} from "@/lib/db/queries";
import { ReportBody } from "@/components/report/ReportBody";
import { SampleReportView } from "@/components/marketing/SampleReportView";

export const metadata = {
  title: "Sample Report — Notabl",
  description: "See exactly what a Notabl report looks like, using demo review data for a sample dental practice.",
};

// Force dynamic rendering rather than static prerendering: this page reads
// the sample business's latest weekly report from the database, and should
// reflect a re-run of scripts/seed.ts without requiring a full rebuild.
export const dynamic = "force-dynamic";

export default async function SampleReportPage() {
  const business = await getSampleBusiness();
  if (!business) notFound();

  const report = await getLatestWeeklyReport(business.id);
  if (!report) notFound();

  const sampleReviews = await getSampleReviewsForRun(business.id, report.periodStart, report.periodEnd);
  // Real quotes from the demo dataset, going through the same pipeline as a
  // paying customer's — no allReviewsHref, since this public page has no
  // dashboard to link to. Business-scoped (see getThemeExcerptsForBusiness):
  // this permanent demo business's reviews are all analyzed by the
  // demo-keyword provider, which is correctly treated as "current" for it
  // specifically, even once real Claude is live for other, real businesses.
  const excerptsByTheme = await getThemeExcerptsForBusiness(business.id, 3);
  const totalReviews = await getReviewCountForBusiness(business.id);

  return (
    <>
      <Header />
      <SampleReportView />
      <main className="flex-1 bg-slate-50 py-10">
        <div className="mx-auto max-w-3xl px-6">
          <div className="mb-6 rounded-lg border border-teal-200 bg-teal-50 p-5">
            <p className="text-sm text-teal-900">
              This is a real Notabl report generated from a <strong>demo review dataset</strong> for a
              fictional practice, &ldquo;Brightview Family Dental&rdquo; — so you can see exactly what you&apos;ll get. No
              signup required to view it.
            </p>
            <PrimaryCta className="mt-3 inline-block rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800" />
          </div>
          <ReportBody
            businessName={business.name}
            report={report}
            sampleReviews={sampleReviews}
            totalReviews={totalReviews}
            excerptsByTheme={excerptsByTheme}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
