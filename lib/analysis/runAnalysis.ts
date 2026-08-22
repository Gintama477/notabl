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
import { eq, and, lt } from "drizzle-orm";
import { extractReviewThemes } from "@/lib/ai/extractReview";
import { computeThemeRollups, ThemeMentionRecord } from "@/lib/ai/computeTrends";
import { generateWeeklyNarrative } from "@/lib/ai/generateReportNarrative";
import { GENERATE_NARRATIVE_PROMPT_VERSION } from "@/lib/ai/prompts/generateNarrative";
import { getAIProvider } from "@/lib/ai/provider";
import { getLatestWeeklyReport, getThemeRollupsForRun, getNewReviewsForRun } from "@/lib/db/queries";

export type RunAnalysisResult = {
  analysisRunId: string;
  // null on an INTERMEDIATE round — a round that stopped early with
  // reviewsRemaining > 0 does pure extraction and writes no report at all
  // (see needsNarrative below). Only the round that finishes the backlog
  // produces one. No caller reads this field today; it's kept because it
  // is the honest description of what the run produced.
  weeklyReportId: string | null;
  reviewsNewlyAnalyzed: number;
  // Genuinely new reviews since the last report (periodStart-periodEnd) —
  // NOT the cumulative total the report's theme rollup is built from.
  // Always 0 on an intermediate round, where it isn't computed at all.
  reviewsInPeriod: number;
  // Reviews still needing analysis with the CURRENT provider version after
  // this call — either never analyzed, or stale (analyzed by an older
  // provider/prompt version). Nonzero means the extraction loop below hit
  // its wall-clock budget before finishing; callers (app/api/analysis/run,
  // the connect-google routes) should call runAnalysisForBusiness again to
  // keep making progress. See EXTRACTION_BUDGET_MS below.
  reviewsRemaining: number;
};

// Wall-clock budget for the per-review extraction loop, not a fixed review
// count — per-call latency to the AI provider varies (DemoProvider is
// instant; real Claude calls take seconds), so a count-based cap would
// either waste headroom or still risk timing out depending on which
// provider is active.
//
// MEASURED, DO NOT RAISE WITHOUT RE-MEASURING. With this at 45s, every
// completed run in production took 56-59 seconds against the hard
// maxDuration = 60 ceiling on the calling routes (app/api/analysis/run,
// the connect-google routes) — 1 to 4 seconds of headroom. Any run with
// slightly more work than average was killed mid-flight by Vercel, left
// stranded as status "running", and swept as failed by the next attempt
// (see STALE_RUN_MS below). Those runs were not erroring; they were being
// executed to death, and surfaced to the customer as "Analysis failed."
// even though every analyzed review had been saved.
//
// The 56-59s broke down as 45s of extraction plus ~11-14s of rollup,
// narrative generation, and DB writes AFTERWARD. Two changes fixed it:
// intermediate rounds no longer generate a narrative at all (see
// needsNarrative below — that's the bigger win), and this dropped to 30s.
// Concurrency (BATCH_SIZE below) means 30s now covers more reviews than
// 45s did back when extraction was strictly sequential, so throughput
// still improves while leaving ~30s of headroom instead of ~1s.
const EXTRACTION_BUDGET_MS = 30_000;

// The round that finishes the backlog is the only one that also pays for
// the rollup, a full narrative-generation API call, and the report write
// afterward (~11-14s measured). It gets a tighter extraction budget so
// those have room inside the same 60s ceiling. Applied only to the batch
// that would actually clear the backlog; every earlier batch gets the
// full EXTRACTION_BUDGET_MS above, since nothing expensive follows it.
const FINAL_ROUND_EXTRACTION_BUDGET_MS = 20_000;

// A run is inserted as "running" and only updated at the very end. If the
// serverless function is killed mid-run (hard timeout, deploy, OOM) neither
// the success path nor the catch block gets to execute, so the row sits in
// "running" forever — invisible, and it makes the admin panel's run history
// lie about what's actually in flight. Any run still "running" past this
// threshold cannot be alive: the calling routes cap at maxDuration = 60s,
// so 10 minutes is far beyond any legitimate in-flight run. Swept at the
// start of the next run for the same business — self-healing, no cron
// needed. See also the matching red warning in /admin.
const STALE_RUN_MS = 10 * 60 * 1000;

/**
 * The single definition of "this review still needs analysis": never
 * analyzed, or analyzed by a different provider/prompt version (including
 * null on pre-tracking rows, which are stale by construction). Exported so
 * the connect routes can report what's waiting using the exact same rule
 * the extraction loop applies, rather than a second copy that could drift.
 */
export function isReviewPendingAnalysis(
  review: { analyzedAt: string | null; analyzedWith: string | null },
  currentVersion: string
): boolean {
  return !(review.analyzedAt && review.analyzedWith === currentVersion);
}

/**
 * How many of a business's reviews are waiting to be analyzed at the
 * currently-active provider version. Used by the connect routes to report
 * reviewsRemaining WITHOUT running an analysis pass themselves — see the
 * "never chain a provider call and an analysis pass" note on those routes.
 */
export async function countReviewsPendingAnalysis(businessId: string): Promise<number> {
  const provider = getAIProvider();
  const currentVersion = `${provider.name}/${provider.promptVersion}`;
  const rows = await db
    .select({ analyzedAt: reviews.analyzedAt, analyzedWith: reviews.analyzedWith })
    .from(reviews)
    .where(eq(reviews.businessId, businessId));
  return rows.filter((r) => isReviewPendingAnalysis(r, currentVersion)).length;
}

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

  // Self-heal any run for this business that was killed mid-flight and left
  // stranded in "running" (see STALE_RUN_MS). Done before inserting this
  // run's own row so it can never sweep itself.
  const staleCutoff = new Date(Date.now() - STALE_RUN_MS).toISOString();
  const stranded = await db
    .update(analysisRuns)
    .set({
      status: "failed",
      errorMessage: "Run stalled — still marked running well past any possible completion window, so it was almost certainly killed mid-run (function timeout or deploy). Marked failed automatically by the next run for this business.",
      completedAt: new Date().toISOString(),
    })
    .where(and(eq(analysisRuns.businessId, businessId), eq(analysisRuns.status, "running"), lt(analysisRuns.startedAt, staleCutoff)))
    .returning({ id: analysisRuns.id });

  if (stranded.length > 0) {
    await db.insert(automationLogs).values({
      jobName: "run-analysis",
      businessId,
      status: "failed",
      detail: `Marked ${stranded.length} stalled run(s) as failed before starting a new one: ${stranded.map((r) => r.id).join(", ")}.`,
      finishedAt: new Date().toISOString(),
    });
  }

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

    // The provider actively running right now, e.g. "demo-provider/demo-v1"
    // or "claude-sonnet/extract-v1/narrative-v3" (name/promptVersion — both
    // already exist on whatever getAIProvider() returns). Compared against
    // each review's stored analyzedWith below.
    const currentVersion = `${provider.name}/${provider.promptVersion}`;

    // analyzedAt + analyzedWith (not "does a theme_mentions row exist") is
    // the source of truth for "already processed with the current
    // provider" — a review can legitimately produce zero theme matches and
    // must still never be re-billed once it's current. A review analyzed
    // by a DIFFERENT provider/prompt version (analyzedWith mismatch,
    // including null on pre-tracking rows — always stale by construction)
    // is treated the same as never-analyzed, so switching from
    // DemoProvider to real Claude re-analyzes everything automatically,
    // and a future prompt-version bump does the same.
    const staleReviews = allBusinessReviews.filter((r) => isReviewPendingAnalysis(r, currentVersion));

    let newlyAnalyzed = 0;
    // Two distinct reasons a review can still need work after this loop,
    // deliberately counted apart even though callers only ever see their
    // sum as reviewsRemaining:
    //   - deferredForBudget: never attempted this round, because the
    //     wall-clock budget ran out. A later round WILL make progress on
    //     these, so the narrative can safely wait for it.
    //   - failedThisRound: attempted and threw (a bad AI response twice
    //     over — extractReviewThemes already retries once). Another round
    //     may well fail on these too.
    // The distinction is load-bearing: gating the narrative on the SUM
    // would mean a single permanently-failing review blocks report
    // generation forever, replacing the stall this change exists to fix
    // with a subtler one. It's gated on deferredForBudget alone instead.
    let deferredForBudget = 0;
    let failedThisRound = 0;
    const loopStartedAt = Date.now();

    // Each extractReviewThemes() call is a fully independent HTTP
    // round-trip to the AI provider — one review's text in, that review's
    // themes out — nothing about the work requires them to run one at a
    // time, it just used to. Sequential, that was ~4s/review against real
    // Claude (12-13 reviews per 45s budget window), meaning a paying
    // customer's first connect on a 400-review practice took ~27 minutes
    // before seeing a real report. BATCH_SIZE=5 is the starting point
    // specified for this fix, not yet tuned against Anthropic's actual
    // per-minute limits under real load — lower it if 429s start showing
    // up in the logs (a single 429 is separately retried once after a
    // short delay inside ClaudeProvider.callJson, lib/ai/provider.ts, but
    // that's a safety net for an occasional one, not a substitute for
    // choosing a concurrency level the account's real rate limit supports).
    const BATCH_SIZE = 5;

    for (let i = 0; i < staleReviews.length; i += BATCH_SIZE) {
      // The batch that would clear the backlog is the one the narrative
      // runs after, so it has to clear a tighter bar to leave that room.
      // If it doesn't, we stop here instead: this round stays
      // extraction-only and the next one picks up a small remainder plus
      // the narrative, comfortably inside the ceiling either way.
      const isFinishingBatch = i + BATCH_SIZE >= staleReviews.length;
      const budgetMs = isFinishingBatch ? FINAL_ROUND_EXTRACTION_BUDGET_MS : EXTRACTION_BUDGET_MS;

      // Budget checked BETWEEN batches, not mid-batch — every review in an
      // in-flight batch is let finish so none is left half-processed
      // (stale mentions deleted but fresh ones never written). Whatever
      // hasn't been attempted yet when the budget runs out is reported as
      // reviewsRemaining, same as the old per-review check did one at a
      // time.
      if (Date.now() - loopStartedAt > budgetMs) {
        deferredForBudget += staleReviews.length - i;
        break;
      }

      const batch = staleReviews.slice(i, i + BATCH_SIZE);
      // allSettled, not all: one review's extraction failing (a bad AI
      // response, a transient network error) must not discard the other
      // up-to-4 reviews' completed work in the same batch. A failed review
      // simply stays un-analyzed — analyzedAt/analyzedWith is never
      // touched for it — and gets picked up by the next run automatically,
      // the same resumable design that already handles a budget cutoff.
      const outcomes = await Promise.allSettled(batch.map((review) => analyzeOneReview(review, currentVersion, run.id)));

      for (const outcome of outcomes) {
        if (outcome.status === "fulfilled") {
          newlyAnalyzed++;
        } else {
          console.error("Review extraction failed, will retry next run:", outcome.reason);
          failedThisRound++;
        }
      }
    }

    const reviewsRemaining = deferredForBudget + failedThisRound;

    // INTERMEDIATE ROUND: extraction stopped early with work left over, so
    // the caller (RunAnalysisButton / ConnectReviewsCard / the admin form)
    // is about to call straight back for another round. Everything below
    // this point — two full mention scans, the rollup, a narrative
    // generation API call, and a weeklyReports insert — would be thrown
    // away moments later when the next round recomputes it against more
    // data. That waste is what pushed runs from ~45s to 56-59s against a
    // 60s ceiling and got them killed mid-flight (see
    // EXTRACTION_BUDGET_MS). Intermediate rounds are pure extraction now:
    // they bank every analyzed review, mark themselves completed, and
    // report reviewsRemaining so the loop continues.
    //
    // The dashboard keeps showing the PREVIOUS report while this is in
    // flight, which is the existing, correct behavior — a customer mid
    // re-analysis sees their last good report rather than a half-built one.
    //
    // Gated on deferredForBudget, NOT reviewsRemaining — see their
    // declarations above. If the only thing left is reviews that actively
    // failed, another round won't reliably clear them, so we fall through
    // and build the report from everything that DID succeed rather than
    // withholding it indefinitely. (That repeat case stays cheap: the next
    // round analyzes nothing new, so the cost-control reuse check further
    // down matches the unchanged rollup and skips narrative generation.)
    if (deferredForBudget > 0) {
      await db
        .update(analysisRuns)
        .set({ status: "completed", reviewsAnalyzedCount: newlyAnalyzed, completedAt: new Date().toISOString() })
        .where(eq(analysisRuns.id, run.id));

      await db.insert(automationLogs).values({
        jobName: "run-analysis",
        businessId,
        status: "success",
        detail: `Run ${run.id} completed extraction only: ${newlyAnalyzed} newly analyzed, ${reviewsRemaining} still remaining. No narrative generated — that runs once, on the round that finishes the backlog.`,
        finishedAt: new Date().toISOString(),
      });

      return {
        analysisRunId: run.id,
        weeklyReportId: null,
        reviewsNewlyAnalyzed: newlyAnalyzed,
        reviewsInPeriod: 0,
        reviewsRemaining,
      };
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
    // ALSO restricted to analyzedWith === currentVersion — a review still
    // carrying mentions from an older provider/prompt version (e.g. the
    // pre-Claude keyword matcher) contributes NOTHING to the rollup, rather
    // than being silently blended in as if it were equivalent data. That
    // blending is exactly how a keyword matcher's false "negative" on
    // "never a long wait" ended up counted alongside real Claude's correct
    // sentiment for the same theme. Counts will be smaller than the
    // business's total review count during a re-analysis migration —
    // that's correct and honest, not a bug: see mentionsForReviews below.
    const currentReviewIds = allBusinessReviews
      .filter((r) => new Date(r.reviewDate) < periodEnd && r.analyzedWith === currentVersion)
      .map((r) => r.id);
    const priorReviewIds = allBusinessReviews
      .filter((r) => new Date(r.reviewDate) < periodStart && r.analyzedWith === currentVersion)
      .map((r) => r.id);

    const currentMentions = await mentionsForReviews(currentReviewIds);
    const priorMentions = await mentionsForReviews(priorReviewIds);

    const rollups = computeThemeRollups(currentMentions, priorMentions);

    // Regression guard, not an active check: rollup counts are computed
    // directly FROM currentMentions above, so in correct code this can
    // never fire. Its only job is to catch a future change that decouples
    // the two again (e.g. someone re-widening mentionsForReviews to pull
    // unfiltered mentions) — turning that into a loud automation_logs
    // warning instead of a silent contradiction between the dashboard's
    // numbers and its quotes, which is exactly how this bug went unnoticed.
    for (const r of rollups) {
      const hasCurrentNegative = currentMentions.some((m) => m.category === r.category && m.sentiment === "negative");
      const hasCurrentPositive = currentMentions.some((m) => m.category === r.category && m.sentiment === "positive");
      if ((r.negativeCount > 0) !== hasCurrentNegative || (r.positiveCount > 0) !== hasCurrentPositive) {
        await db.insert(automationLogs).values({
          jobName: "run-analysis",
          businessId,
          status: "warning",
          detail: `Rollup/mention mismatch for theme "${r.category}" on run ${run.id}: negativeCount=${r.negativeCount} (current mentions say ${hasCurrentNegative}), positiveCount=${r.positiveCount} (current mentions say ${hasCurrentPositive}). This should never happen — see the currentMentions-derived guard in runAnalysisForBusiness.`,
          finishedAt: new Date().toISOString(),
        });
      }
    }

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
    // recent report AND that report's text was written under the CURRENT
    // narrative wording rules, nothing has actually changed since it was
    // generated — reuse it instead of paying for another narrative
    // generation call. This is the realistic "regenerate unnecessarily"
    // case: someone clicking "Run Analysis Now" more than once in a row, or
    // a cron re-running before any new reviews exist. Exact period-boundary
    // matching isn't used here on purpose (two clicks a few seconds apart
    // get slightly different "now" timestamps) — comparing the actual
    // theme counts is what genuinely proves nothing changed.
    //
    // THE narrativeVersion CHECK IS LOAD-BEARING. This skip exists to avoid
    // paying for an IDENTICAL narrative, and must never suppress a
    // narrative whose WORDING RULES have changed. Without it, three
    // consecutive correct wording fixes appeared to do nothing in
    // production: a wording change never alters theme counts, so this
    // branch fired every time and handed back a report whose stored text
    // was written weeks earlier under the old rules. Regenerating on a
    // version mismatch costs exactly one narrative call — not a
    // re-extraction — so the cost-control intent is fully preserved.
    if (newlyAnalyzed === 0) {
      const previousReport = await getLatestWeeklyReport(businessId);
      if (previousReport) {
        const previousRollups = await getThemeRollupsForRun(previousReport.analysisRunId);
        const narrativeIsCurrent = previousReport.narrativeVersion === GENERATE_NARRATIVE_PROMPT_VERSION;
        if (narrativeIsCurrent && rollupsAreEquivalent(previousRollups, rollups)) {
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
            reviewsRemaining,
          };
        }
      }
    }

    // No period label is passed — there is no reporting period under the
    // cumulative model, and the string that used to be built here from
    // periodStart/periodEnd was what put raw ISO dates and internal
    // snapshot bookkeeping into the customer-facing executive summary.
    // currentReviewIds.length is the cumulative count the narrative
    // describes, not just what's new since last time.
    const narrative = await generateWeeklyNarrative(rollups, currentReviewIds.length, businessName);

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
        opportunitiesJson: JSON.stringify(narrative.opportunities),
        changesFromLastPeriodJson: JSON.stringify(narrative.changesFromLastPeriod),
        recommendedActionsJson: JSON.stringify(narrative.recommendedActions),
        // Stamps the wording rules this text was written under, so the
        // cost-control reuse check above can tell a still-current report
        // apart from one that only LOOKS unchanged because its theme counts
        // happen to match.
        narrativeVersion: GENERATE_NARRATIVE_PROMPT_VERSION,
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
      reviewsRemaining,
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

// One review's worth of extraction work — delete stale mentions, extract,
// write fresh mentions plus the analyzedAt/analyzedWith stamp. Pulled out
// of the batch loop above so Promise.allSettled there can run several of
// these concurrently: each call only ever touches ITS OWN review's rows
// (delete/insert on review_theme_mentions scoped by reviewId, update on
// reviews scoped by id), so nothing here needs to coordinate with any
// other in-flight call — safe to run in parallel by construction, not
// just in practice. Throws on failure (extraction error, malformed
// response) rather than swallowing it; the caller's allSettled is what
// isolates one review's failure from the rest of its batch.
async function analyzeOneReview(review: typeof reviews.$inferSelect, currentVersion: string, analysisRunId: string): Promise<void> {
  // Delete any existing mentions before inserting fresh ones. Required
  // whenever this is a RE-analysis (the review already has
  // review_theme_mentions rows from a prior, now-stale, provider version)
  // — without this, every theme gets counted twice and the rollups
  // silently double. A harmless no-op (0 rows) the first time a review is
  // ever analyzed.
  await db.delete(reviewThemeMentions).where(eq(reviewThemeMentions.reviewId, review.id));

  const extraction = await extractReviewThemes(review.reviewText, review.rating);

  if (extraction.themes.length > 0) {
    await db.insert(reviewThemeMentions).values(
      extraction.themes.map((t) => ({
        reviewId: review.id,
        analysisRunId,
        themeCategory: t.category,
        sentiment: t.sentiment,
        severity: t.severity,
        confidence: t.confidence,
        excerpt: t.excerpt ?? null,
      }))
    );
  }

  await db
    .update(reviews)
    .set({ analyzedAt: new Date().toISOString(), analyzedWith: currentVersion })
    .where(eq(reviews.id, review.id));
}

// Given a set of review ids, returns their theme mentions. Callers are
// responsible for restricting reviewIds to reviews whose analyzedWith
// already matches the CURRENT provider/prompt version (see
// currentReviewIds/priorReviewIds above) — this function trusts that and
// does not re-check it itself, so passing an unfiltered id set here would
// silently blend stale-provider mentions back into the rollup, which is
// the exact bug this version-filtering exists to prevent.
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
