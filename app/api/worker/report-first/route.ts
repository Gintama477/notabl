import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, pgClient } from "@/lib/db/client";
import { prospects, reviewSources, weeklyReports } from "@/lib/db/schema.pg";
import { connectGoogleReviewSource, findAndDraftProspects, verifyProspectEmails, findEmailForProspect } from "@/lib/db/queries";
import { runAnalysisForBusiness } from "@/lib/analysis/runAnalysis";
import { ensureProspectBusiness, newReportToken, DEFAULT_PROSPECT_REVIEWS_LIMIT } from "@/lib/outreach/prospectReport";

// Report-first outreach WORKER. Vercel functions stop at 60 seconds, so
// the build (one Outscraper fetch + several 45-second analysis rounds per
// prospect) is split into single steps, each one call. An external loop
// (the hub session's sandbox) calls this every minute until "done".
//
// Auth: a dedicated WORKER_TOKEN, separate from CRON_SECRET (Vercel's) and
// the admin key (a human's). Nothing here sends email — see
// app/api/cron/outreach-autosend for that.
export const maxDuration = 60;

function denied(req: NextRequest) {
  const token = process.env.WORKER_TOKEN;
  const header = req.headers.get("authorization") ?? "";
  if (!token || header !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  return null;
}

const SELECTABLE = ["drafted", "building"] as const;
const PROSPECT_PERIOD_DAYS = 3650;

export async function GET(req: NextRequest) {
  const d = denied(req);
  if (d) return d;
  const q = req.nextUrl.searchParams;
  const action = q.get("action") ?? "status";

  try {
    if (action === "migrate") {
      // Idempotent; mirrors drizzle-pg/0009_prospect_reports.sql.
      await pgClient.unsafe(`
        ALTER TABLE prospects ADD COLUMN IF NOT EXISTS report_business_id text;
        ALTER TABLE prospects ADD COLUMN IF NOT EXISTS report_token text;
        ALTER TABLE prospects ADD COLUMN IF NOT EXISTS report_built_at text;
        ALTER TABLE prospects ADD COLUMN IF NOT EXISTS report_review_count integer;
        ALTER TABLE prospects ADD COLUMN IF NOT EXISTS report_view_count integer NOT NULL DEFAULT 0;
        ALTER TABLE prospects ADD COLUMN IF NOT EXISTS report_first_viewed_at text;
        ALTER TABLE prospects ADD COLUMN IF NOT EXISTS followup_sent_at text;
        ALTER TABLE prospects ADD COLUMN IF NOT EXISTS reply_status text;
        CREATE UNIQUE INDEX IF NOT EXISTS prospects_report_token_unique ON prospects (report_token);
      `);
      return NextResponse.json({ ok: true, action });
    }

    if (action === "find") {
      const city = q.get("city");
      const state = q.get("state") ?? "New Jersey";
      const category = q.get("category") ?? "Dentist";
      const campaign = q.get("campaign") ?? "notabl-dental";
      if (!city) return NextResponse.json({ error: "city required" }, { status: 400 });
      const r = await findAndDraftProspects({
        city,
        state,
        category,
        campaign,
        limit: Number(q.get("limit")) || 15,
        minReviewCount: Number(q.get("minReviews")) || 100,
        maxReviewCount: Number(q.get("maxReviews")) || 1500,
        sampleReportUrl: "https://www.trynotabl.com/sample-report",
        senderName: process.env.OUTREACH_SENDER_NAME || "Murat Emre Yesilsirt",
      });
      return NextResponse.json({ ok: true, action, city, ...r });
    }

    if (action === "find-email") {
      // Looks up a contact email on each prospect's own website (same code
      // as the admin "Find email" button), a few per call within the budget.
      const campaign = q.get("campaign");
      if (!campaign) return NextResponse.json({ error: "campaign required" }, { status: 400 });
      const started = Date.now();
      const pending = and(eq(prospects.campaign, campaign), isNull(prospects.contactEmail), isNull(prospects.emailValidationReason), sql`${prospects.website} is not null`);
      const rows = await db
        .select({ id: prospects.id, name: prospects.businessName, website: prospects.website })
        .from(prospects)
        .where(pending)
        .orderBy(prospects.createdAt)
        .limit(Number(q.get("limit")) || 8);
      const out: Array<{ name: string; email: string | null; source?: string | null; error?: string }> = [];
      for (const r of rows) {
        if (Date.now() - started > 45_000) break;
        try {
          const f = await findEmailForProspect(r.id);
          if (f.email) {
            await db.update(prospects).set({ contactEmail: f.email }).where(eq(prospects.id, r.id));
          } else {
            await db.update(prospects).set({ emailValidationReason: "no email found on site" }).where(eq(prospects.id, r.id));
          }
          out.push({ name: r.name, email: f.email, source: f.source });
        } catch (e) {
          await db.update(prospects).set({ emailValidationReason: "lookup failed" }).where(eq(prospects.id, r.id));
          out.push({ name: r.name, email: null, error: e instanceof Error ? e.message : String(e) });
        }
      }
      const [{ left }] = await db.select({ left: sql<number>`count(*)::int` }).from(prospects).where(pending);
      return NextResponse.json({ ok: true, action, processed: out.length, remaining: left, out });
    }

    if (action === "verify") {
      const r = await verifyProspectEmails({ limit: Number(q.get("limit")) || 25 });
      return NextResponse.json({ ok: true, action, ...r });
    }

    if (action === "list") {
      const campaign = q.get("campaign");
      const rows = await db
        .select({
          id: prospects.id,
          businessName: prospects.businessName,
          city: prospects.city,
          rating: prospects.googleRating,
          reviews: prospects.googleReviewCount,
          email: prospects.contactEmail,
          emailStatus: prospects.emailValidationStatus,
          status: prospects.status,
          token: prospects.reportToken,
          reportReviews: prospects.reportReviewCount,
          views: prospects.reportViewCount,
          sentAt: prospects.sentAt,
          followupSentAt: prospects.followupSentAt,
          replyStatus: prospects.replyStatus,
        })
        .from(prospects)
        .where(campaign ? eq(prospects.campaign, campaign) : sql`true`)
        .orderBy(prospects.createdAt);
      return NextResponse.json({ ok: true, action, count: rows.length, rows });
    }

    if (action === "rebuild") {
      // Throws away a prospect's analysis + report (reviews stay imported,
      // so no Outscraper cost) and queues it to be built again.
      const id = q.get("id");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const [p] = await db.select().from(prospects).where(eq(prospects.id, id)).limit(1);
      if (!p?.reportBusinessId) return NextResponse.json({ error: "no report business" }, { status: 400 });
      await pgClient.unsafe(`delete from analysis_runs where business_id = $1`, [p.reportBusinessId]);
      await pgClient.unsafe(`update reviews set analyzed_at = null, analyzed_with = null where business_id = $1`, [p.reportBusinessId]);
      await db.update(prospects).set({ reportToken: null, reportBuiltAt: null, reportReviewCount: null, reportViewCount: 0, reportFirstViewedAt: null, status: "building" }).where(eq(prospects.id, id));
      return NextResponse.json({ ok: true, action, id, prospect: p.businessName });
    }

    if (action === "set-status") {
      // Hand-recorded reply or skip: ?id=&status=skipped|sent&reply=interested|not_interested|remove
      const id = q.get("id");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const patch: Partial<typeof prospects.$inferInsert> = {};
      if (q.get("status")) patch.status = q.get("status")!;
      if (q.get("reply")) patch.replyStatus = q.get("reply")!;
      if (q.get("skipReason")) patch.skipReason = q.get("skipReason")!;
      await db.update(prospects).set(patch).where(eq(prospects.id, id));
      return NextResponse.json({ ok: true, action, id, patch });
    }

    if (action === "build") {
      // ONE step for the next prospect that needs work, among ?ids=a,b,c
      // or ?campaign=. Steps: (1) create business + import reviews,
      // (2..n) one analysis round each, (final) mark ready.
      const ids = q.get("ids")?.split(",").map((s) => s.trim()).filter(Boolean);
      const campaign = q.get("campaign");
      const reviewsLimit = Number(q.get("reviews")) || DEFAULT_PROSPECT_REVIEWS_LIMIT;
      const where = and(
        inArray(prospects.status, [...SELECTABLE]),
        isNull(prospects.reportToken),
        ids?.length ? inArray(prospects.id, ids) : campaign ? eq(prospects.campaign, campaign) : sql`false`
      );
      // "building" first so one prospect is finished before the next starts.
      const [p] = await db.select().from(prospects).where(where).orderBy(sql`case when ${prospects.status} = 'building' then 0 else 1 end`, prospects.createdAt).limit(1);
      if (!p) return NextResponse.json({ ok: true, action, done: true });

      const business = await ensureProspectBusiness(p);
      const [source] = await db
        .select({ id: reviewSources.id, lastSyncedAt: reviewSources.lastSyncedAt })
        .from(reviewSources)
        .where(and(eq(reviewSources.businessId, business.id), eq(reviewSources.sourceType, "google")))
        .limit(1);

      if (!source?.lastSyncedAt) {
        const imported = await connectGoogleReviewSource(business.id, business.name, p.googlePlaceId, { reviewsLimit });
        await db.update(prospects).set({ status: "building" }).where(eq(prospects.id, p.id));
        return NextResponse.json({ ok: true, action, done: false, prospect: p.businessName, step: "import", ...imported });
      }

      // 3650-day period: the "prior" snapshot is empty, so a prospect's
      // first (and only) report carries no "up from N since your last
      // report" comparisons — there is no last report, and the page is
      // read by someone who has never seen one.
      const result = await runAnalysisForBusiness(business.id, business.name, new Date().toISOString(), PROSPECT_PERIOD_DAYS);
      if (result.reviewsRemaining > 0) {
        return NextResponse.json({ ok: true, action, done: false, prospect: p.businessName, step: "analysis", remaining: result.reviewsRemaining, analyzed: result.reviewsNewlyAnalyzed });
      }

      const [report] = await db.select({ id: weeklyReports.id }).from(weeklyReports).where(eq(weeklyReports.businessId, business.id)).limit(1);
      if (!report) {
        return NextResponse.json({ ok: true, action, done: false, prospect: p.businessName, step: "narrative-pending" });
      }
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(sql`reviews`)
        .where(sql`business_id = ${business.id} and is_demo_data = false`);
      if (n < 10) {
        await db.update(prospects).set({ status: "skipped", skipReason: `only ${n} reviews imported` }).where(eq(prospects.id, p.id));
        return NextResponse.json({ ok: true, action, done: false, prospect: p.businessName, step: "skipped-too-few", reviews: n });
      }
      const token = newReportToken();
      await db
        .update(prospects)
        .set({ reportToken: token, reportBuiltAt: new Date().toISOString(), reportReviewCount: n, status: "ready" })
        .where(eq(prospects.id, p.id));
      return NextResponse.json({ ok: true, action, done: false, prospect: p.businessName, step: "ready", reviews: n, url: `https://www.trynotabl.com/report/${token}` });
    }

    // status
    const rows = await db
      .select({ campaign: prospects.campaign, status: prospects.status, n: sql<number>`count(*)::int` })
      .from(prospects)
      .groupBy(prospects.campaign, prospects.status);
    return NextResponse.json({ ok: true, action: "status", rows });
  } catch (e) {
    return NextResponse.json({ ok: false, action, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
