// Seeds the permanent public "sample" business used by /sample-report (no
// signup required) and runs the analysis pipeline once so its weekly report
// exists ahead of time. Safe to re-run — createAccountWithDemoBusiness reuses
// an existing account by email instead of duplicating data.
//
// Run: npm run seed

import "dotenv/config"; // load .env — unlike `next dev`/`next build`, a
// standalone tsx script doesn't get Next.js's automatic .env loading.
import { createAccountWithDemoBusiness, SAMPLE_REPORT_ACCOUNT_EMAIL } from "../lib/db/queries";
import { runAnalysisForBusiness } from "../lib/analysis/runAnalysis";
import { db } from "../lib/db/client";
import { reviews, reviewThemeMentions, analysisRuns, themeRollups, weeklyReports } from "../lib/db/schema.pg";
import { eq } from "drizzle-orm";

async function main() {
  const { business, reused } = await createAccountWithDemoBusiness({
    businessName: "Brightview Family Dental",
    website: "https://www.brightviewfamilydental.example",
    city: "Austin",
    state: "TX",
    reviewProfileLinks: "",
    email: SAMPLE_REPORT_ACCOUNT_EMAIL,
  });

  if (!business) throw new Error("Failed to create/find sample business");

  console.log(`Sample business: ${business.id} (${reused ? "existing" : "newly created"})`);

  // If re-running against an existing sample business, clear its prior
  // analysis so the report reflects "now" rather than stacking duplicate runs.
  // Critically, also reset analyzedAt on its reviews — runAnalysisForBusiness
  // treats analyzedAt as "already processed and safe to skip" (cost control),
  // so without this reset, deleting the old review_theme_mentions rows above
  // would leave the reviews permanently un-re-extractable: the next run would
  // report reviewsNewlyAnalyzed: 0, produce zero rollups, and the sample
  // report would silently fall back to generic filler text instead of the
  // specific, data-backed recommendations required for a credible demo.
  if (reused) {
    const priorRuns = await db.select({ id: analysisRuns.id }).from(analysisRuns).where(eq(analysisRuns.businessId, business.id));
    for (const run of priorRuns) {
      await db.delete(themeRollups).where(eq(themeRollups.analysisRunId, run.id));
      await db.delete(weeklyReports).where(eq(weeklyReports.analysisRunId, run.id));
      await db.delete(reviewThemeMentions).where(eq(reviewThemeMentions.analysisRunId, run.id));
    }
    await db.delete(analysisRuns).where(eq(analysisRuns.businessId, business.id));
    await db.update(reviews).set({ analyzedAt: null }).where(eq(reviews.businessId, business.id));
  }

  const result = await runAnalysisForBusiness(business.id, business.name, new Date().toISOString());
  console.log("Analysis complete:", result);
  console.log(`Sample business id (for app/sample-report/page.tsx): ${business.id}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
