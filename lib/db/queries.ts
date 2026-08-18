// Shared read/write helpers used by API routes and server components. Kept
// in one file at this scale (Phase 1) — split by entity if it grows.

import { db } from "@/lib/db/client";
import {
  accounts,
  users,
  businesses,
  reviewSources,
  reviews,
  weeklyReports,
  themeRollups,
  analysisRuns,
  subscriptions,
  automationLogs,
  events,
  emailDeliveries,
  feedback,
  prospects,
  supportAppeals,
} from "@/lib/db/schema.pg";
import { eq, desc, and, gte, ne, ilike } from "drizzle-orm";
import { getReviewDataProvider } from "@/lib/reviews/provider";
import { SignupInput } from "@/lib/validation/signup";
import { FeedbackInput } from "@/lib/validation/feedback";
import { DEFAULT_PLAN, PLANS } from "@/config/pricing";
import { findProspects } from "@/lib/outreach/findProspects";
import { fetchDomainEmails, pickBestEmail, hostnameOf } from "@/lib/outreach/findEmail";
import { buildOutreachEmailSubject, buildOutreachDraftBody, buildOutreachEmailHtml, buildOutreachEmailText } from "@/lib/email/templates/outreachEmail";
import { sendOutreachEmail } from "@/lib/email/send";

// Global (not per-IP — see lib/rateLimit.ts for why that's a different
// concern) cap on real outreach sends per rolling 24h, enforced in
// sendProspectEmail below via a DB count query rather than in-memory, since
// it needs to hold across serverless instances. Configurable because "how
// much is too much" is a judgment call the business owner gets to make, not
// a hardcoded product decision — see docs/OUTREACH-AUTOMATION.md.
const OUTREACH_DAILY_SEND_CAP = Number(process.env.OUTREACH_DAILY_SEND_CAP) || 15;

export const SAMPLE_REPORT_ACCOUNT_EMAIL = "sample-report@notabl.demo";

/** The permanent public business behind /sample-report (see scripts/seed.ts). */
export async function getSampleBusiness() {
  const account = await findAccountByEmail(SAMPLE_REPORT_ACCOUNT_EMAIL);
  if (!account) return null;
  return getBusinessForAccount(account.id);
}

export async function findAccountByEmail(email: string) {
  const [row] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
  return row ?? null;
}

export async function getAccountById(accountId: string) {
  const [row] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  return row ?? null;
}

/**
 * Creates the account/user/business, connects a "demo" review source, and
 * imports the bundled demo review dataset for that business. This is the
 * Phase 1 substitute for a real review-API import (see docs/ARCHITECTURE.md
 * §2/§8) — every imported review is stored with is_demo_data = true and the
 * UI labels it clearly (see components/dashboard/DemoDataBanner).
 */
export async function createAccountWithDemoBusiness(input: SignupInput) {
  const existing = await findAccountByEmail(input.email);
  if (existing) {
    const existingBusiness = await getBusinessForAccount(existing.id);
    return { account: existing, business: existingBusiness, reused: true };
  }

  const [account] = await db.insert(accounts).values({ email: input.email }).returning();
  await db.insert(users).values({ accountId: account.id, email: input.email });

  const [business] = await db
    .insert(businesses)
    .values({
      accountId: account.id,
      name: input.businessName,
      industry: "dental",
      website: input.website || null,
      city: input.city || null,
      state: input.state || null,
    })
    .returning();

  const [source] = await db
    .insert(reviewSources)
    .values({
      businessId: business.id,
      sourceType: "demo",
      sourceUrl: input.reviewProfileLinks || null,
      status: "active",
      lastSyncedAt: new Date().toISOString(),
    })
    .returning();

  const demoReviews = await getReviewDataProvider("demo").fetchReviews({ businessName: input.businessName });
  await db.insert(reviews).values(
    demoReviews.map((r) => ({
      businessId: business.id,
      reviewSourceId: source.id,
      externalReviewId: r.externalReviewId,
      authorName: r.authorName,
      rating: r.rating,
      reviewText: r.reviewText,
      reviewDate: r.reviewDate,
      isDemoData: true,
      rawPayloadJson: null,
    }))
  );

  // "none" — not "trialing" — because no trial has actually started yet.
  // The real trial (real status, real trialEndsAt) only begins once Stripe
  // confirms checkout actually completed; see the checkout.session.completed
  // handler in app/api/billing/webhook/route.ts. Setting "trialing" here
  // used to make every signup look identical to a real paying trial in the
  // billing page and admin counts, whether or not the account had ever
  // touched real billing.
  await db.insert(subscriptions).values({
    accountId: account.id,
    planId: DEFAULT_PLAN,
    status: "none",
    trialEndsAt: null,
  });

  return { account, business, reused: false };
}

/**
 * "Same business, different account" duplicate-signup check (case-
 * insensitive name + city + state) — backs the notice built in
 * app/dashboard/page.tsx. Only runs when both city and state are present;
 * an empty location on either side would make name-only matching too
 * noisy (plenty of real, unrelated practices share a name). Deliberately
 * advisory only — signup itself is never blocked by this, same "a human
 * decides" approach as support_appeals (see schema.pg.ts) generally.
 */
export async function findDuplicateBusiness(opts: {
  name: string;
  city: string | null;
  state: string | null;
  excludeAccountId: string;
}) {
  if (!opts.city || !opts.state) return null;
  const [dup] = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(
      and(
        ilike(businesses.name, opts.name),
        ilike(businesses.city, opts.city),
        ilike(businesses.state, opts.state),
        ne(businesses.accountId, opts.excludeAccountId)
      )
    )
    .limit(1);
  return dup ?? null;
}

/**
 * Admin-triggered pilot grant (point 18). Reuses the exact same
 * account/business/demo-review creation path as a normal signup — a pilot
 * account IS a normal account, just with isPilot=true on its subscription
 * so billing never prompts it for payment. Deliberately a single boolean
 * flip, not a coupon/discount-code system.
 */
export async function grantPilotAccess(input: SignupInput) {
  const { account, business, reused } = await createAccountWithDemoBusiness(input);
  if (!account) return { account, business, reused };

  await db
    .update(subscriptions)
    .set({ isPilot: true, status: "active" })
    .where(eq(subscriptions.accountId, account.id));

  return { account, business, reused };
}

/**
 * Thrown by connectGoogleReviewSource when the given Place ID is already
 * connected to a DIFFERENT business — see the check at the top of that
 * function. A distinct class (not a plain Error) so callers — currently
 * app/api/reviews/connect-google (self-serve) — can distinguish "this
 * specific, expected block" from any other connection failure and respond
 * differently (offer the appeal flow) rather than showing a generic error.
 */
export class BusinessAlreadyClaimedError extends Error {
  constructor(message = "This business has already been connected to another account.") {
    super(message);
    this.name = "BusinessAlreadyClaimedError";
  }
}

/**
 * Closes the "different email, same office" trial-abuse gap that a
 * per-account check alone can't catch — see app/api/billing/checkout's use
 * of this to decide whether to deny a NEW account's checkout a trial.
 * True if this business has a connected Google review source (reviewSources
 * row) whose Place ID some OTHER account's business is ALSO using, where
 * that other account has ever had a real Stripe subscription
 * (stripeCustomerId set — same robust "has this account had a subscription
 * before" signal used for the per-account check). Only meaningful for a
 * business that has actually connected a Google review source; one that
 * hasn't has no real review data to exploit in the first place, so there's
 * nothing to check.
 */
export async function isPlaceIdAlreadyTrialedByAnotherAccount(businessId: string): Promise<boolean> {
  const [source] = await db
    .select({ sourceUrl: reviewSources.sourceUrl })
    .from(reviewSources)
    .where(and(eq(reviewSources.businessId, businessId), eq(reviewSources.sourceType, "google")))
    .limit(1);
  if (!source?.sourceUrl) return false;

  const otherAccountsOnSamePlaceId = await db
    .select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(reviewSources)
    .innerJoin(businesses, eq(reviewSources.businessId, businesses.id))
    .innerJoin(subscriptions, eq(subscriptions.accountId, businesses.accountId))
    .where(
      and(
        eq(reviewSources.sourceType, "google"),
        eq(reviewSources.sourceUrl, source.sourceUrl),
        ne(reviewSources.businessId, businessId)
      )
    );

  return otherAccountsOnSamePlaceId.some((r) => r.stripeCustomerId != null);
}

/**
 * Shared by the admin connect form (app/api/admin/reviews/connect-google)
 * and the self-serve route (app/api/reviews/connect-google) — connects a
 * business's real Google reviews via the "google" review provider
 * (currently Outscraper — a temporary, deliberate stand-in for the official
 * Business Profile API, see docs/REVIEW-DATA-PROVIDERS.md) and imports
 * whatever it returns as real, non-demo data. Safely re-runnable: reuses
 * the existing "google" review_sources row for this business if one
 * already exists, and duplicate reviews are skipped by (reviewSourceId,
 * externalReviewId) same as every other import path — re-syncing the same
 * practice just picks up new reviews since the last sync.
 */
export async function connectGoogleReviewSource(businessId: string, businessName: string, placeId: string) {
  // One real business, one Place ID, ever — regardless of which account or
  // email connects it. Without this, two different accounts (e.g. a
  // second, unauthorized signup for the same practice) could both start
  // real trials off the exact same underlying business.
  const [claimedByOtherBusiness] = await db
    .select({ businessId: reviewSources.businessId })
    .from(reviewSources)
    .where(and(eq(reviewSources.sourceType, "google"), eq(reviewSources.sourceUrl, placeId), ne(reviewSources.businessId, businessId)))
    .limit(1);
  if (claimedByOtherBusiness) {
    throw new BusinessAlreadyClaimedError();
  }

  const [existingSource] = await db
    .select()
    .from(reviewSources)
    .where(and(eq(reviewSources.businessId, businessId), eq(reviewSources.sourceType, "google")))
    .limit(1);

  // Cost control: every call below re-fetches from Outscraper, a paid,
  // per-request API, with no cap. Only applies to re-syncing the SAME
  // already-connected Place ID within the window — a changed Place ID or a
  // genuinely first-time connect always goes through.
  if (existingSource && existingSource.sourceUrl === placeId && existingSource.lastSyncedAt) {
    const RESYNC_COOLDOWN_MS = 10 * 60 * 1000;
    const msSinceLastSync = Date.now() - new Date(existingSource.lastSyncedAt).getTime();
    if (msSinceLastSync < RESYNC_COOLDOWN_MS) {
      return { imported: 0, skipped: 0, sourceId: existingSource.id, cooledDown: true };
    }
  }

  // Fetched BEFORE anything about this business's stored state changes —
  // if this throws (missing API key, Outscraper down, a malformed
  // response, all things outscraperProvider.ts already checks for and
  // throws on), the customer's demo dashboard is left exactly as it was,
  // not already-deleted-and-now-nothing. This is also why the
  // review_sources row itself is only created/updated below, AFTER a
  // successful fetch: getDashboardData's hasDemoData check treats a
  // "google" source's mere existence as "real data connected" (see that
  // function), so confirming the row before knowing the fetch actually
  // worked would make the dashboard call a still-fully-demo business
  // "real" the moment a failed connect attempt was made. No db.transaction
  // wrapping this together with the writes below on purpose: this is a
  // slow external HTTP call, and holding a DB transaction open across it
  // is worse practice than just not writing anything until there's real
  // data to write.
  const fetched = await getReviewDataProvider("google").fetchReviews({ businessName, sourceUrl: placeId });

  let source = existingSource;
  if (!source) {
    [source] = await db
      .insert(reviewSources)
      .values({ businessId, sourceType: "google", sourceUrl: placeId, status: "active" })
      .returning();
  } else if (source.sourceUrl !== placeId) {
    // Practice's Place ID changed (e.g. corrected a typo) — update in place
    // rather than creating a second "google" source for the same business.
    [source] = await db
      .update(reviewSources)
      .set({ sourceUrl: placeId })
      .where(eq(reviewSources.id, source.id))
      .returning();
  }

  // Every business starts with the bundled demo dataset (see
  // createAccountWithDemoBusiness) so the dashboard has something to show
  // before real data exists. Once real Google reviews are connected, that
  // synthetic data is no longer representative of the practice and would
  // otherwise sit there diluting real review counts/percentages and keeping
  // the "DEMO DATA" banner showing — so it's cleared here on every connect
  // call, not just the first. Deliberately unconditional (not gated on
  // "is this the first connect") so it also cleans up any business that
  // connected before this cleanup existed — running it again when there's
  // no demo data left just deletes zero rows, harmless either way. Cascades
  // to review_theme_mentions via onDelete: "cascade" in schema.pg.ts.
  await db.delete(reviews).where(and(eq(reviews.businessId, businessId), eq(reviews.isDemoData, true)));

  let imported = 0;
  let skipped = 0;
  for (const r of fetched) {
    const [existing] = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(and(eq(reviews.reviewSourceId, source.id), eq(reviews.externalReviewId, r.externalReviewId)))
      .limit(1);
    if (existing) {
      skipped++;
      continue;
    }
    await db.insert(reviews).values({
      businessId,
      reviewSourceId: source.id,
      externalReviewId: r.externalReviewId,
      authorName: r.authorName,
      rating: r.rating,
      reviewText: r.reviewText,
      reviewDate: r.reviewDate,
      isDemoData: false,
      rawPayloadJson: null,
    });
    imported++;
  }

  await db.update(reviewSources).set({ lastSyncedAt: new Date().toISOString() }).where(eq(reviewSources.id, source.id));

  return { imported, skipped, sourceId: source.id };
}

export async function getBusinessForAccount(accountId: string) {
  const [row] = await db.select().from(businesses).where(eq(businesses.accountId, accountId)).limit(1);
  return row ?? null;
}

export async function getLatestWeeklyReport(businessId: string) {
  const [row] = await db
    .select()
    .from(weeklyReports)
    .where(eq(weeklyReports.businessId, businessId))
    .orderBy(desc(weeklyReports.periodEnd))
    .limit(1);
  return row ?? null;
}

// Cost control: lets runAnalysisForBusiness check "do we already have a
// report for this exact period" before paying for another narrative
// generation call — see the comment at its call site in runAnalysis.ts.
export async function getWeeklyReportForPeriod(businessId: string, periodStart: string, periodEnd: string) {
  const [row] = await db
    .select()
    .from(weeklyReports)
    .where(
      and(
        eq(weeklyReports.businessId, businessId),
        eq(weeklyReports.periodStart, periodStart),
        eq(weeklyReports.periodEnd, periodEnd)
      )
    )
    .orderBy(desc(weeklyReports.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getAllWeeklyReports(businessId: string) {
  return db
    .select()
    .from(weeklyReports)
    .where(eq(weeklyReports.businessId, businessId))
    .orderBy(desc(weeklyReports.periodEnd));
}

export async function getLatestAnalysisRun(businessId: string) {
  const [row] = await db
    .select()
    .from(analysisRuns)
    .where(eq(analysisRuns.businessId, businessId))
    .orderBy(desc(analysisRuns.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getThemeRollupsForRun(analysisRunId: string) {
  return db.select().from(themeRollups).where(eq(themeRollups.analysisRunId, analysisRunId));
}

export async function getReviewCountForBusiness(businessId: string) {
  const rows = await db.select({ id: reviews.id }).from(reviews).where(eq(reviews.businessId, businessId));
  return rows.length;
}

export async function getSubscriptionForAccount(accountId: string) {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.accountId, accountId)).limit(1);
  return row ?? null;
}

/**
 * Applies a billing state change to an account's subscription row — the one
 * place both the real Stripe webhook handler and the demo checkout/portal
 * simulator write subscription state, so the two paths can never drift out
 * of sync with each other. See app/api/billing/webhook/route.ts and
 * app/api/billing/demo-checkout/route.ts.
 */
export async function createFeedback(accountId: string | null, input: FeedbackInput) {
  const [row] = await db
    .insert(feedback)
    .values({
      accountId,
      clarityImmediate: input.clarityImmediate || null,
      mostUsefulPart: input.mostUsefulPart || null,
      confusingPart: input.confusingPart || null,
      wouldSaveTime: input.wouldSaveTime || null,
      wouldUseWeekly: input.wouldUseWeekly || null,
      wouldPay49: input.wouldPay49 || null,
      reasonablePriceIfNot: input.reasonablePriceIfNot || null,
      whatWouldChangeToPay: input.whatWouldChangeToPay || null,
    })
    .returning();
  return row;
}

/**
 * Records a "someone else may already have this business" appeal — either
 * the connect-flow block (BusinessAlreadyClaimedError above) or the
 * duplicate-signup notice (findDuplicateBusiness above). See
 * components/dashboard/AppealForm.tsx for the shared UI both cases use and
 * app/admin/page.tsx's "Support Appeals" section for where these land.
 * Purely a queue for a human to read — nothing here auto-resolves anything.
 */
export async function createSupportAppeal(input: {
  accountId: string;
  businessId: string | null;
  appealType: string;
  message: string;
}) {
  const [row] = await db
    .insert(supportAppeals)
    .values({
      accountId: input.accountId,
      businessId: input.businessId,
      appealType: input.appealType,
      message: input.message,
    })
    .returning();
  return row;
}

export async function getAccountIdByStripeCustomerId(stripeCustomerId: string) {
  const [row] = await db
    .select({ accountId: subscriptions.accountId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return row?.accountId ?? null;
}

export async function updateSubscriptionForAccount(
  accountId: string,
  changes: Partial<{
    status: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    canceledAt: string | null;
    isPilot: boolean;
  }>
) {
  await db.update(subscriptions).set(changes).where(eq(subscriptions.accountId, accountId));
}

export async function getWeeklyReportById(id: string) {
  const [row] = await db.select().from(weeklyReports).where(eq(weeklyReports.id, id)).limit(1);
  return row ?? null;
}

/**
 * A handful of representative review excerpts for a given analysis run, for
 * the report's "Important Reviews" section. Only real, stored review text is
 * ever shown — nothing here is generated or paraphrased (see
 * docs/ARCHITECTURE.md §6, "never invent review information").
 */
export async function getSampleReviewsForRun(businessId: string, periodStart: string, periodEnd: string, limit = 6) {
  const { and, gte, lt } = await import("drizzle-orm");
  const rows = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.businessId, businessId), gte(reviews.reviewDate, periodStart), lt(reviews.reviewDate, periodEnd)));
  // Mix of highest and lowest rated for a representative sample.
  const sorted = [...rows].sort((a, b) => a.rating - b.rating);
  const lowest = sorted.slice(0, Math.ceil(limit / 2));
  const highest = sorted.slice(-Math.floor(limit / 2));
  const combined = [...lowest, ...highest];
  const seen = new Set<string>();
  return combined.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

/**
 * Everything the (intentionally minimal — see docs/ARCHITECTURE.md §11)
 * admin panel needs, in one call. Kept simple: raw counts over the whole
 * table, not paginated/filterable — fine at MVP scale, revisit if the
 * businesses/events tables grow large enough that full-table scans matter.
 */
export async function getAdminOverview() {
  const allAccounts = await db.select().from(accounts);
  const allBusinesses = await db.select().from(businesses);
  const allSubscriptions = await db.select().from(subscriptions);
  const allWeeklyReports = await db.select().from(weeklyReports);
  const allEmailDeliveries = await db.select().from(emailDeliveries);
  const allAutomationLogs = await db.select().from(automationLogs);
  const allEvents = await db.select().from(events);
  const allFeedback = await db.select().from(feedback).orderBy(desc(feedback.createdAt));
  const allSupportAppeals = await db.select().from(supportAppeals).orderBy(desc(supportAppeals.createdAt));

  const planPrice = PLANS[DEFAULT_PLAN].priceMonthlyUsd;
  const activeOrTrialing = allSubscriptions.filter((s) => s.status === "active" || s.status === "trialing");
  const activePaid = allSubscriptions.filter((s) => s.status === "active");
  const mrr = activePaid.length * planPrice;

  const eventCounts = (name: string) => allEvents.filter((e) => e.eventName === name).length;
  const signups = eventCounts("signup_completed");
  const trials = eventCounts("trial_started");
  const visits = eventCounts("landing_page_visit");
  const conversionRate = visits > 0 ? Math.round((signups / visits) * 1000) / 10 : 0;
  const checkoutsStarted = eventCounts("checkout_started");
  const subscriptionsStarted = eventCounts("subscription_started");

  const payAnswers = allFeedback.map((f) => f.wouldPay49).filter((v): v is string => v !== null);
  const wouldPayPct = payAnswers.length > 0 ? Math.round((payAnswers.filter((v) => v === "yes").length / payAnswers.length) * 1000) / 10 : null;
  const sampleReportViews = eventCounts("sample_report_viewed");

  return {
    accountCount: allAccounts.length,
    accounts: allAccounts,
    businesses: allBusinesses,
    subscriptions: allSubscriptions,
    activeOrTrialingCount: activeOrTrialing.length,
    activePaidCount: activePaid.length,
    pastDueCount: allSubscriptions.filter((s) => s.status === "past_due").length,
    cancelledCount: allSubscriptions.filter((s) => s.status === "canceled").length,
    mrr,
    weeklyReportsGenerated: allWeeklyReports.length,
    emailDeliveries: allEmailDeliveries,
    automationErrors: allAutomationLogs.filter((l) => l.status === "failed"),
    automationLogs: allAutomationLogs.slice(-25).reverse(),
    visits,
    signups,
    trials,
    conversionRate,
    checkoutsStarted,
    subscriptionsStarted,
    feedback: allFeedback,
    wouldPayPct,
    sampleReportViews,
    supportAppeals: allSupportAppeals,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

/**
 * Everything the dashboard page needs, in one call. "Average sentiment" and
 * positive/negative % are derived from star rating (1-5) rather than a
 * separately-stored per-review sentiment field — the two are equivalent for
 * our DemoProvider (rating>=4 positive, ==3 neutral, <=2 negative) and this
 * avoids a redundant column that could drift out of sync with the rating.
 */
export async function getDashboardData(businessId: string) {
  const business = await db.select().from(businesses).where(eq(businesses.id, businessId)).then((r) => r[0] ?? null);
  const allReviews = await db.select().from(reviews).where(eq(reviews.businessId, businessId));

  const totalReviews = allReviews.length;
  const positiveReviews = allReviews.filter((r) => r.rating >= 4).length;
  const negativeReviews = allReviews.filter((r) => r.rating <= 2).length;
  const avgRating = totalReviews > 0 ? allReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews : 0;

  const latestRun = await getLatestAnalysisRun(businessId);
  const latestReport = await getLatestWeeklyReport(businessId);
  const rollups = latestRun ? await getThemeRollupsForRun(latestRun.id) : [];

  const emergingIssuesCount = rollups.filter((r) => r.trendDirection === "new").length;
  const importantThemesCount = rollups.length;

  // Drives whether <DemoDataBanner /> shows and whether the dashboard
  // treats this as "real report" territory (see app/dashboard/page.tsx).
  // Deliberately based on whether a real "google" source has been
  // connected (connectGoogleReviewSource creates this row), NOT on review
  // count — a real, valid, newly-connected business can genuinely have
  // zero reviews so far (a new listing, or one that just hasn't been
  // reviewed yet), and totalReviews === 0 used to treat that identically
  // to "still on demo data," showing the sample-data banner and reopening
  // the connect-reviews card right after a paying customer did exactly
  // what was asked. A business with no google source at all (the normal
  // pre-connect state, or the edge case of literally zero reviews of any
  // kind) is still correctly treated as demo.
  const [googleSource] = await db
    .select({ id: reviewSources.id })
    .from(reviewSources)
    .where(and(eq(reviewSources.businessId, businessId), eq(reviewSources.sourceType, "google")))
    .limit(1);
  const hasDemoData = !googleSource;

  return {
    business,
    totalReviews,
    positivePct: totalReviews > 0 ? Math.round((positiveReviews / totalReviews) * 100) : 0,
    negativePct: totalReviews > 0 ? Math.round((negativeReviews / totalReviews) * 100) : 0,
    avgRating: Math.round(avgRating * 10) / 10,
    emergingIssuesCount,
    importantThemesCount,
    latestRun,
    latestReport,
    rollups: [...rollups].sort((a, b) => b.mentionCount - a.mentionCount),
    hasDemoData,
  };
}

// ---------------------------------------------------------------------------
// Outreach (cold email to prospective, not-yet-customer practices)
// ---------------------------------------------------------------------------
//
// The whole feature is deliberately one-at-a-time and human-reviewed: find
// drafts a Tier-1 (public-info-only, no fabricated review specifics — see
// marketing/personalized-outreach-system.md) email per prospect, an admin
// reviews/edits it in the outreach queue, and only their explicit Send
// click actually emails anyone. This is the resolution to a real conflict
// with this project's own "no automated mass outreach" rule (point 24,
// see app/api/admin/pilot/invite/route.ts's comment) — the business owner
// was shown that conflict directly and approved this semi-automated
// design, with an explicit note that a fully automated version may be
// adopted later if this review step becomes too much friction. See
// docs/OUTREACH-AUTOMATION.md for the full writeup.

/**
 * Finds prospective dental practices in a city/state via Outscraper Maps
 * Search (public listing info only — see lib/outreach/findProspects.ts) and
 * drafts a cold-outreach email for each one not already in the queue.
 * Dedupes by Google Place ID (prospects_place_id_unique) so re-running the
 * same search is safe — already-seen practices are skipped, not
 * re-drafted/re-added. Sends nothing; only creates "drafted" rows.
 */
export async function findAndDraftProspects(opts: {
  city: string;
  state: string;
  category?: string;
  limit?: number;
  sampleReportUrl: string;
  senderName: string;
}) {
  const found = await findProspects({
    city: opts.city,
    state: opts.state,
    category: opts.category,
    limit: opts.limit,
  });

  let added = 0;
  let alreadyExisted = 0;
  for (const p of found) {
    const [existing] = await db
      .select({ id: prospects.id })
      .from(prospects)
      .where(eq(prospects.googlePlaceId, p.googlePlaceId))
      .limit(1);
    if (existing) {
      alreadyExisted++;
      continue;
    }

    const emailSubject = buildOutreachEmailSubject(p.businessName);
    const emailBody = buildOutreachDraftBody({
      practiceName: p.businessName,
      sampleReportUrl: opts.sampleReportUrl,
      senderName: opts.senderName,
    });

    await db.insert(prospects).values({
      businessName: p.businessName,
      website: p.website,
      phone: p.phone,
      city: p.city,
      state: p.state,
      googlePlaceId: p.googlePlaceId,
      googleRating: p.googleRating,
      googleReviewCount: p.googleReviewCount,
      contactEmail: p.contactEmail,
      emailSubject,
      emailBody,
      status: "drafted",
    });
    added++;
  }

  return { found: found.length, added, alreadyExisted };
}

export async function getProspects() {
  return db.select().from(prospects).orderBy(desc(prospects.createdAt));
}

/** Lets the admin fix up the contact email and/or the auto-drafted subject/body before sending. */
export async function updateProspectDraft(
  id: string,
  changes: { contactEmail?: string; emailSubject?: string; emailBody?: string }
) {
  const values: Partial<{ contactEmail: string | null; emailSubject: string; emailBody: string }> = {};
  if (changes.contactEmail !== undefined) values.contactEmail = changes.contactEmail || null;
  if (changes.emailSubject !== undefined) values.emailSubject = changes.emailSubject;
  if (changes.emailBody !== undefined) values.emailBody = changes.emailBody;
  if (Object.keys(values).length === 0) return;
  await db.update(prospects).set(values).where(eq(prospects.id, id));
}

/**
 * Looks up a contact email for one prospect's website domain via
 * Outscraper's Domain Emails & Contacts API — a deliberate, single-prospect,
 * admin-clicked action (see the "Find Email" button in
 * components/admin/OutreachQueue.tsx), never run in bulk from
 * findAndDraftProspects above: the ~45s response time and Vercel Hobby's
 * 60s function-duration cap make a bulk version infeasible, and per-prospect
 * review is the point of this queue anyway. Doesn't write to the database —
 * the admin still has to click "Save Draft" to persist whatever this finds,
 * same as if they'd typed it in themselves.
 */
export async function findEmailForProspect(
  id: string
): Promise<{ email: string | null; source: string | null; totalFound: number }> {
  const [prospect] = await db.select().from(prospects).where(eq(prospects.id, id)).limit(1);
  if (!prospect) throw new Error("Prospect not found.");
  if (!prospect.website) throw new Error("This prospect has no website on file to look up an email for.");

  const domain = hostnameOf(prospect.website);
  if (!domain) throw new Error(`This prospect's website ("${prospect.website}") isn't a parseable URL.`);

  const emails = await fetchDomainEmails(domain);
  const best = pickBestEmail(domain, emails);
  return { email: best?.value ?? null, source: best?.source ?? null, totalFound: emails.length };
}

export async function skipProspect(id: string, reason: string) {
  await db
    .update(prospects)
    .set({ status: "skipped", skipReason: reason || null })
    .where(eq(prospects.id, id));
}

/**
 * Sends one prospect's drafted (and admin-reviewed) outreach email — the
 * actual "approve and send" action, one prospect at a time, deliberately no
 * "send all" path. Marks the row "sent" only when a real email actually
 * went out (a real RESEND_API_KEY is configured); when running in demo mode
 * it's marked "demo_sent" instead, so the admin queue never looks like a
 * real practice was emailed when nothing left the server — and demo sends
 * deliberately don't count against the daily cap below, since only real
 * sends carry the risk that cap exists to bound.
 */
export async function sendProspectEmail(id: string) {
  const [prospect] = await db.select().from(prospects).where(eq(prospects.id, id)).limit(1);
  if (!prospect) throw new Error("Prospect not found.");
  if (prospect.status === "sent" || prospect.status === "demo_sent") {
    throw new Error("Already sent to this prospect.");
  }
  if (prospect.status === "skipped") throw new Error("This prospect was skipped.");
  if (!prospect.contactEmail) throw new Error("No contact email set for this prospect yet.");
  if (!prospect.emailSubject || !prospect.emailBody) throw new Error("Prospect is missing a drafted subject/body.");

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentSends = await db
    .select({ id: prospects.id })
    .from(prospects)
    .where(and(eq(prospects.status, "sent"), gte(prospects.sentAt, since)));
  if (recentSends.length >= OUTREACH_DAILY_SEND_CAP) {
    throw new Error(`Daily outreach send cap (${OUTREACH_DAILY_SEND_CAP}) reached — try again tomorrow.`);
  }

  const html = buildOutreachEmailHtml(prospect.emailBody);
  const text = buildOutreachEmailText(prospect.emailBody);
  const result = await sendOutreachEmail({
    recipientEmail: prospect.contactEmail,
    subject: prospect.emailSubject,
    html,
    text,
  });

  await db
    .update(prospects)
    .set({ status: result.sent ? "sent" : "demo_sent", sentAt: new Date().toISOString() })
    .where(eq(prospects.id, id));

  return result;
}
