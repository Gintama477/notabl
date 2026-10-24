// Report-first outreach (24 Oct 2026).
//
// The old cold email OFFERED to run Notabl on a practice's reviews ("happy
// to run it on yours"). Zero replies. This flow runs it first: a real
// report is built from the prospect's own public Google reviews, published
// at an unguessable /report/[token] URL, and the first email links to it.
//
// Honesty rules, same as marketing/personalized-outreach-system.md Tier 2:
// every claim in the email traces to a stored weekly_reports row for that
// prospect's own reviews. Nothing is ever said about a prospect's reviews
// that didn't come out of the pipeline.
//
// Each prospect gets a throwaway accounts row (role = "prospect") and a
// businesses row so the existing import → analysis → narrative pipeline
// runs unchanged. Those rows are invisible to customers (no subscription,
// so the daily alerts cron ignores them) and are released automatically if
// the real practice signs up (see connectGoogleReviewSource).

import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts, businesses, prospects, reviews, weeklyReports } from "@/lib/db/schema.pg";
import { connectGoogleReviewSource, generateUniqueBusinessSlug } from "@/lib/db/queries";
import { runAnalysisForBusiness } from "@/lib/analysis/runAnalysis";

export class DeadlineReached extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeadlineReached";
  }
}

export const PROSPECT_ACCOUNT_ROLE = "prospect";
export const PROSPECT_ACCOUNT_DOMAIN = "prospects.trynotabl.invalid";
/** Newest-first cap on reviews imported per prospect. Outscraper bills per review; Claude per extraction. */
export const DEFAULT_PROSPECT_REVIEWS_LIMIT = 60;

export type ProspectRow = typeof prospects.$inferSelect;

export function campaignToIndustry(campaign: string): string {
  const c = campaign.toLowerCase();
  if (c.includes("dental") || c.includes("dentist")) return "dental";
  if (c.includes("auto")) return "auto-repair";
  if (c.includes("hvac")) return "hvac";
  return "local-business";
}

/**
 * Finds or creates the throwaway business for a prospect. Idempotent.
 */
export async function ensureProspectBusiness(prospect: ProspectRow) {
  if (prospect.reportBusinessId) {
    const [existing] = await db.select().from(businesses).where(eq(businesses.id, prospect.reportBusinessId)).limit(1);
    if (existing) return existing;
  }

  const email = `prospect-${prospect.id}@${PROSPECT_ACCOUNT_DOMAIN}`;
  let [account] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
  if (!account) {
    [account] = await db.insert(accounts).values({ email, role: PROSPECT_ACCOUNT_ROLE }).returning();
  }

  const slug = await generateUniqueBusinessSlug(prospect.businessName);
  const [business] = await db
    .insert(businesses)
    .values({
      accountId: account.id,
      name: prospect.businessName,
      industry: campaignToIndustry(prospect.campaign),
      website: prospect.website,
      city: prospect.city,
      state: prospect.state,
      phone: prospect.phone,
      slug,
    })
    .returning();

  await db.update(prospects).set({ reportBusinessId: business.id }).where(eq(prospects.id, prospect.id));
  return business;
}

export function newReportToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Full build for one prospect: import newest reviews → analyze until no
 * review is pending → confirm a narrative report exists → mark "ready".
 * Returns a summary; throws on any hard failure (nothing is marked ready
 * unless a report row actually exists).
 */
export async function buildProspectReport(
  prospectId: string,
  opts: { reviewsLimit?: number; maxAnalysisRounds?: number; deadlineMs?: number; log?: (line: string) => void } = {}
) {
  const log = opts.log ?? (() => {});
  const reviewsLimit = opts.reviewsLimit ?? DEFAULT_PROSPECT_REVIEWS_LIMIT;
  const maxRounds = opts.maxAnalysisRounds ?? 40;

  const [prospect] = await db.select().from(prospects).where(eq(prospects.id, prospectId)).limit(1);
  if (!prospect) throw new Error(`Prospect ${prospectId} not found.`);

  const business = await ensureProspectBusiness(prospect);
  log(`business ${business.id} (${business.name})`);

  const imported = await connectGoogleReviewSource(business.id, business.name, prospect.googlePlaceId, { reviewsLimit });
  log(`imported ${imported.imported} new, ${imported.skipped} existing${"cooledDown" in imported && imported.cooledDown ? " (cooldown)" : ""}`);

  const [{ count: reviewCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reviews)
    .where(and(eq(reviews.businessId, business.id), eq(reviews.isDemoData, false)));
  if (reviewCount < 10) {
    throw new Error(`Only ${reviewCount} real reviews imported for ${business.name} — too few for an honest report.`);
  }

  // Cumulative model: the "period" only anchors trend comparison. 90 days
  // gives the "what's shifting" section something to compare against.
  const periodEnd = new Date().toISOString();
  let remaining = Infinity;
  for (let round = 1; round <= maxRounds && remaining > 0; round++) {
    // Resumable: everything above is idempotent (import has a cooldown,
    // analysis skips already-analyzed reviews), so a caller with a wall-
    // clock limit can stop here and pick up on the next invocation.
    if (opts.deadlineMs && Date.now() > opts.deadlineMs) throw new DeadlineReached(`deadline reached before round ${round} (${remaining} remaining)`);
    const result = await runAnalysisForBusiness(business.id, business.name, periodEnd, 90);
    remaining = result.reviewsRemaining ?? 0;
    log(`analysis round ${round}: analyzed ${result.reviewsNewlyAnalyzed}, remaining ${remaining}`);
  }
  if (remaining > 0) throw new Error(`Analysis still has ${remaining} reviews pending after ${maxRounds} rounds.`);

  const [report] = await db
    .select({ id: weeklyReports.id })
    .from(weeklyReports)
    .where(eq(weeklyReports.businessId, business.id))
    .orderBy(desc(weeklyReports.createdAt))
    .limit(1);
  if (!report) throw new Error(`No report row produced for ${business.name}.`);

  const token = prospect.reportToken ?? newReportToken();
  await db
    .update(prospects)
    .set({
      reportToken: token,
      reportBuiltAt: new Date().toISOString(),
      reportReviewCount: reviewCount,
      status: "ready",
    })
    .where(eq(prospects.id, prospect.id));

  return { businessId: business.id, reportId: report.id, reviewCount, token };
}

export function prospectReportUrl(token: string, baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.trynotabl.com") {
  return `${baseUrl.replace(/\/$/, "")}/report/${token}`;
}

/** Everything the public /report/[token] page needs, or null if the token is unknown or the report isn't built. */
export async function getProspectReportByToken(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const [prospect] = await db.select().from(prospects).where(eq(prospects.reportToken, token)).limit(1);
  if (!prospect || !prospect.reportBusinessId || prospect.replyStatus === "remove") return null;
  const [business] = await db.select().from(businesses).where(eq(businesses.id, prospect.reportBusinessId)).limit(1);
  if (!business) return null;
  const [report] = await db
    .select()
    .from(weeklyReports)
    .where(eq(weeklyReports.businessId, business.id))
    .orderBy(desc(weeklyReports.createdAt))
    .limit(1);
  if (!report) return null;
  return { prospect, business, report };
}

export async function recordProspectReportView(prospectId: string) {
  await db
    .update(prospects)
    .set({
      reportViewCount: sql`${prospects.reportViewCount} + 1`,
      reportFirstViewedAt: sql`coalesce(${prospects.reportFirstViewedAt}, ${new Date().toISOString()})`,
    })
    .where(eq(prospects.id, prospectId));
}

/** Prospects whose report is built and whose first email hasn't gone out. */
export async function getReadyProspects(limit: number) {
  return db
    .select()
    .from(prospects)
    .where(and(eq(prospects.status, "ready"), isNull(prospects.sentAt)))
    // Random order so each day's batch mixes campaigns (dental + auto)
    // instead of exhausting one list before the other starts.
    .orderBy(sql`random()`)
    .limit(limit);
}

/** Sent ≥ `days` days ago, no follow-up yet, no reply recorded, report-first only. */
export async function getFollowupDueProspects(days: number, limit: number) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return db
    .select()
    .from(prospects)
    .where(
      and(
        eq(prospects.status, "sent"),
        isNull(prospects.followupSentAt),
        isNull(prospects.replyStatus),
        lte(prospects.sentAt, cutoff),
        sql`${prospects.reportToken} is not null`
      )
    )
    .orderBy(prospects.sentAt)
    .limit(limit);
}

/** Real (non-demo) sends in the last 24h across the whole prospects table — the global daily cap input. */
export async function countSendsLast24h() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [a] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(prospects)
    .where(gte(prospects.sentAt, since));
  const [b] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(prospects)
    .where(gte(prospects.followupSentAt, since));
  return (a?.n ?? 0) + (b?.n ?? 0);
}
