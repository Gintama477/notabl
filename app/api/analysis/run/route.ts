// Manual "Run analysis now" trigger — Phase 1 stand-in for the Phase 2
// scheduled cron job. Same underlying function either way (see
// lib/analysis/runAnalysis.ts), so wiring up the real schedule later doesn't
// change this logic.

import { NextResponse } from "next/server";
import { getSessionAccountId } from "@/lib/auth/session";
import { getBusinessForAccount } from "@/lib/db/queries";
import { runAnalysisForBusiness } from "@/lib/analysis/runAnalysis";
import { track } from "@/lib/analytics/track";

export async function POST() {
  const accountId = await getSessionAccountId();
  if (!accountId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

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
