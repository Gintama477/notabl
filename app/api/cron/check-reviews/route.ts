import { NextRequest, NextResponse } from "next/server";
import { getAlertCandidateBusinesses, processBusinessForAlert, pickBusinessToSync, syncBusinessReviews } from "@/lib/alerts/reviewAlerts";

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

// A sync is only STARTED if this much of the run is still unspent. One
// Outscraper fetch has been observed taking most of the 60s ceiling on a
// large practice, so beginning one late in the run buys nothing and
// guarantees the function is killed. Checked before starting rather than
// during, because the call itself can't be interrupted.
const SYNC_START_DEADLINE_MS = 15_000;

export async function GET(req: NextRequest) {
  // Fail closed: no secret configured means this route refuses to run at
  // all, rather than silently trusting every caller. The owner sets
  // CRON_SECRET in Vercel; Vercel's own cron invocations send it as
  // `Authorization: Bearer ${CRON_SECRET}` automatically.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("check-reviews: CRON_SECRET is not configured — refusing to run.");
    return NextResponse.json({ error: "Not configured" }, { status: 401 });
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  // PHASE 2 — re-import ONE business's reviews, whichever is most overdue.
  // Deliberately last and deliberately singular: a single Outscraper fetch
  // can consume the whole 60s function by itself (a 449-review practice
  // did, killing this route before it logged anything). Runs only if
  // there's real headroom left, since starting a 40-second call with 10
  // seconds to go just guarantees a kill. Being killed here is safe — the
  // import is resumable and every alert above has already been sent.
  const toSync = pickBusinessToSync(candidates);
  if (toSync && Date.now() - startedAt < SYNC_START_DEADLINE_MS) {
    results.push(await syncBusinessReviews(toSync));
  } else if (toSync) {
    results.push({
      businessId: toSync.businessId,
      action: "sync_deferred",
      detail: "not enough time left this run — will be the most-overdue business next run",
    });
  }

  return NextResponse.json({ ok: true, candidateCount: candidates.length, processedCount: results.length, results });
}
