import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionAccountId } from "@/lib/auth/session";
import { getBusinessForAccount, connectGoogleReviewSource, BusinessAlreadyClaimedError } from "@/lib/db/queries";
import { countReviewsPendingAnalysis } from "@/lib/analysis/runAnalysis";
import { checkRateLimit } from "@/lib/rateLimit";

// Self-serve, customer-facing equivalent of
// app/api/admin/reviews/connect-google (kept as-is, still there as an
// admin fallback). Session-gated, NOT admin-gated — businessId is always
// derived from the logged-in account's own session via
// getBusinessForAccount, never accepted from the client, so one account
// can never connect reviews onto a business it doesn't own. Reuses the
// exact same connectGoogleReviewSource import path as the admin route
// rather than duplicating it. See
// components/dashboard/ConnectReviewsCard.tsx for the UI that calls this.
const ConnectSchema = z.object({ placeId: z.string().min(1) });

// INVARIANT: a single request must never chain an external provider call
// and an analysis pass. That is exactly what broke here — this route used
// to call connectGoogleReviewSource (a live Outscraper fetch, 20-40+
// seconds, and now up to 500 reviews rather than 200) and then
// runAnalysisForBusiness (budgeted at EXTRACTION_BUDGET_MS = 30s plus
// rollup and DB writes) inside one function. Together they exceed the 60s
// ceiling, so Vercel killed the request mid-flight and NOTHING was
// imported — the kill lands before the work commits, and the customer saw
// only a generic "Connection failed."
//
// The analysis-run fix (75fe802) tuned the budgets INSIDE
// runAnalysisForBusiness; it could not account for a caller stacking a
// 40-second provider call in front of it. Raising maxDuration is not an
// option either — 60s is Vercel Hobby's hard ceiling, so there is no
// headroom to buy. The only fix is doing less per request: this route now
// imports and returns, and the client drives analysis separately.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const accountId = await getSessionAccountId();
  if (!accountId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // 5 per hour per account — same checkRateLimit pattern as /api/signup and
  // /api/analysis/run (lib/rateLimit.ts). connectGoogleReviewSource's own
  // cooldown (lastSyncedAt-based) additionally stops a same-Place-ID resync
  // within 10 minutes from re-hitting Outscraper at all; this caps the
  // number of DISTINCT attempts (e.g. re-typed Place IDs) per hour.
  const rateLimit = checkRateLimit(`connect-google:${accountId}`, 5, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many connection attempts. Please try again later." },
      {
        status: 429,
        headers: rateLimit.retryAfterSeconds ? { "Retry-After": String(rateLimit.retryAfterSeconds) } : undefined,
      }
    );
  }

  const business = await getBusinessForAccount(accountId);
  if (!business) return NextResponse.json({ error: "No business found for this account." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = ConnectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await connectGoogleReviewSource(business.id, business.name, parsed.data.placeId);

    // Import only — deliberately NO analysis pass here. reviewsRemaining is
    // what's WAITING to be analyzed (counted with the same rule the
    // extraction loop uses, see countReviewsPendingAnalysis), not what this
    // request analyzed, which is always zero now.
    //
    // components/dashboard/ConnectReviewsCard.tsx already loops on this
    // number by calling /api/analysis/run in properly-budgeted rounds with
    // progress and a time estimate, so the customer still sees one
    // continuous experience — it's just split across requests that each fit
    // inside their own budget.
    const reviewsRemaining = await countReviewsPendingAnalysis(business.id);

    // reviewsNewlyAnalyzed stays in the response, always 0, because the
    // client reads it as the starting count for its progress display.
    return NextResponse.json({ ok: true, ...result, reviewsRemaining, reviewsNewlyAnalyzed: 0 });
  } catch (err) {
    if (err instanceof BusinessAlreadyClaimedError) {
      // Expected, not a server error — the UI (ConnectReviewsCard) checks
      // this specific code to show the appeal flow instead of a generic
      // failure message.
      return NextResponse.json({ error: err.message, code: "business_already_claimed" }, { status: 409 });
    }
    console.error("connectGoogleReviewSource (self-serve) failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Connection failed." }, { status: 500 });
  }
}
