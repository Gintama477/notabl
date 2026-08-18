import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionAccountId } from "@/lib/auth/session";
import { getBusinessForAccount, connectGoogleReviewSource, BusinessAlreadyClaimedError } from "@/lib/db/queries";
import { runAnalysisForBusiness } from "@/lib/analysis/runAnalysis";
import { checkRateLimit } from "@/lib/rateLimit";

// Self-serve, customer-facing equivalent of
// app/api/admin/reviews/connect-google (kept as-is, still there as an
// admin fallback). Session-gated, NOT admin-gated — businessId is always
// derived from the logged-in account's own session via
// getBusinessForAccount, never accepted from the client, so one account
// can never connect reviews onto a business it doesn't own. Reuses the
// exact same connectGoogleReviewSource + runAnalysisForBusiness pipeline
// as the admin route rather than duplicating it. See
// components/dashboard/ConnectReviewsCard.tsx for the UI that calls this.
const ConnectSchema = z.object({ placeId: z.string().min(1) });

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

    try {
      await runAnalysisForBusiness(business.id, business.name, new Date().toISOString());
    } catch (analysisErr) {
      console.error("Post-connect analysis failed:", analysisErr);
      // Connection itself still succeeded — surface that, don't fail the whole request.
    }

    return NextResponse.json({ ok: true, ...result });
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
