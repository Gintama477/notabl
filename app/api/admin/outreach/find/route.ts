import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { findAndDraftProspects } from "@/lib/db/queries";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getSiteUrl } from "@/lib/siteUrl";

const FindSchema = z.object({
  city: z.string().min(1).max(120),
  state: z.string().min(1).max(60),
  category: z.string().max(80).optional().or(z.literal("")),
  limit: z.number().int().min(1).max(100).optional(),
  // Post-fetch filters (see findProspects). Bounded to what a Google
  // rating and review count can actually be, so nonsense never reaches
  // the filter.
  minRating: z.number().min(0).max(5).optional(),
  maxRating: z.number().min(0).max(5).optional(),
  minReviewCount: z.number().int().min(0).max(100000).optional(),
  maxReviewCount: z.number().int().min(0).max(100000).optional(),
});

// Admin-only. Finds public dental-practice listings (name, address, phone,
// website, public star rating/review count — never review text) via the
// temporary Outscraper-backed connector and drafts a Tier-1 cold-outreach
// email for each new one, per the point-24 semi-automated design (see
// docs/OUTREACH-AUTOMATION.md). Nothing is sent here — this only creates
// "drafted" rows for a human to review in the outreach queue.
//
// A live Outscraper Maps Search (async=false) can genuinely take 20-40+
// seconds for a fresh city/category — longer than Vercel's default 10s
// function timeout. Without this, a real search could get killed
// server-side mid-request, which the browser would eventually see as a
// failed fetch even though the button looked stuck on "Searching…" first.
// 60s is the max allowed on Vercel's Hobby plan; raise further only if
// upgraded to Pro and 60s still isn't enough.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const authorized = await hasValidAdminSession();
  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  // Admin-gated, but still a real, billed Outscraper call with no cap
  // otherwise — a leaked admin session (shared secret, no per-operator
  // identity) could run these in a loop. Keyed by IP since there's no
  // per-admin account id to key by.
  const rateLimit = checkRateLimit(`admin-outreach-find:${getClientIp(req)}`, 10, 10 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many searches. Please try again later." },
      {
        status: 429,
        headers: rateLimit.retryAfterSeconds ? { "Retry-After": String(rateLimit.retryAfterSeconds) } : undefined,
      }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = FindSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const senderName = process.env.OUTREACH_SENDER_NAME || "Notabl";
  // Fixed site address, not req.url — this link gets drafted directly into
  // a cold-outreach email that may sit unsent for a while and, once sent,
  // goes to a prospect who has no idea what URL the admin happened to be
  // using when they ran the search. Same class of bug as the emailed
  // login/invite links.
  const sampleReportUrl = new URL("/sample-report", getSiteUrl()).toString();

  try {
    const result = await findAndDraftProspects({
      city: parsed.data.city,
      state: parsed.data.state,
      category: parsed.data.category || undefined,
      limit: parsed.data.limit,
      minRating: parsed.data.minRating,
      maxRating: parsed.data.maxRating,
      minReviewCount: parsed.data.minReviewCount,
      maxReviewCount: parsed.data.maxReviewCount,
      sampleReportUrl,
      senderName,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("findAndDraftProspects failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Prospect search failed." }, { status: 500 });
  }
}
