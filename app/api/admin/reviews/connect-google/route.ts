import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { connectGoogleReviewSource } from "@/lib/db/queries";
import { db } from "@/lib/db/client";
import { businesses } from "@/lib/db/schema.pg";
import { eq } from "drizzle-orm";
import { countReviewsPendingAnalysis } from "@/lib/analysis/runAnalysis";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// Admin-only, one practice at a time — same pattern as
// app/api/admin/pilot/invite. Connects (or re-syncs) a business's real
// Google reviews via the temporary Outscraper-backed provider (see
// docs/REVIEW-DATA-PROVIDERS.md). Analysis is NOT run here — see the
// invariant below; the admin form loops on reviewsRemaining instead.
const ConnectSchema = z.object({
  businessId: z.string().min(1),
  placeId: z.string().min(1),
});

// INVARIANT: a single request must never chain an external provider call
// and an analysis pass — see the full explanation on the self-serve route,
// app/api/reviews/connect-google/route.ts. This route imports and returns;
// ConnectGoogleReviewsForm drives analysis separately. 60s is Vercel
// Hobby's hard ceiling, so there is no headroom to buy by raising it.
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

    // Import only — no analysis pass here, same invariant as the
    // self-serve route. reviewsRemaining is what's waiting, counted with
    // the same rule the extraction loop uses; ConnectGoogleReviewsForm
    // (components/admin/PilotManagement.tsx) already loops on it via
    // /api/admin/analysis/run.
    const reviewsRemaining = await countReviewsPendingAnalysis(business.id);

    return NextResponse.json({ ok: true, ...result, reviewsRemaining, reviewsNewlyAnalyzed: 0 });
  } catch (err) {
    console.error("connectGoogleReviewSource failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Connection failed." }, { status: 500 });
  }
}
