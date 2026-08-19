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
import { and, eq, gte, lt, asc } from "drizzle-orm";
import { extractReviewThemes } from "@/lib/ai/extractReview";
import { computeThemeRollups, ThemeMentionRecord } from "@/lib/ai/computeTrends";
import { generateWeeklyNarrative } from "@/lib/ai/generateReportNarrative";
import { getAIProvider } from "@/lib/ai/provider";
import { getLatestWeeklyReport, getThemeRollupsForRun } from "@/lib/db/queries";

export type RunAnalysisResult = {
  analysisRunId: string;
  weeklyReportId: string;
  reviewsNewlyAnalyzed: number;
  reviewsInPeriod: number;
};

export async function runAnalysisForBusiness(
  businessId: string,
  businessName: string,
  periodEndISO: string,
  periodLengthDays = 7,
  options?: { fullBackfill?: boolean }
): Promise<RunAnalysisResult> {
  const periodEnd = new Date(periodEndISO);
  let periodStart: Date;
  let priorPeriodStart: Date;

  if (options?.fullBackfill) {
    // A business's very first real report should summarize everything
    // imported so far, not just the last periodLengthDays — an established
    // practice's Google reviews are almost always spread across years, so a
    // plain 7-day window looks empty right after connecting even though
    // every review was genuinely read by the AI extraction loop below.
    // periodStart is the actual earliest review on file, queried, not
    // guessed/hardcoded.
    const [earliest] = await db
      .select({ reviewDate: reviews.reviewDate })
      .from(reviews)
      .where(eq(reviews.businessId, businessId))
      .orderBy(asc(reviews.reviewDate))
      .limit(1);
    periodStart = earliest ? new Date(earliest.reviewDate) : new Date(periodEnd);
    if (!earliest) periodStart.setUTCDate(periodStart.getUTCDate() - periodLengthDays);

    // There's no meaningful "prior period" to compare against on a first
    // report. Setting priorPeriodStart equal to periodStart makes the
    // prior-period window below zero-width, so priorPeriodReviews (and in
    // turn priorMentions passed into computeThemeRollups) comes back empty
    // on its own — every theme correctly shows as newly appearing rather
    // than being compared against a window that doesn't represent anything
    // real, without needing a separate code path for the rollup call.
    priorPeriodStart = new Date(periodStart);
  } else {
    periodStart = new Date(periodEnd);
    periodStart.setUTCDate(periodStart.getUTCDate() - periodLengthDays);
    priorPeriodStart = new Date(periodStart);
    priorPeriodStart.setUTCDate(priorPeriodStart.getUTCDate() - periodLengthDays);
  }

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
    // Reviews touching either period (needed for the trend comparison).
    const allReviewsInRange = await db
      .select()
      .from(reviews)
      .where(
        and(
          eq(reviews.businessId, businessId),
          gte(reviews.reviewDate, priorPeriodStart.toISOString()),
          lt(reviews.reviewDate, periodEnd.toISOString())
        )
      );

    // Every review for the business that has never been analyzed, regardless
    // of period — this is what makes the *first* run a full backfill (so a
    // brand-new signup's dashboard reflects all of their imported reviews,
    // not just the last 14 days) while later runs only pay to analyze
    // whatever is genuinely new (cost control, see docs/ARCHITECTURE.md §18).
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

    // Re-fetch every mention for reviews in range (covers ones analyzed by
    // this run AND ones analyzed previously) to build the rollup.
    const currentPeriodReviews = allReviewsInRange.filter(
      (r) => new Date(r.reviewDate) >= periodStart && new Date(r.reviewDate) < periodEnd
    );
    const priorPeriodReviews = allReviewsInRange.filter(
      (r) => new Date(r.reviewDate) >= priorPeriodStart && new Date(r.reviewDate) < periodStart
    );

    const currentMentions = await mentionsForReviews(currentPeriodReviews.map((r) => r.id));
    const priorMentions = await mentionsForReviews(priorPeriodReviews.map((r) => r.id));

    const rollups = computeThemeRollups(currentMentions, priorMentions);

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
            reviewsInPeriod: currentPeriodReviews.length,
          };
        }
      }
    }

    const periodLabel = `${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}`;
    const narrative = await generateWeeklyNarrative(rollups, currentPeriodReviews.length, periodLabel, businessName);

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
      detail: `Completed run ${run.id}: ${newlyAnalyzed} newly analyzed, ${currentPeriodReviews.length} in current period.`,
      finishedAt: new Date().toISOString(),
    });

    return {
      analysisRunId: run.id,
      weeklyReportId: report.id,
      reviewsNewlyAnalyzed: newlyAnalyzed,
      reviewsInPeriod: currentPeriodReviews.length,
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
