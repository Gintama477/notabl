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
} from "@/lib/db/schema.pg";
import { eq, desc, and } from "drizzle-orm";
import { getReviewDataProvider } from "@/lib/reviews/provider";
import { SignupInput } from "@/lib/validation/signup";
import { FeedbackInput } from "@/lib/validation/feedback";
import { DEFAULT_PLAN, PLANS } from "@/config/pricing";

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

  await db.insert(subscriptions).values({
    accountId: account.id,
    planId: DEFAULT_PLAN,
    status: "trialing",
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  });

  return { account, business, reused: false };
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
  };
}
