import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { connectGoogleReviewSource } from "@/lib/db/queries";
import { db } from "@/lib/db/client";
import { businesses } from "@/lib/db/schema.pg";
import { eq } from "drizzle-orm";
import { runAnalysisForBusiness } from "@/lib/analysis/runAnalysis";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// Admin-only, one practice at a time — same pattern as
// app/api/admin/pilot/invite. Connects (or re-syncs) a business's real
// Google reviews via the temporary Outscraper-backed provider (see
// docs/REVIEW-DATA-PROVIDERS.md) and immediately re-runs analysis so the
// practice's dashboard reflects the real data right away, same as a normal
// signup does with demo data.
const ConnectSchema = z.object({
  businessId: z.string().min(1),
  placeId: z.string().min(1),
});

// This route runs a full runAnalysisForBusiness pass immediately after
// connecting — see the maxDuration comment on app/api/analysis/run/route.ts
// for why 60s.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const authorized = await hasValidAdminSession();
  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  // Admin-gated, but still a real, billed Outscraper call with no other
  // cap — a leaked admin session (shared secret, no per-operator identity)
  // could otherwise run this in a loop. connectGoogleReviewSource's own
  // 10-minute resync cooldown additionally stops a same-Place-ID resync
  // from re-hitting Outscraper at all; this caps distinct attempts.
  const rateLimit = checkRateLimit(`admin-connect-google:${getClientIp(req)}`, 10, 10 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many connection attempts. Please try again later." },
      {
        status: 429,
        headers: rateLimit.retryAfterSeconds ? { "Retry-After": String(rateLimit.retryAfterSeconds) } : undefined,
      }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = ConnectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [business] = await db.select().from(businesses).where(eq(businesses.id, parsed.data.businessId)).limit(1);
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  try {
    const result = await connectGoogleReviewSource(business.id, business.name, parsed.data.placeId);

    // One 45s-budgeted pass (see EXTRACTION_BUDGET_MS in
    // lib/analysis/runAnalysis.ts) — a large business's first real analysis
    // won't finish in a single call. reviewsRemaining is surfaced so
    // ConnectGoogleReviewsForm (components/admin/PilotManagement.tsx) can
    // keep going via /api/admin/analysis/run, which just re-analyzes
    // without re-hitting connectGoogleReviewSource (a real Outscraper call
    // with its own cooldown).
    let reviewsRemaining = 0;
    try {
      const analysisResult = await runAnalysisForBusiness(business.id, business.name, new Date().toISOString());
      reviewsRemaining = analysisResult.reviewsRemaining;
    } catch (analysisErr) {
      console.error("Post-connect analysis failed:", analysisErr);
      // Connection itself still succeeded — surface that, don't fail the whole request.
    }

    return NextResponse.json({ ok: true, ...result, reviewsRemaining });
  } catch (err) {
    console.error("connectGoogleReviewSource failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Connection failed." }, { status: 500 });
  }
}
