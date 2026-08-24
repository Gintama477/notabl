import { NextRequest, NextResponse, after } from "next/server";
import { getAlertCandidateBusinesses, processBusinessForAlert, orderBusinessesForSync } from "@/lib/alerts/reviewAlerts";
import { denyUnauthorizedCron } from "@/lib/auth/cronAuth";
import { db } from "@/lib/db/client";
import { automationLogs } from "@/lib/db/schema.pg";

// Runs once daily (see vercel.json) — replaces the old calendar-scheduled
// weekly report with triggered alerts. Reviews don't arrive fast enough to
// need more than daily, and Vercel Hobby only allows one run per day per
// cron job anyway.
export const maxDuration = 60;

// Overall soft budget for the whole run, mirroring the per-business
// wall-clock budget pattern in lib/analysis/runAnalysis.ts — leaves
// headroom inside maxDuration and, if there are more candidate businesses
// than fit in one run, simply leaves the rest for tomorrow's cron rather
// than risking the function getting killed mid-business.
const CRON_BUDGET_MS = 50_000;

// Upper bound on how many sync requests one run fans out. Not expected to
// bind at any realistic near-term customer count — it's a guard against
// dispatching hundreds of simultaneous Outscraper calls if this grows
// faster than anyone re-reads this file. Whatever exceeds it is simply the
// least overdue, and leads the ordering next run.
const MAX_SYNC_DISPATCHES_PER_RUN = 25;

// Delay added per dispatch so N requests don't hit Outscraper in the same
// instant. They still run concurrently — this only staggers their starts,
// so the whole fan-out is spread over a couple of seconds rather than
// serialized.
const DISPATCH_STAGGER_MS = 250;

export async function GET(req: NextRequest) {
  const denied = denyUnauthorizedCron(req, "check-reviews");
  if (denied) return denied;
  // Guaranteed set — denyUnauthorizedCron returns a 401 when it isn't.
  // Needed below to authenticate this route's own dispatches to the
  // per-business sync worker.
  const secret = process.env.CRON_SECRET as string;

  const candidates = await getAlertCandidateBusinesses();
  const startedAt = Date.now();
  const results = [];

  // PHASE 1 — alerts for every candidate, from already-stored data only.
  // Cheap and predictable (DB reads plus at most one email each), so it
  // runs first and is overwhelmingly likely to finish. Ordering matters:
  // this used to come after a per-business Outscraper sync, which meant a
  // timeout during that sync silently cost everyone their alerts.
  for (const candidate of candidates) {
    if (Date.now() - startedAt > CRON_BUDGET_MS) {
      results.push({ businessId: candidate.businessId, action: "deferred", reason: "cron time budget reached — picked up next run" });
      continue;
    }
    results.push(await processBusinessForAlert(candidate));
  }

  // PHASE 2 — fan out the imports instead of doing one inline.
  //
  // This route used to sync exactly one business itself, because a single
  // Outscraper fetch can consume most of a 60-second function. That worked
  // but meant with N connected businesses each got fresh Google data every
  // N days — at 7 customers, a new 1-star review could sit unimported for
  // a week while the landing page and the outreach email both promise the
  // practice hears about it the same day.
  //
  // Now every candidate gets its own request to /api/cron/sync-business,
  // and therefore its own fresh 60 seconds. Vercel Pro isn't the fix here:
  // a bigger ceiling still doesn't fit as N grows, and this doesn't need
  // one.
  const toDispatch = orderBusinessesForSync(candidates).slice(0, MAX_SYNC_DISPATCHES_PER_RUN);

  // Deliberately NOT getSiteUrl(). That returns the public canonical host
  // (https://trynotabl.com), which 308-redirects to www — and fetch DROPS
  // the Authorization header across an origin change, by design. Every
  // dispatch therefore arrived at the worker unauthenticated, was rejected
  // 401, and did nothing, while this route still reported them as
  // dispatched. Confirmed in production: the same POST succeeded against
  // www and returned 401 through the apex redirect.
  //
  // VERCEL_URL is this deployment's own host and never redirects, so the
  // header survives. Falls back to the incoming request's origin, which is
  // correct for local dev.
  const internalBase = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : req.nextUrl.origin;
  const syncUrl = new URL("/api/cron/sync-business", internalBase).toString();

  // after() keeps the dispatches alive once the response has been sent —
  // on Vercel it maps to waitUntil. Without it, fire-and-forget requests
  // can be cut off when the function returns, which would look like it
  // worked while silently importing nothing. Awaiting them here instead
  // would make this route as slow as its slowest child, which is the
  // problem being solved.
  after(async () => {
    await Promise.allSettled(
      toDispatch.map(async (candidate, i) => {
        // Staggered starts, not sequential runs — they still overlap, this
        // just avoids firing every Outscraper call in the same instant.
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, i * DISPATCH_STAGGER_MS));
        try {
          const res = await fetch(syncUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
            body: JSON.stringify({ businessId: candidate.businessId }),
          });
          if (!res.ok) {
            // Recorded, not just console-logged. This whole path failed
            // silently once — the response is already sent by the time
            // these run, so a bad status has nowhere to surface unless it
            // is written down. It shows up in the admin panel's automation
            // log, which is where anyone would actually look.
            const detail = `Sync dispatch for "${candidate.businessName}" returned ${res.status} from ${syncUrl}.`;
            console.error(`check-reviews: ${detail}`);
            await db.insert(automationLogs).values({
              jobName: "check-reviews-dispatch",
              businessId: candidate.businessId,
              status: "failed",
              detail,
              finishedAt: new Date().toISOString(),
            });
          }
        } catch (err) {
          // A failed dispatch costs this business one day of freshness and
          // nothing else: imports dedupe on (reviewSourceId,
          // externalReviewId) and lastSyncedAt is only written on success,
          // so tomorrow's run picks it up as the most overdue.
          console.error(`check-reviews: dispatch failed for ${candidate.businessId}:`, err);
        }
      })
    );
  });

  for (const candidate of toDispatch) {
    results.push({ businessId: candidate.businessId, action: "sync_dispatched" });
  }

  return NextResponse.json({
    ok: true,
    candidateCount: candidates.length,
    processedCount: results.length,
    dispatchedCount: toDispatch.length,
    results,
  });
}
