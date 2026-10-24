import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ReportBody } from "@/components/report/ReportBody";
import { getProspectReportByToken, recordProspectReportView } from "@/lib/outreach/prospectReport";
import { getSampleReviewsForRun, getThemeExcerptsForBusiness, getReviewCountForBusiness } from "@/lib/db/queries";
import { track } from "@/lib/analytics/track";

// Public, unauthenticated, unguessable-token page: the report built from a
// prospect's own public Google reviews, linked from the report-first
// outreach email (lib/outreach/prospectReport.ts). Never indexed.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const data = await getProspectReportByToken(token);
  return {
    title: data ? `${data.business.name} — review report (Notabl)` : "Report",
    robots: { index: false, follow: false },
  };
}

export default async function ProspectReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getProspectReportByToken(token);
  if (!data) notFound();
  const { prospect, business, report } = data;

  await recordProspectReportView(prospect.id);
  await track("prospect_report_viewed", { businessId: business.id, properties: { prospectId: prospect.id } });

  const sampleReviews = await getSampleReviewsForRun(business.id, report.periodStart, report.periodEnd);
  const excerptsByTheme = await getThemeExcerptsForBusiness(business.id, 3);
  const totalReviews = await getReviewCountForBusiness(business.id);
  const builtOn = prospect.reportBuiltAt
    ? new Date(prospect.reportBuiltAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <main className="min-h-screen bg-slate-50 py-10">
      <div className="mx-auto max-w-3xl px-6">
        <div className="mb-6 rounded-lg border border-teal-200 bg-teal-50 p-5 text-sm text-teal-900">
          <p>
            <strong>Prepared for {business.name}</strong>
            {builtOn ? ` on ${builtOn}` : ""}, from its {prospect.reportReviewCount ?? totalReviews} newest public Google
            reviews. Notabl is not affiliated with {business.name}; this page was built so you can see what the tool
            does on your own reviews, and it is private to this link.
          </p>
          <p className="mt-2">
            Want this kept up to date every week, with alerts when a new complaint shows up?{" "}
            <Link href="/pricing" className="font-medium underline">
              See pricing
            </Link>
            . Want this page removed? Reply &ldquo;remove&rdquo; to the email that brought you here.
          </p>
        </div>
        <ReportBody
          businessName={business.name}
          report={report}
          sampleReviews={sampleReviews}
          totalReviews={totalReviews}
          excerptsByTheme={excerptsByTheme}
          hideChanges
        />
        <p className="mt-8 text-center text-xs text-slate-400">
          Built by Notabl from public Google reviews. Themes and quotes are drawn from the reviews themselves; AI-written
          summaries can be imperfect.
        </p>
      </div>
    </main>
  );
}
