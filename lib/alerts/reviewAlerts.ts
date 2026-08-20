// Core logic behind the daily triggered-alert cron (app/api/cron/check-reviews/route.ts)
// — replaces the old calendar-scheduled weekly report. A scheduled report
// fires regardless of whether anything happened; a practice getting a
// handful of reviews a week mostly got "nothing notable this period,"
// which teaches the customer the product is worthless. This module instead
// syncs, decides whether there's genuinely something worth telling the
// owner, and sends AT MOST one bundled email per business per day.
// Silence is the correct, expected output on a quiet day.

import { db } from "@/lib/db/client";
import { businesses, accounts, subscriptions, reviewSources, reviews, patientFeedback, emailDeliveries } from "@/lib/db/schema.pg";
import { eq, and, or, gt, desc } from "drizzle-orm";
import { connectGoogleReviewSource, getDashboardData } from "@/lib/db/queries";
import { runAnalysisForBusiness } from "@/lib/analysis/runAnalysis";
import { sendReviewAlertEmail, sendMonthlySummaryEmail } from "@/lib/email/send";
import { getSiteUrl } from "@/lib/siteUrl";
import { THEME_LABELS, ThemeCategory } from "@/config/themes";

// A business's average rating is considered to have "moved" once it
// crosses this threshold since the last alert — small enough to catch a
// real shift, large enough that normal single-review noise on a business
// with any real review volume doesn't fire every day.
const RATING_MOVEMENT_THRESHOLD = 0.1;
// No email (alert or summary) for this many days -> send the monthly
// retention safety net instead. A paying customer who never hears from us
// forgets they're paying and cancels.
const SILENCE_FALLBACK_DAYS = 30;

export type AlertCandidate = {
  businessId: string;
  businessName: string;
  accountEmail: string;
  placeId: string;
  connectedAt: string;
};

/**
 * Every business that could plausibly get an alert today: a real
 * (non-demo-only) subscription that's active or trialing, with a connected
 * and active "google" review source. Demo-only and lapsed/canceled
 * accounts are excluded here rather than downstream — no point syncing or
 * analyzing for a business that could never receive the email anyway.
 */
export async function getAlertCandidateBusinesses(): Promise<AlertCandidate[]> {
  const rows = await db
    .select({
      businessId: businesses.id,
      businessName: businesses.name,
      accountEmail: accounts.email,
      placeId: reviewSources.sourceUrl,
      connectedAt: reviewSources.connectedAt,
    })
    .from(businesses)
    .innerJoin(accounts, eq(businesses.accountId, accounts.id))
    .innerJoin(subscriptions, eq(subscriptions.accountId, accounts.id))
    .innerJoin(
      reviewSources,
      and(eq(reviewSources.businessId, businesses.id), eq(reviewSources.sourceType, "google"), eq(reviewSources.status, "active"))
    )
    .where(or(eq(subscriptions.status, "active"), eq(subscriptions.status, "trialing")));

  return rows.filter((r): r is AlertCandidate => r.placeId !== null);
}

export type AlertOutcome =
  | { businessId: string; action: "alert_sent"; reason: string }
  | { businessId: string; action: "monthly_summary_sent" }
  | { businessId: string; action: "none"; reason: string }
  | { businessId: string; action: "error"; error: string };

/**
 * The one function per business: sync -> analyze if needed -> decide ->
 * send at most one email. Every step is independently safe to re-run (sync
 * respects connectGoogleReviewSource's own resync cooldown, analysis is
 * resumable/idempotent per lib/analysis/runAnalysis.ts, and "what's new"
 * is always computed fresh from stored data) so a failure partway through
 * one business never corrupts state for the next cron run.
 */
export async function processBusinessForAlert(candidate: AlertCandidate): Promise<AlertOutcome> {
  const { businessId, businessName, accountEmail, placeId, connectedAt } = candidate;

  try {
    // Respects connectGoogleReviewSource's own 10-minute resync cooldown —
    // deliberately not bypassed. A daily cron is nowhere near that window
    // in normal operation; this only matters if the cron gets triggered
    // more than once in quick succession (e.g. manual testing).
    const sync = await connectGoogleReviewSource(businessId, businessName, placeId);

    // Only pay for analysis when there's genuinely something new to
    // analyze. Reuses the existing wall-clock-budgeted/resumable behavior
    // (lib/analysis/runAnalysis.ts) as-is — if a business needs more than
    // one pass, tomorrow's cron run continues it rather than this one
    // blowing its own time budget.
    if (sync.imported > 0) {
      await runAnalysisForBusiness(businessId, businessName, new Date().toISOString());
    }

    // "Since last contact" anchor: the most recent alert OR monthly
    // summary actually sent to this business, falling back to when the
    // Google source was first connected. The fallback matters on a
    // business's first-ever cron run — without it, every review imported
    // at initial connect (which could be years of history) would look
    // "new since last alert" and get dumped into one enormous first email.
    const [lastEmail] = await db
      .select({ createdAt: emailDeliveries.createdAt })
      .from(emailDeliveries)
      .where(and(eq(emailDeliveries.businessId, businessId), or(eq(emailDeliveries.emailType, "review_alert"), eq(emailDeliveries.emailType, "monthly_summary"))))
      .orderBy(desc(emailDeliveries.createdAt))
      .limit(1);

    const hasPriorEmail = lastEmail !== undefined;
    const sinceAnchor = lastEmail?.createdAt ?? connectedAt;

    const allRealReviews = await db.select().from(reviews).where(and(eq(reviews.businessId, businessId), eq(reviews.isDemoData, false)));

    const newReviews = allRealReviews
      .filter((r) => r.createdAt > sinceAnchor)
      // Worst-first: a negative review outranks everything else, per the
      // alert rules — this ordering is what the email leads with.
      .sort((a, b) => a.rating - b.rating || (a.reviewDate < b.reviewDate ? 1 : -1));
    const negativeReviews = newReviews.filter((r) => r.rating <= 3);

    const newFeedback = await db
      .select()
      .from(patientFeedback)
      .where(and(eq(patientFeedback.businessId, businessId), gt(patientFeedback.createdAt, sinceAnchor)));

    // Rating movement is only meaningful against a REAL prior contact, not
    // the connectedAt fallback (comparing "rating now" against "rating at
    // the moment we started watching, which is basically the same set of
    // reviews" would report a movement of ~0 every time anyway, but skip
    // the comparison outright rather than rely on that coincidence).
    let ratingBefore: number | null = null;
    let ratingNow: number | null = null;
    if (hasPriorEmail) {
      const before = allRealReviews.filter((r) => r.createdAt <= sinceAnchor);
      if (before.length > 0) {
        ratingBefore = before.reduce((sum, r) => sum + r.rating, 0) / before.length;
      }
      if (allRealReviews.length > 0) {
        ratingNow = allRealReviews.reduce((sum, r) => sum + r.rating, 0) / allRealReviews.length;
      }
    }
    const ratingMoved = ratingBefore !== null && ratingNow !== null && Math.abs(ratingNow - ratingBefore) >= RATING_MOVEMENT_THRESHOLD;

    const worthAlerting = negativeReviews.length > 0 || newReviews.length >= 2 || newFeedback.length > 0 || ratingMoved;

    if (worthAlerting) {
      const dashboardUrl = new URL("/dashboard", getSiteUrl()).toString();
      await sendReviewAlertEmail({
        businessId,
        recipientEmail: accountEmail,
        input: {
          businessName,
          dashboardUrl,
          negativeReviews: negativeReviews.map((r) => ({ authorName: r.authorName, rating: r.rating, reviewText: r.reviewText })),
          newReviewCount: newReviews.length,
          newFeedbackCount: newFeedback.length,
          ratingBefore,
          ratingNow,
        },
      });
      const reasons = [
        negativeReviews.length > 0 && `${negativeReviews.length} negative review(s)`,
        newReviews.length >= 2 && `${newReviews.length} new reviews`,
        newFeedback.length > 0 && `${newFeedback.length} new feedback`,
        ratingMoved && `rating moved ${ratingBefore!.toFixed(1)}->${ratingNow!.toFixed(1)}`,
      ].filter(Boolean);
      return { businessId, action: "alert_sent", reason: reasons.join(", ") };
    }

    // Nothing alert-worthy today — check the 30-day retention safety net,
    // anchored on the SAME sinceAnchor (a fresh connect doesn't
    // immediately look "30 days silent").
    const daysSinceContact = (Date.now() - new Date(sinceAnchor).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceContact >= SILENCE_FALLBACK_DAYS) {
      const data = await getDashboardData(businessId);
      const positiveThemes = data.rollups
        .filter((t) => t.positiveCount > t.negativeCount && t.positiveCount > 0)
        .sort((a, b) => b.positiveCount - a.positiveCount);
      const negativeThemes = data.rollups
        .filter((t) => t.negativeCount > 0 && t.negativeCount >= t.positiveCount)
        .sort((a, b) => b.negativeCount - a.negativeCount);
      const topPositive = positiveThemes[0];
      const topNegative = negativeThemes[0];

      const dashboardUrl = new URL("/dashboard", getSiteUrl()).toString();
      await sendMonthlySummaryEmail({
        businessId,
        recipientEmail: accountEmail,
        input: {
          businessName,
          dashboardUrl,
          avgRating: data.avgRating,
          totalReviews: data.totalReviews,
          topPositiveThemeLabel: topPositive ? THEME_LABELS[topPositive.themeCategory as ThemeCategory] : null,
          topPositiveThemeSummary: topPositive ? `mentioned positively ${topPositive.positiveCount} time${topPositive.positiveCount === 1 ? "" : "s"}` : null,
          topNegativeThemeLabel: topNegative ? THEME_LABELS[topNegative.themeCategory as ThemeCategory] : null,
          topNegativeThemeSummary: topNegative ? `mentioned negatively ${topNegative.negativeCount} time${topNegative.negativeCount === 1 ? "" : "s"}` : null,
        },
      });
      return { businessId, action: "monthly_summary_sent" };
    }

    return { businessId, action: "none", reason: "nothing new since last contact" };
  } catch (err) {
    console.error(`check-reviews failed for business ${businessId}:`, err);
    return { businessId, action: "error", error: String(err) };
  }
}
