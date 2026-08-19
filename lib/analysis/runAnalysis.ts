// Orchestrates the full 3-stage pipeline for one business:
//   1. extractReviewThemes() per review (only reviews not already analyzed —
//      see docs/ARCHITECTURE.md §18 cost control)
//   2. computeThemeRollups() — current period vs. prior period, pure code
//   3. generateWeeklyNarrative() — narrative from the verified rollup only
//
// Used by the Phase 1 manual "Run analysis now" button (app/api/analysis/run)
// and, from Phase 2 onward, by the weekly cron job — same function either way.

import { db } from "@/lib/db/client";
import { reviews, reviewThemeMentions, analysisRuns, themeRollups, weeklyReports, automationLogs } from "@/lib/db/schema.pg";
import { eq } from "drizzle-orm";
import { extractReviewThemes } from "@/lib/ai/extractReview";
import { computeThemeRollups, ThemeMentionRecord } from "@/lib/ai/computeTrends";
import { generateWeeklyNarrative } from "@/lib/ai/generateReportNarrative";
import { getAIProvider } from "@/lib/ai/provider";
import { getLatestWeeklyReport, getThemeRollupsForRun, getNewReviewsForRun } from "@/lib/db/queries";

export type RunAnalysisResult = {
  analysisRunId: string;
  weeklyReportId: string;
  reviewsNewlyAnalyzed: number;
  // Genuinely new reviews since the last report (periodStart-periodEnd) —
  // NOT the cumulative total the report's theme rollup is built from.
  reviewsInPeriod: number;
};

export async function runAnalysisForBusiness(
  businessId: string,
  businessName: string,
  periodEndISO: string,
  periodLengthDays = 7
): Promise<RunAnalysisResult> {
  const periodEnd = new Date(periodEndISO);
  const periodStart = new Date(periodEnd);
  periodStart.setUTCDate(periodStart.getUTCDate() - periodLengthDays);

  const startedAt = new Date().toISOString();
  const provider = getAIProvider();

  const [run] = await db
    .insert(analysisRuns)
    .values({
      businessId,
      runType: "manual",
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      status: "running",
      aiModelUsed: provider.name,
      promptVersion: provider.promptVersion,
      startedAt,
    })
    .returning();

  await db.insert(automationLogs).values({
    jobName: "run-analysis",
    businessId,
    status: "retried", // placeholder start marker; updated below on completion
    detail: `Started analysis run ${run.id} for period ${periodStart.toISOString()} - ${periodEnd.toISOString()}`,
  });

  try {
    // Every review for the business, regardless of date — needed both for
    // the extraction loop below (any never-analyzed review, whatever its
    // date, so a brand-new signup's dashboard reflects everything imported,
    // not just the last 7 days — cost control, see docs/ARCHITECTURE.md
    // §18) and to build this run's cumulative mention windows further down.
    const allBusinessReviews = await db.select().from(reviews).where(eq(reviews.businessId, businessId));

    let newlyAnalyzed = 0;

    for (const review of allBusinessReviews) {
      // analyzedAt (not "does a theme_mentions row exist") is the source of
      // truth for "already processed" — a review can legitimately produce
      // zero theme matches and must still never be re-billed on the next run.
      if (review.analyzedAt) continue;

      const extraction = await extractReviewThemes(review.reviewText, review.rating);
      newlyAnalyzed++;

      if (extraction.themes.length > 0) {
        await db.insert(reviewThemeMentions).values(
          extraction.themes.map((t) => ({
            reviewId: review.id,
            analysisRunId: run.id,
            themeCategory: t.category,
            sentiment: t.sentiment,
            severity: t.severity,
            confidence: t.confidence,
            excerpt: t.excerpt ?? null,
          }))
        );
      }

      await db.update(reviews).set({ analyzedAt: new Date().toISOString() }).where(eq(reviews.id, review.id));
    }

    // Cumulative model: every report's theme rollup reflects the business's
    // FULL review history to date, not a narrow weekly slice — a normal
    // practice getting only a handful of new reviews a week would otherwise
    // produce a near-empty report every single time. currentMentions is
    // every theme mention for reviews up to periodEnd (no lower bound);
    // priorMentions is the cumulative snapshot as it stood one period ago
    // (up to periodStart) — the trend comparison is "running total now" vs.
    // "running total then," which stays meaningful even on a quiet week. A
    // theme with mentions now and none in that prior snapshot naturally
    // shows as "new" (see computeThemeRollups's trendDirection logic) —
    // including, correctly, every theme on a business's very first-ever
    // report, when priorMentions is empty because nothing existed yet one
    // period ago. No special-casing needed for that case.
    const currentReviewIds = allBusinessReviews.filter((r) => new Date(r.reviewDate) < periodEnd).map((r) => r.id);
    const priorReviewIds = allBusinessReviews.filter((r) => new Date(r.reviewDate) < periodStart).map((r) => r.id);

    const currentMentions = await mentionsForReviews(currentReviewIds);
    const priorMentions = await mentionsForReviews(priorReviewIds);

    const rollups = computeThemeRollups(currentMentions, priorMentions);

    // The literal "what came in since last time" list — deliberately
    // separate from the cumulative rollup above, and allowed to be
    // genuinely, honestly empty on a quiet week (see getNewReviewsForRun).
    const newReviewsThisPeriod = await getNewReviewsForRun(businessId, periodStart.toISOString(), periodEnd.toISOString());

    if (rollups.length > 0) {
      await db.insert(themeRollups).values(
        rollups.map((r) => ({
          businessId,
          analysisRunId: run.id,
          themeCategory: r.category,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          mentionCount: r.mentionCount,
          positiveCount: r.positiveCount,
          negativeCount: r.negativeCount,
          neutralCount: r.neutralCount,
          trendDirection: r.trendDirection,
          pctChangeVsPrior: r.pctChangeVsPrior,
        }))
      );
    }

    // Cost control: if no reviews were newly analyzed AND the freshly
    // computed rollup is identical to the one behind the business's most
    // recent report, nothing has actually changed since that report was
    // generated — reuse it instead of paying for another narrative
    // generation call. This is the realistic "regenerate unnecessarily"
    // case: someone clicking "Run Analysis Now" more than once in a row, or
    // a cron re-running before any new reviews exist. Exact period-boundary
    // matching isn't used here on purpose (two clicks a few seconds apart
    // get slightly different "now" timestamps) — comparing the actual
    // theme counts is what genuinely proves nothing changed.
    if (newlyAnalyzed === 0) {
      const previousReport = await getLatestWeeklyReport(businessId);
      if (previousReport) {
        const previousRollups = await getThemeRollupsForRun(previousReport.analysisRunId);
        if (rollupsAreEquivalent(previousRollups, rollups)) {
          await db
            .update(analysisRuns)
            .set({ status: "completed", reviewsAnalyzedCount: 0, completedAt: new Date().toISOString() })
            .where(eq(analysisRuns.id, run.id));

          await db.insert(automationLogs).values({
            jobName: "run-analysis",
            businessId,
            status: "success",
            detail: `Run ${run.id} skipped narrative regeneration — no new reviews and theme counts unchanged from report ${previousReport.id}. Reused existing report (cost control, see docs/ARCHITECTURE.md §18).`,
            finishedAt: new Date().toISOString(),
          });

          return {
            analysisRunId: run.id,
            weeklyReportId: previousReport.id,
            reviewsNewlyAnalyzed: 0,
            reviewsInPeriod: newReviewsThisPeriod.length,
          };
        }
      }
    }

    // Cumulative framing, matching what the narrative is actually being
    // asked to describe: the business's full history to date, not a narrow
    // week — totalReviews below is the cumulative count, not just what's
    // new since last time.
    const periodLabel = `full history through ${periodEnd.toISOString().slice(0, 10)} (compared with the snapshot as of ${periodStart.toISOString().slice(0, 10)})`;
    const narrative = await generateWeeklyNarrative(rollups, currentReviewIds.length, periodLabel, businessName);

    const [report] = await db
      .insert(weeklyReports)
      .values({
        businessId,
        analysisRunId: run.id,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        executiveSummary: narrative.executiveSummary,
        topPositiveThemesJson: JSON.stringify(narrative.topPositiveThemes),
        topNegativeThemesJson: JSON.stringify(narrative.topNegativeThemes),
        emergingIssuesJson: JSON.stringify(narrative.emergingIssues),
        changesFromLastPeriodJson: JSON.stringify(narrative.changesFromLastPeriod),
        recommendedActionsJson: JSON.stringify(narrative.recommendedActions),
        status: "draft",
      })
      .returning();

    await db
      .update(analysisRuns)
      .set({
        status: "completed",
        reviewsAnalyzedCount: newlyAnalyzed,
        completedAt: new Date().toISOString(),
      })
      .where(eq(analysisRuns.id, run.id));

    await db.insert(automationLogs).values({
      jobName: "run-analysis",
      businessId,
      status: "success",
      detail: `Completed run ${run.id}: ${newlyAnalyzed} newly analyzed, ${newReviewsThisPeriod.length} new this period, ${currentReviewIds.length} total reviews reflected in this report.`,
      finishedAt: new Date().toISOString(),
    });

    return {
      analysisRunId: run.id,
      weeklyReportId: report.id,
      reviewsNewlyAnalyzed: newlyAnalyzed,
      reviewsInPeriod: newReviewsThisPeriod.length,
    };
  } catch (err) {
    await db
      .update(analysisRuns)
      .set({
        status: "failed",
        errorMessage: String(err),
        completedAt: new Date().toISOString(),
      })
      .where(eq(analysisRuns.id, run.id));

    await db.insert(automationLogs).values({
      jobName: "run-analysis",
      businessId,
      status: "failed",
      detail: String(err),
      finishedAt: new Date().toISOString(),
    });

    throw err;
  }
}

async function mentionsForReviews(reviewIds: string[]): Promise<ThemeMentionRecord[]> {
  if (reviewIds.length === 0) return [];
  const rows = await db.select().from(reviewThemeMentions);
  // Filtering in JS (dataset is small at this scale) rather than a large IN
  // clause builder — fine for Phase 1 volumes; revisit if a business has
  // thousands of reviews per period.
  const idSet = new Set(reviewIds);
  return rows
    .filter((m) => idSet.has(m.reviewId))
    .map((m) => ({
      category: m.themeCategory as ThemeMentionRecord["category"],
      sentiment: m.sentiment as ThemeMentionRecord["sentiment"],
    }));
}

// Compares a freshly computed rollup against the stored rollup rows behind
// a previous report, by category + mention counts only (not trend/pctChange,
// which are relative to a "prior period" window that shifts slightly between
// two runs a few minutes apart even when the underlying reviews haven't).
// Order-independent.
function rollupsAreEquivalent(
  stored: { themeCategory: string; mentionCount: number; positiveCount: number; negativeCount: number; neutralCount: number }[],
  fresh: { category: string; mentionCount: number; positiveCount: number; negativeCount: number; neutralCount: number }[]
): boolean {
  if (stored.length !== fresh.length) return false;
  const key = (c: string, m: number, p: number, n: number, u: number) => `${c}:${m}:${p}:${n}:${u}`;
  const storedKeys = new Set(stored.map((r) => key(r.themeCategory, r.mentionCount, r.positiveCount, r.negativeCount, r.neutralCount)));
  const freshKeys = new Set(fresh.map((r) => key(r.category, r.mentionCount, r.positiveCount, r.negativeCount, r.neutralCount)));
  if (storedKeys.size !== freshKeys.size) return false;
  for (const k of storedKeys) {
    if (!freshKeys.has(k)) return false;
  }
  return true;
}
