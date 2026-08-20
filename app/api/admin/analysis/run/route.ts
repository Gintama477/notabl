import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { db } from "@/lib/db/client";
import { businesses } from "@/lib/db/schema.pg";
import { eq } from "drizzle-orm";
import { runAnalysisForBusiness } from "@/lib/analysis/runAnalysis";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// Admin equivalent of app/api/analysis/run — that route derives businessId
// from the logged-in customer's own session, which doesn't work for an
// admin operating on an arbitrary business. Exists specifically so
// components/admin/PilotManagement.tsx's ConnectGoogleReviewsForm can keep
// calling runAnalysisForBusiness in rounds (see reviewsRemaining on
// RunAnalysisResult) after its initial connect, WITHOUT re-hitting
// app/api/admin/reviews/connect-google — that route also re-runs
// connectGoogleReviewSource, a real Outscraper call with its own cooldown
// that this endpoint deliberately never touches.
//
// See the maxDuration comment on app/api/analysis/run/route.ts for why 60s.
export const maxDuration = 60;

const RunSchema = z.object({ businessId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const authorized = await hasValidAdminSession();
  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  // Same reasoning as app/api/analysis/run/route.ts's rate limit bump — one
  // full re-analysis pass now takes several rounds. Keyed by IP (admin
  // sessions are a shared secret, not per-operator) same as the sibling
  // admin connect-google route.
  const rateLimit = checkRateLimit(`admin-analysis-run:${getClientIp(req)}`, 30, 10 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many analysis runs. Please wait a few minutes and try again." },
      {
        status: 429,
        headers: rateLimit.retryAfterSeconds ? { "Retry-After": String(rateLimit.retryAfterSeconds) } : undefined,
      }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = RunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [business] = await db.select().from(businesses).where(eq(businesses.id, parsed.data.businessId)).limit(1);
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  try {
    const result = await runAnalysisForBusiness(business.id, business.name, new Date().toISOString());
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Admin analysis run failed:", err);
    return NextResponse.json({ error: "Analysis failed. Check server logs." }, { status: 500 });
  }
}
