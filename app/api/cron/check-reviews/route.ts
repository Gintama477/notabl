import { NextRequest, NextResponse } from "next/server";
import { getAlertCandidateBusinesses, processBusinessForAlert } from "@/lib/alerts/reviewAlerts";

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

  for (const candidate of candidates) {
    if (Date.now() - startedAt > CRON_BUDGET_MS) {
      results.push({ businessId: candidate.businessId, action: "deferred", reason: "cron time budget reached — picked up next run" });
      continue;
    }
    const outcome = await processBusinessForAlert(candidate);
    results.push(outcome);
  }

  return NextResponse.json({ ok: true, candidateCount: candidates.length, processedCount: results.length, results });
}
