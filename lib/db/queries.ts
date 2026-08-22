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
  reviewThemeMentions,
  subscriptions,
  automationLogs,
  events,
  emailDeliveries,
  feedback,
  prospects,
  supportAppeals,
  patientFeedback,
  reviewReplies,
} from "@/lib/db/schema.pg";
import { eq, desc, and, or, gte, lt, lte, ne, ilike, isNotNull, isNull, inArray } from "drizzle-orm";
import { getReviewDataProvider } from "@/lib/reviews/provider";
import { OUTSCRAPER_REVIEWS_LIMIT } from "@/lib/reviews/outscraperProvider";
import { SignupInput } from "@/lib/validation/signup";
import { FeedbackInput } from "@/lib/validation/feedback";
import { DEFAULT_PLAN, PLANS } from "@/config/pricing";
import { slugifyBusinessName, randomSlugSuffix } from "@/lib/reviews/slug";
import { getAIProvider } from "@/lib/ai/provider";
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
 * The one place a business's slug gets decided — used both at creation
 * (createAccountWithDemoBusiness below, the single insertion point for both
 * self-serve signup and admin pilot invites) and by
 * scripts/backfill-business-slugs.ts for existing rows. Starts from the
 * plain slugified name; only appends a random suffix if that's already
 * taken, so most businesses get a clean, readable link.
 */
export async function generateUniqueBusinessSlug(name: string): Promise<string> {
  const base = slugifyBusinessName(name);
  const [existing] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.slug, base)).limit(1);
  if (!existing) return base;

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${base}-${randomSlugSuffix()}`;
    const [taken] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.slug, candidate)).limit(1);
    if (!taken) return candidate;
  }
  // Astronomically unlikely fallback if 5 random suffixes in a row all
  // collided — a UUID fragment is guaranteed unique enough at this scale.
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
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

  const slug = await generateUniqueBusinessSlug(input.businessName);
  const [business] = await db
    .insert(businesses)
    .values({
      accountId: account.id,
      name: input.businessName,
      industry: "dental",
      website: input.website || null,
      city: input.city || null,
      state: input.state || null,
      slug,
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

  // Exactly the provider's per-request cap means there are probably more
  // reviews on the actual listing than we imported — see
  // OUTSCRAPER_REVIEWS_LIMIT's comment in lib/reviews/outscraperProvider.ts.
  // Recorded unconditionally on every sync (not just the first) so this
  // stays accurate if the practice's review count grows past the cap
  // later, or drops back under it after Outscraper's own data changes.
  const possiblyTruncated = fetched.length >= OUTSCRAPER_REVIEWS_LIMIT;

  let source = existingSource;
  if (!source) {
    [source] = await db
      .insert(reviewSources)
      .values({ businessId, sourceType: "google", sourceUrl: placeId, status: "active", possiblyTruncated })
      .returning();
  } else if (source.sourceUrl !== placeId) {
    // Practice's Place ID changed (e.g. corrected a typo) — update in place
    // rather than creating a second "google" source for the same business.
    [source] = await db
      .update(reviewSources)
      .set({ sourceUrl: placeId, possiblyTruncated })
      .where(eq(reviewSources.id, source.id))
      .returning();
  } else if (source.possiblyTruncated !== possiblyTruncated) {
    [source] = await db.update(reviewSources).set({ possiblyTruncated }).where(eq(reviewSources.id, source.id)).returning();
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

  return { imported, skipped, sourceId: source.id, possiblyTruncated };
}

/**
 * Thrown when a delete is refused on purpose (a real paying customer, or
 * the public sample business) rather than failing. A distinct class so the
 * route can return 409 with the explanation instead of a generic 500.
 */
export class BusinessDeletionRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessDeletionRefusedError";
  }
}

/**
 * Irreversibly deletes a business, its owning account, and everything
 * either one references. Built because the daily alerts cron
 * (lib/alerts/reviewAlerts.ts) re-syncs and re-analyzes every
 * active/trialing business with a connected Google source — so a leftover
 * test business spends real Outscraper and Anthropic money every day,
 * forever, with no way to stop it short of editing production tables by
 * hand.
 *
 * Deletes explicitly in dependency order inside a transaction rather than
 * leaning on the FK cascades. Most of these WOULD cascade from accounts,
 * but four tables (events, automation_logs, feedback, support_appeals) are
 * onDelete: "set null", so a cascade alone leaves orphaned rows pointing
 * at nothing. Being explicit also means the row counts below are real
 * measured numbers for the audit log, not assumptions.
 *
 * Deliberately NOT deleted, left to the schema's own SET NULL:
 *   - automation_logs: the audit trail, including this deletion's own
 *     entry. Losing it would defeat the point of logging.
 *   - feedback / support_appeals: product feedback and support history
 *     retain their value once detached from a deleted account.
 */
export async function deleteBusinessAndAllData(
  businessId: string,
  confirmName: string
): Promise<{ businessName: string; accountEmail: string; counts: Record<string, number> }> {
  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business) throw new BusinessDeletionRefusedError("That business no longer exists.");

  const [account] = await db.select().from(accounts).where(eq(accounts.id, business.accountId)).limit(1);
  if (!account) throw new BusinessDeletionRefusedError("That business has no owning account — refusing to guess what to delete.");

  // Re-checked server-side, never trusting the UI's own check: a mistyped
  // name must not delete anything even if the request is crafted by hand.
  if (confirmName !== business.name) {
    throw new BusinessDeletionRefusedError("The typed name didn't match the business name exactly. Nothing was deleted.");
  }

  // The public /sample-report page renders this business. Deleting it
  // breaks a live marketing page, so it's excluded outright rather than
  // merely warned about — it should never be removable by a stray click.
  if (account.email === SAMPLE_REPORT_ACCOUNT_EMAIL) {
    throw new BusinessDeletionRefusedError(
      "This is the public sample-report business. Deleting it would break the live /sample-report page, so it can't be deleted here."
    );
  }

  // A real paying customer's data must never be removable from an admin
  // panel. "demo_" ids come from the demo billing simulator
  // (app/api/billing/demo-checkout), so those are safe; anything else came
  // from real Stripe.
  const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.accountId, account.id)).limit(1);
  if (subscription?.stripeSubscriptionId && !subscription.stripeSubscriptionId.startsWith("demo_")) {
    throw new BusinessDeletionRefusedError(
      `This account has a real Stripe subscription (${subscription.stripeSubscriptionId}). Cancel it in Stripe first if this really should be deleted — refusing to remove a paying customer's data from an admin panel.`
    );
  }

  const businessReviewIds = (
    await db.select({ id: reviews.id }).from(reviews).where(eq(reviews.businessId, businessId))
  ).map((r) => r.id);

  const counts: Record<string, number> = {};

  await db.transaction(async (tx) => {
    const n = async (label: string, run: Promise<{ id: string }[]>) => {
      counts[label] = (await run).length;
    };

    if (businessReviewIds.length > 0) {
      await n(
        "review_theme_mentions",
        tx.delete(reviewThemeMentions).where(inArray(reviewThemeMentions.reviewId, businessReviewIds)).returning({ id: reviewThemeMentions.id })
      );
      await n(
        "review_replies",
        tx.delete(reviewReplies).where(inArray(reviewReplies.reviewId, businessReviewIds)).returning({ id: reviewReplies.id })
      );
    } else {
      counts["review_theme_mentions"] = 0;
      counts["review_replies"] = 0;
    }

    await n("reviews", tx.delete(reviews).where(eq(reviews.businessId, businessId)).returning({ id: reviews.id }));
    await n("theme_rollups", tx.delete(themeRollups).where(eq(themeRollups.businessId, businessId)).returning({ id: themeRollups.id }));
    await n("weekly_reports", tx.delete(weeklyReports).where(eq(weeklyReports.businessId, businessId)).returning({ id: weeklyReports.id }));
    await n("analysis_runs", tx.delete(analysisRuns).where(eq(analysisRuns.businessId, businessId)).returning({ id: analysisRuns.id }));
    await n("review_sources", tx.delete(reviewSources).where(eq(reviewSources.businessId, businessId)).returning({ id: reviewSources.id }));
    await n("patient_feedback", tx.delete(patientFeedback).where(eq(patientFeedback.businessId, businessId)).returning({ id: patientFeedback.id }));
    await n("email_deliveries", tx.delete(emailDeliveries).where(eq(emailDeliveries.businessId, businessId)).returning({ id: emailDeliveries.id }));
    // Both sides: an event can be tied to the account, the business, or
    // both, and SET NULL would otherwise leave analytics rows that inflate
    // nothing but reference a business that no longer exists.
    await n(
      "events",
      tx.delete(events).where(or(eq(events.businessId, businessId), eq(events.accountId, account.id))).returning({ id: events.id })
    );
    await n("subscriptions", tx.delete(subscriptions).where(eq(subscriptions.accountId, account.id)).returning({ id: subscriptions.id }));
    await n("users", tx.delete(users).where(eq(users.accountId, account.id)).returning({ id: users.id }));
    await n("businesses", tx.delete(businesses).where(eq(businesses.id, businessId)).returning({ id: businesses.id }));
    await n("accounts", tx.delete(accounts).where(eq(accounts.id, account.id)).returning({ id: accounts.id }));

    // Written inside the transaction so the record and the deletion commit
    // together — a deletion that isn't logged, or a log for a deletion
    // that rolled back, are both worse than either alone. businessId is
    // null because the row it would reference is gone by this point; the
    // name and email live in the detail text, which is the only surviving
    // record of what was here.
    await tx.insert(automationLogs).values({
      jobName: "admin-delete-business",
      businessId: null,
      status: "success",
      detail: `Deleted business "${business.name}" (id ${businessId}, account ${account.email}). Rows deleted: ${Object.entries(counts)
        .map(([table, count]) => `${table}=${count}`)
        .join(", ")}.`,
      finishedAt: new Date().toISOString(),
    });
  });

  return { businessName: business.name, accountEmail: account.email, counts };
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

export type ThemeExcerpt = {
  text: string;
  rating: number;
  authorName: string | null;
  sentiment: string;
};

export type ThemeExcerptsBySentiment = Record<string, { positive: ThemeExcerpt[]; negative: ThemeExcerpt[] }>;

// The one query the "real patient quotes" feature reuses everywhere (main
// dashboard theme cards, Full Report theme sections, and the public
// sample-report page). Every excerpt here has already passed
// lib/ai/validate.ts's sanitizeExtraction() at analysis time, which drops
// any excerpt that isn't a verbatim substring of the source review — so
// nothing here needs re-verifying against review text, it's guaranteed
// exact by the time it lands in reviewThemeMentions.
//
// Scoped to the BUSINESS, not one analysisRunId — under the
// resumable/batched analysis model (lib/analysis/runAnalysis.ts) each run
// only analyzes a subset of a business's reviews, so scoping to a single
// run showed quotes from only that batch instead of the business's actual
// analysis. And within that, only mentions whose review is analyzed at
// THIS BUSINESS'S OWN current version are included — "current" here means
// whatever analyzedWith its most-recently-analyzed review carries, not
// whatever getAIProvider() returns globally right now. That distinction
// matters: a demo business (e.g. the public sample report) whose reviews
// were all analyzed by the older demo-keyword provider is internally
// consistent and must keep showing its quotes even after a real Claude key
// goes live for OTHER, real businesses — it's stale relative to nothing,
// because nothing newer has touched it. A business partway through
// re-analysis (some reviews on the old provider, some on the new one)
// correctly shows quotes from only the newer, current slice.
//
// Bucketed by sentiment (not one flat list) so a caller can never
// accidentally show a positive quote under a "what's wrong" section or vice
// versa — see the QuoteList comments in components/dashboard/Sections.tsx
// and components/report/ReportBody.tsx for why that guarantee has to live
// here, at the data layer, rather than being a convention callers remember.
export async function getThemeExcerptsForBusiness(
  businessId: string,
  limitPerTheme = 2
): Promise<ThemeExcerptsBySentiment> {
  const [latestAnalyzed] = await db
    .select({ analyzedWith: reviews.analyzedWith })
    .from(reviews)
    .where(and(eq(reviews.businessId, businessId), isNotNull(reviews.analyzedAt)))
    .orderBy(desc(reviews.analyzedAt))
    .limit(1);
  // No analyzed reviews at all yet — nothing to show, not "version unknown."
  if (!latestAnalyzed) return {};
  // analyzedWith CAN legitimately be null here — every review on the oldest
  // businesses (seeded before this column existed) is null, not a literal
  // "demo-provider/..." string (see the analyzedWith comment in
  // schema.pg.ts). Null is still a real, meaningful, MATCHABLE version for
  // this business's own purposes: if its most-recently-analyzed review is
  // null, every one of its reviews sharing that same null is exactly the
  // "internally consistent, nothing newer has touched it" case this
  // function exists to preserve — treating null as "no version, show
  // nothing" here is what would have broken the sample report.
  const currentVersionForBusiness = latestAnalyzed.analyzedWith;
  const versionCondition =
    currentVersionForBusiness === null ? isNull(reviews.analyzedWith) : eq(reviews.analyzedWith, currentVersionForBusiness);

  const rows = await db
    .select({
      themeCategory: reviewThemeMentions.themeCategory,
      excerpt: reviewThemeMentions.excerpt,
      sentiment: reviewThemeMentions.sentiment,
      confidence: reviewThemeMentions.confidence,
      rating: reviews.rating,
      authorName: reviews.authorName,
    })
    .from(reviewThemeMentions)
    .innerJoin(reviews, eq(reviewThemeMentions.reviewId, reviews.id))
    .where(and(eq(reviews.businessId, businessId), versionCondition, isNotNull(reviewThemeMentions.excerpt)))
    .orderBy(desc(reviewThemeMentions.confidence));

  const byTheme: ThemeExcerptsBySentiment = {};
  for (const row of rows) {
    if (!row.excerpt) continue;
    if (row.sentiment !== "positive" && row.sentiment !== "negative") continue; // no neutral bucket — nothing currently renders one
    const bucket = byTheme[row.themeCategory] ?? (byTheme[row.themeCategory] = { positive: [], negative: [] });
    const list = row.sentiment === "positive" ? bucket.positive : bucket.negative;
    if (list.length >= limitPerTheme) continue;
    list.push({ text: row.excerpt, rating: row.rating, authorName: row.authorName, sentiment: row.sentiment });
  }
  return byTheme;
}

export type ReviewRatingFilter = "all" | "low" | "mid" | "high"; // 1-2, 3, 4-5

// Real (non-demo) reviews only, newest first, paginated — backs the new
// "All Reviews" browsable list at app/dashboard/reviews/page.tsx.
export async function getPaginatedReviewsForBusiness(
  businessId: string,
  opts: { page?: number; pageSize?: number; ratingFilter?: ReviewRatingFilter } = {}
) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? 25;
  const conditions = [eq(reviews.businessId, businessId), eq(reviews.isDemoData, false)];
  if (opts.ratingFilter === "low") conditions.push(lte(reviews.rating, 2));
  else if (opts.ratingFilter === "mid") conditions.push(eq(reviews.rating, 3));
  else if (opts.ratingFilter === "high") conditions.push(gte(reviews.rating, 4));
  const whereClause = and(...conditions);

  const allMatching = await db.select({ id: reviews.id }).from(reviews).where(whereClause);
  const totalCount = allMatching.length;

  const rows = await db
    .select()
    .from(reviews)
    .where(whereClause)
    .orderBy(desc(reviews.reviewDate))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { reviews: rows, totalCount, page, pageSize, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) };
}

export async function getReviewCountForBusiness(businessId: string) {
  const rows = await db.select({ id: reviews.id }).from(reviews).where(eq(reviews.businessId, businessId));
  return rows.length;
}

// Reviews rated 1-3 stars, newest first — "anything below 4 stars," which
// is what the dashboard's Reviews Worth Your Attention section promises
// (components/dashboard/LowRatedReviewsCard.tsx). Deliberately wider than
// getPaginatedReviewsForBusiness's "low" filter (1-2 only): a 3-star
// review is a real, actionable piece of criticism, and for a high-rated
// practice it's often the only criticism there is.
//
// No isDemoData filter on purpose, unlike most review queries here: a
// business's reviews are all demo or all real, never mixed
// (connectGoogleReviewSource deletes every demo review the moment a real
// Google source is connected), so filtering would only ever produce an
// empty list for a still-on-demo business — which would render as the
// false claim "no reviews below 4 stars" over a demo dataset that has
// them.
export async function getReviewsNeedingAttention(businessId: string, limit = 25) {
  return db
    .select()
    .from(reviews)
    .where(and(eq(reviews.businessId, businessId), lte(reviews.rating, 3)))
    .orderBy(desc(reviews.reviewDate))
    .limit(limit);
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

// Literally what came in since last time — no highest/lowest-rated bias,
// unlike getSampleReviewsForRun above. Backs the dashboard's "new reviews
// this week" section (see components/dashboard/Sections.tsx's NewThisWeek),
// which is deliberately separate from the cumulative theme rollups: under
// the cumulative report model (lib/analysis/runAnalysis.ts), the rollups
// above it are never empty, so this section can honestly show nothing on a
// quiet week without the report as a whole looking broken.
export async function getNewReviewsForRun(businessId: string, periodStart: string, periodEnd: string) {
  return db
    .select()
    .from(reviews)
    .where(and(eq(reviews.businessId, businessId), gte(reviews.reviewDate, periodStart), lt(reviews.reviewDate, periodEnd)))
    .orderBy(desc(reviews.reviewDate));
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

  // Runs stranded in "running" — a run is only ever updated at the very end,
  // so one killed mid-flight (function timeout, deploy) sits in "running"
  // forever and makes this panel's run history lie about what's in flight.
  // runAnalysisForBusiness self-heals these on the next run for the SAME
  // business (see STALE_RUN_MS there); this surfaces any that are still
  // stranded because that business hasn't been re-run since — an invisible
  // failure made visible, same principle as the Stripe webhook check.
  const staleRunCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const stalledRuns = await db
    .select({ id: analysisRuns.id, businessId: analysisRuns.businessId, startedAt: analysisRuns.startedAt })
    .from(analysisRuns)
    .where(and(eq(analysisRuns.status, "running"), lt(analysisRuns.startedAt, staleRunCutoff)))
    .orderBy(desc(analysisRuns.startedAt));

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

  // Per business: how many real reviews are analyzed with the CURRENTLY
  // active provider version vs. stale (analyzed by an older/different
  // provider, or never analyzed) — see the analyzedWith comment in
  // lib/db/schema.pg.ts and the re-analysis logic in
  // lib/analysis/runAnalysis.ts. This is the one place to actually confirm
  // a provider switchover (e.g. setting ANTHROPIC_API_KEY and moving off
  // the keyword-matching DemoProvider) has FINISHED for a business, rather
  // than guessing from the dashboard — and it makes any future prompt-
  // version rollout visible instead of invisible.
  const activeProvider = getAIProvider();
  const currentAnalysisVersion = `${activeProvider.name}/${activeProvider.promptVersion}`;
  const allRealReviews = await db.select().from(reviews).where(eq(reviews.isDemoData, false));
  const reviewAnalysisStatus = allBusinesses
    .map((b) => {
      const businessReviews = allRealReviews.filter((r) => r.businessId === b.id);
      if (businessReviews.length === 0) return null;
      const current = businessReviews.filter((r) => r.analyzedWith === currentAnalysisVersion).length;
      return { businessId: b.id, businessName: b.name, current, stale: businessReviews.length - current, total: businessReviews.length };
    })
    .filter((row): row is { businessId: string; businessName: string; current: number; stale: number; total: number } => row !== null);

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
    currentAnalysisVersion,
    reviewAnalysisStatus,
    stalledRuns,
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
  // "Reviews Analyzed: 45" used to read as a finished number even mid-run —
  // this is the real "imported vs. actually analyzed" comparison, always
  // reliable regardless of provider response shape since it only counts
  // our own rows. Shown on the dashboard so an in-progress analysis says so
  // plainly instead of implying completeness it doesn't have.
  const reviewsAnalyzedCount = allReviews.filter((r) => r.analyzedWith !== null).length;

  const latestRun = await getLatestAnalysisRun(businessId);
  const latestReport = await getLatestWeeklyReport(businessId);
  const rollups = latestRun ? await getThemeRollupsForRun(latestRun.id) : [];

  // Read from the SAME stored report the page's Recommended Actions /
  // Newly Emerging Issues sections render, rather than recomputing live
  // from rollups — latestRun and latestReport.analysisRunId are NOT
  // guaranteed to be the same run. Cost-control dedup (runAnalysisForBusiness)
  // can reuse an existing report's narrative when nothing's changed, but a
  // fresh run still computes and stores its own rollups under its own id;
  // under the cumulative model a later run's period window shifting forward
  // can make a theme that was "new" in the reused report's run no longer
  // register as "new" in the latest run's rollups. Recomputing this count
  // from latestRun's rollups produced a real contradiction on screen ("0"
  // in the metrics row while Recommended Actions still described two
  // emerging themes from the older run backing the displayed report).
  // Counting emergingIssuesJson instead ties this number to the exact text
  // on screen by construction. That array is already sentiment-filtered at
  // generation time (see lib/ai/demoProvider.ts's `emerging` and the
  // matching instruction in lib/ai/prompts/generateNarrative.ts), so this
  // also only counts genuinely negative emerging themes, consistent with
  // the "Emerging Issues" label.
  const emergingIssuesCount = latestReport ? (JSON.parse(latestReport.emergingIssuesJson) as unknown[]).length : 0;
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
    .select({ id: reviewSources.id, possiblyTruncated: reviewSources.possiblyTruncated })
    .from(reviewSources)
    .where(and(eq(reviewSources.businessId, businessId), eq(reviewSources.sourceType, "google")))
    .limit(1);
  const hasDemoData = !googleSource;

  return {
    business,
    totalReviews,
    reviewsAnalyzedCount,
    positivePct: totalReviews > 0 ? Math.round((positiveReviews / totalReviews) * 100) : 0,
    negativePct: totalReviews > 0 ? Math.round((negativeReviews / totalReviews) * 100) : 0,
    avgRating: Math.round(avgRating * 10) / 10,
    emergingIssuesCount,
    importantThemesCount,
    latestRun,
    latestReport,
    rollups: [...rollups].sort((a, b) => b.mentionCount - a.mentionCount),
    hasDemoData,
    // See the possiblyTruncated comment in lib/db/schema.pg.ts. Only ever
    // meaningful once a google source exists; false/undefined-safe on demo
    // data since googleSource is null there.
    possiblyTruncated: googleSource?.possiblyTruncated ?? false,
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

/**
 * Rewrites subject + body on every prospect still sitting in the queue as
 * "drafted", using whatever buildOutreachEmailSubject/buildOutreachDraftBody
 * produce TODAY.
 *
 * Exists because emailSubject/emailBody are frozen into the row at draft
 * time, so changing the template does nothing to drafts already queued —
 * a stale-copy trap this project has hit before. Without this, the only
 * options after a copy change are hand-editing every row or deleting and
 * re-searching (which re-spends a billed Outscraper call).
 *
 * Scoped to "drafted" ONLY, matching the convention in
 * scripts/update-drafted-outreach-signoffs.ts: "sent"/"demo_sent" rows are
 * the historical record of what actually went out and must never be
 * rewritten after the fact, and "skipped" rows were explicitly passed on.
 *
 * NOTE: this DOES overwrite hand-edited drafts — a body the admin
 * customized in the queue is replaced by the fresh template. That's the
 * intended behavior for a copy rollout, but it's why the caller confirms
 * first (see RedraftDraftsButton). contactEmail is deliberately left
 * untouched, since that's looked-up data, not template output.
 */
export async function redraftDraftedProspects(opts: { sampleReportUrl: string; senderName: string }) {
  const rows = await db.select().from(prospects).where(eq(prospects.status, "drafted"));

  for (const p of rows) {
    await db
      .update(prospects)
      .set({
        emailSubject: buildOutreachEmailSubject(p.businessName),
        emailBody: buildOutreachDraftBody({
          practiceName: p.businessName,
          sampleReportUrl: opts.sampleReportUrl,
          senderName: opts.senderName,
        }),
      })
      .where(eq(prospects.id, p.id));
  }

  return { redrafted: rows.length };
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

// ---------------------------------------------------------------------------
// Review Requests (QR code / landing page feature)
// ---------------------------------------------------------------------------

export async function getBusinessBySlug(slug: string) {
  const [row] = await db.select().from(businesses).where(eq(businesses.slug, slug)).limit(1);
  return row ?? null;
}

/**
 * True once at least one visitor has ever loaded this business's public
 * review-request page. Backs the "Print your review request cards" prompt
 * on app/dashboard/page.tsx — an unused feature justifies nothing, so that
 * prompt only shows before the practice has actually put the QR/link in
 * front of a single patient.
 */
export async function hasReviewRequestPageView(businessId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.businessId, businessId), eq(events.eventName, "review_request_page_viewed")))
    .limit(1);
  return !!row;
}

/**
 * The Google "write a review" URL for a business's public review-request
 * page — built from the Place ID already stored on its active "google"
 * review source, not a separately-stored review-page URL, so there's only
 * ever one place a Place ID lives. Returns null if the business hasn't
 * connected a Google source yet (or it's been disconnected/paused), so
 * callers can show a graceful "not set up yet" state instead of a dead
 * link — see app/r/[slug]/page.tsx and app/dashboard/review-requests/page.tsx.
 */
export async function getGoogleWriteReviewUrl(businessId: string): Promise<string | null> {
  const [source] = await db
    .select({ sourceUrl: reviewSources.sourceUrl })
    .from(reviewSources)
    .where(
      and(
        eq(reviewSources.businessId, businessId),
        eq(reviewSources.sourceType, "google"),
        eq(reviewSources.status, "active")
      )
    )
    .limit(1);
  if (!source?.sourceUrl) return null;
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(source.sourceUrl)}`;
}

/**
 * Where a practice OWNER goes to find and reply to their reviews — a
 * different Google URL from getGoogleWriteReviewUrl above (which is the
 * patient-facing "leave a review" link). Google doesn't expose a stable
 * public per-review permalink to deep-link into, so this points at the
 * owner's reviews list for the business, which is the accurate "go find it
 * and reply" destination — see components/dashboard/DraftReplyButton.tsx.
 */
export async function getGoogleReviewsManageUrl(businessId: string): Promise<string | null> {
  const [source] = await db
    .select({ sourceUrl: reviewSources.sourceUrl })
    .from(reviewSources)
    .where(
      and(
        eq(reviewSources.businessId, businessId),
        eq(reviewSources.sourceType, "google"),
        eq(reviewSources.status, "active")
      )
    )
    .limit(1);
  if (!source?.sourceUrl) return null;
  return `https://search.google.com/local/reviews?placeid=${encodeURIComponent(source.sourceUrl)}`;
}

export async function getReviewById(reviewId: string) {
  const [row] = await db.select().from(reviews).where(eq(reviews.id, reviewId)).limit(1);
  return row ?? null;
}

export async function getReviewReply(reviewId: string) {
  const [row] = await db.select().from(reviewReplies).where(eq(reviewReplies.reviewId, reviewId)).limit(1);
  return row ?? null;
}

/**
 * Backs "Draft a reply" (app/api/reviews/[id]/draft-reply/route.ts) —
 * reviewId is unique on this table by design, so a second draft attempt on
 * the same review is a caller bug, not a state this needs to handle
 * gracefully (the route always checks getReviewReply first and returns the
 * existing draft instead of calling this again).
 */
export async function saveReviewReply(reviewId: string, draftText: string) {
  const [row] = await db.insert(reviewReplies).values({ reviewId, draftText }).returning();
  return row;
}

/**
 * Anonymous private feedback submitted from a practice's public
 * review-request page (app/r/[slug]) when a patient chooses "send private
 * feedback" instead of "leave a public review." See the comment above the
 * patientFeedback table (lib/db/schema.pg.ts) for why this deliberately
 * takes no name/email/phone — do not add one here either.
 */
export async function submitPatientFeedback(businessId: string, input: { rating: number | null; message: string }) {
  const [row] = await db
    .insert(patientFeedback)
    .values({ businessId, rating: input.rating, message: input.message })
    .returning();
  return row;
}

export async function getPatientFeedbackForBusiness(businessId: string, limit = 100) {
  return db
    .select()
    .from(patientFeedback)
    .where(eq(patientFeedback.businessId, businessId))
    .orderBy(desc(patientFeedback.createdAt))
    .limit(limit);
}

export type ReviewRequestStats = {
  pageViews: number;
  publicClicks: number;
  privateSubmissions: number;
  newReviewsInWindow: number;
  ratingBefore: number | null;
  ratingNow: number | null;
  reviewCountBefore: number;
};

// Below this many real reviews dated before the window start, an average
// rating swings too wildly per-review to mean anything (a single review
// moves a 3-review average by up to a third of a star) — the attribution
// panel shows "not enough history yet" instead of a misleading decimal
// below this threshold. See getReviewRequestStats.
const MIN_REVIEWS_FOR_RATING_TREND = 5;

/**
 * Backs the Review Requests dashboard's attribution panel
 * (app/dashboard/review-requests/page.tsx). Deliberately reports only
 * counts measured over the same window — page views, public-review clicks,
 * private feedback submissions, and new real reviews that arrived — never
 * a claimed "reviews generated by Notabl" number. Scans and new reviews are
 * correlated, not causally proven (someone could leave a review without
 * ever scanning), and the dashboard page says so explicitly next to these
 * numbers.
 */
export async function getReviewRequestStats(
  businessId: string,
  windowStart: string,
  windowEnd: string
): Promise<ReviewRequestStats> {
  const eventRows = await db
    .select({ eventName: events.eventName })
    .from(events)
    .where(and(eq(events.businessId, businessId), gte(events.createdAt, windowStart), lt(events.createdAt, windowEnd)));

  const pageViews = eventRows.filter((e) => e.eventName === "review_request_page_viewed").length;
  const publicClicks = eventRows.filter((e) => e.eventName === "review_request_public_clicked").length;
  const privateSubmissions = eventRows.filter((e) => e.eventName === "review_request_private_submitted").length;

  // Real reviews only (isDemoData = false) — a business still on demo data
  // has no real Google reviews for this panel to attribute anything to.
  const allReviews = await db
    .select({ rating: reviews.rating, reviewDate: reviews.reviewDate })
    .from(reviews)
    .where(and(eq(reviews.businessId, businessId), eq(reviews.isDemoData, false)));

  const newReviewsInWindow = allReviews.filter((r) => r.reviewDate >= windowStart && r.reviewDate < windowEnd).length;

  const reviewsBefore = allReviews.filter((r) => r.reviewDate < windowStart);
  const ratingBefore =
    reviewsBefore.length >= MIN_REVIEWS_FOR_RATING_TREND
      ? reviewsBefore.reduce((sum, r) => sum + r.rating, 0) / reviewsBefore.length
      : null;
  // "Now" is always the full current set (not bounded by windowEnd) — the
  // point of the comparison is "where things stand today" vs. "where they
  // stood before this window started."
  const ratingNow =
    reviewsBefore.length >= MIN_REVIEWS_FOR_RATING_TREND && allReviews.length > 0
      ? allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
      : null;

  return {
    pageViews,
    publicClicks,
    privateSubmissions,
    newReviewsInWindow,
    ratingBefore,
    ratingNow,
    reviewCountBefore: reviewsBefore.length,
  };
}
