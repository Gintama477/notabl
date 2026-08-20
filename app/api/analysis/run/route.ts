// Manual "Run analysis now" trigger — Phase 1 stand-in for the Phase 2
// scheduled cron job. Same underlying function either way (see
// lib/analysis/runAnalysis.ts), so wiring up the real schedule later doesn't
// change this logic.

import { NextResponse } from "next/server";
import { getSessionAccountId } from "@/lib/auth/session";
import { getBusinessForAccount } from "@/lib/db/queries";
import { runAnalysisForBusiness } from "@/lib/analysis/runAnalysis";
import { track } from "@/lib/analytics/track";
import { checkRateLimit } from "@/lib/rateLimit";

// runAnalysisForBusiness's extraction loop is wall-clock budgeted at 45s
// (see EXTRACTION_BUDGET_MS in lib/analysis/runAnalysis.ts) specifically so
// it finishes comfortably inside this — 60s is safe on every Vercel plan
// and leaves headroom past the 45s budget for the rollup/narrative/inserts
// that run after the loop. Without this, the default (10s on the Hobby
// plan) would kill a real Claude run partway through a business with more
// than a handful of reviews.
export const maxDuration = 60;

export async function POST() {
  const accountId = await getSessionAccountId();
  if (!accountId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Manual runs per 10 minutes per account — this endpoint re-runs the full
  // analysis pipeline (a real per-call cost once a live Claude key is
  // configured, per docs/CREDENTIALS-NEEDED.md), so it's keyed by the
  // authenticated account rather than IP. Raised from 10 to 20: a single
  // pass over a large business's reviews now takes several ROUNDS (each
  // call only makes ~45s of progress — see reviewsRemaining below), and
  // components/dashboard/RunAnalysisButton.tsx calls this endpoint
  // automatically once per round until it's done, so the effective call
  // count for one full re-analysis is higher than one click used to mean.
  const rateLimit = checkRateLimit(`analysis-run:${accountId}`, 20, 10 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many analysis runs. Please wait a few minutes and try again." },
      {
        status: 429,
        headers: rateLimit.retryAfterSeconds ? { "Retry-After": String(rateLimit.retryAfterSeconds) } : undefined,
      }
    );
  }

  const business = await getBusinessForAccount(accountId);
  if (!business) return NextResponse.json({ error: "No business found" }, { status: 404 });

  try {
    const result = await runAnalysisForBusiness(business.id, business.name, new Date().toISOString());
    await track("analysis_completed", {
      accountId,
      businessId: business.id,
      properties: { reviewsAnalyzed: result.reviewsNewlyAnalyzed },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Manual analysis run failed:", err);
    return NextResponse.json({ error: "Analysis failed. Check server logs." }, { status: 500 });
  }
}
