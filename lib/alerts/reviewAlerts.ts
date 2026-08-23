// Core logic behind the daily triggered-alert cron (app/api/cron/check-reviews/route.ts)
// — replaces the old calendar-scheduled weekly report. A scheduled report
// fires regardless of whether anything happened; a practice getting a
// handful of reviews a week mostly got "nothing notable this period,"
// which teaches the customer the product is worthless. This module instead
// decides whether there's genuinely something worth telling the owner, and
// sends AT MOST one bundled email per business per day. Silence is the
// correct, expected output on a quiet day.
//
// Split into two halves on purpose — deciding/alerting (cheap, runs for
// every business every day) and re-importing from Google (expensive, one
// business per run). They used to be one function per business, which is
// what made the cron time out: a single Outscraper fetch on a large
// practice consumed the whole 60-second ceiling before anything else
// happened. See pickBusinessToSync and syncBusinessReviews below.

import { db } from "@/lib/db/client";
import { businesses, accounts, subscriptions, reviewSources, reviews, patientFeedback, emailDeliveries } from "@/lib/db/schema.pg";
import { eq, and, or, gt, desc } from "drizzle-orm";
import { connectGoogleReviewSource, getDashboardData } from "@/lib/db/queries";
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
  /** Drives the sync rotation — see pickBusinessToSync. Null = never synced. */
  lastSyncedAt: string | null;
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
      lastSyncedAt: reviewSources.lastSyncedAt,
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
 * Picks the ONE business to re-sync on this run: whichever went longest
 * without one (never-synced first).
 *
 * One per run, because a single Outscraper fetch can consume the entire
 * 60-second function on its own — a 449-review practice did exactly that
 * and killed the cron before it wrote a single log line. There is no
 * budget tuning that fixes it: 60s is Vercel Hobby's hard ceiling, so the
 * only option is doing less per request.
 *
 * The trade-off, stated plainly: with N connected businesses each gets
 * fresh Google data every N days rather than daily. Alerts still run daily
 * for everyone against already-imported data. If N grows enough for that
 * lag to matter, this needs a real queue rather than a bigger budget.
 */
export function pickBusinessToSync(candidates: AlertCandidate[]): AlertCandidate | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    if (a.lastSyncedAt === b.lastSyncedAt) return 0;
    if (a.lastSyncedAt === null) return -1;
    if (b.lastSyncedAt === null) return 1;
    return a.lastSyncedAt < b.lastSyncedAt ? -1 : 1;
  })[0];
}

/**
 * Re-imports one business's Google reviews. Deliberately does NOT analyze
 * afterwards — that is the invariant the connect routes already document
 * (app/api/reviews/connect-google/route.ts): never chain an external
 * provider call and an analysis pass in one request. Newly imported
 * reviews are picked up by the next analysis run, which the dashboard and
 * the manual button both drive in properly-budgeted rounds.
 *
 * Safe to be killed mid-flight: reviews are inserted one at a time and
 * deduped by (reviewSourceId, externalReviewId), and lastSyncedAt is only
 * written on success — so a partial import just resumes next run.
 */
export async function syncBusinessReviews(
  candidate: AlertCandidate
): Promise<{ businessId: string; action: "synced" | "sync_error"; detail: string }> {
  try {
    const sync = await connectGoogleReviewSource(candidate.businessId, candidate.businessName, candidate.placeId);
    return {
      businessId: candidate.businessId,
      action: "synced",
      detail: sync.cooledDown
        ? "skipped — synced within the last 10 minutes"
        : `imported ${sync.imported}, skipped ${sync.skipped} already-present`,
    };
  } catch (err) {
    console.error(`check-reviews sync failed for business ${candidate.businessId}:`, err);
    return { businessId: candidate.businessId, action: "sync_error", detail: String(err) };
  }
}

/**
 * Decides whether this business has anything worth emailing about, and
 * sends at most one email if so. Reads ONLY already-stored data — no
 * Outscraper call, no analysis pass (see syncBusinessReviews above for
 * why those moved out). That makes this cheap and predictable enough to
 * run for every candidate on every cron run, which is what keeps alerts
 * daily even though imports now rotate.
 */
export async function processBusinessForAlert(candidate: AlertCandidate): Promise<AlertOutcome> {
  const { businessId, businessName, accountEmail, connectedAt } = candidate;

  try {
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
