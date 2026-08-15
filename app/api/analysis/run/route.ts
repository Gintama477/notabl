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

export async function POST() {
  const accountId = await getSessionAccountId();
  if (!accountId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // 10 manual runs per 10 minutes per account — this endpoint re-runs the
  // full analysis pipeline (a real per-call cost once a live Claude key is
  // configured, per docs/CREDENTIALS-NEEDED.md), so it's keyed by the
  // authenticated account rather than IP. Generous enough for a person
  // clicking "Run Analysis Now" repeatedly, tight enough to stop a script.
  const rateLimit = checkRateLimit(`analysis-run:${accountId}`, 10, 10 * 60 * 1000);
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
