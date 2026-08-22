import { NextRequest, NextResponse } from "next/server";
import { getSessionAccountId } from "@/lib/auth/session";
import { getBusinessForAccount, getReviewById, getReviewReply, saveReviewReply } from "@/lib/db/queries";
import { draftReviewReply, DraftReplyFailedError } from "@/lib/ai/draftReply";
import { checkRateLimit } from "@/lib/rateLimit";

// Calls the AI provider to draft a reply. A missing maxDuration is a silent 10s limit, not "no limit" —
// see app/api/signup/route.ts for the bug that trap caused.
export const maxDuration = 30;

// Generates a reply draft ON DEMAND — never on ingest, per the cost
// constraint this feature was built under (a Claude call should only ever
// happen when a human is actually about to read the output). Cached in
// review_replies after the first successful draft: a second POST for the
// same review returns the stored row instead of paying for another call,
// which keeps this to roughly a cent per review actually worked on and
// nothing at all for reviews the owner never opens.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: reviewId } = await params;

  const accountId = await getSessionAccountId();
  if (!accountId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // 20 drafts per hour per account — generous for a real work session
  // (going through a backlog of reviews) while still bounding the cost of
  // a compromised/scripted session hammering this endpoint.
  const rateLimit = checkRateLimit(`draft-reply:${accountId}`, 20, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many draft requests. Please try again later." },
      {
        status: 429,
        headers: rateLimit.retryAfterSeconds ? { "Retry-After": String(rateLimit.retryAfterSeconds) } : undefined,
      }
    );
  }

  const business = await getBusinessForAccount(accountId);
  if (!business) return NextResponse.json({ error: "No business found" }, { status: 404 });

  const review = await getReviewById(reviewId);
  // businessId ownership check — never trust the reviewId in the URL alone,
  // an account could otherwise draft a reply for (and read the full text
  // of) a review belonging to a different practice.
  if (!review || review.businessId !== business.id) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  const existing = await getReviewReply(reviewId);
  if (existing) {
    return NextResponse.json({ ok: true, draftText: existing.draftText, reused: true });
  }

  try {
    const draftText = await draftReviewReply(review.reviewText, review.rating, business.name, review.authorName);
    await saveReviewReply(reviewId, draftText);
    return NextResponse.json({ ok: true, draftText, reused: false });
  } catch (err) {
    console.error("Draft reply failed:", err);
    if (err instanceof DraftReplyFailedError) {
      // Deliberately not stored, not retried a third time, and not shown —
      // see lib/ai/draftReply.ts. A generic-but-safe fallback would be easy
      // to add here, but silently swapping in canned text after the model
      // twice failed the HIPAA rail is a worse failure mode than telling
      // the owner to write this one manually.
      return NextResponse.json(
        { error: "Could not draft a reply that met our safety rules for this review. Please write one manually." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Draft failed. Please try again." }, { status: 500 });
  }
}
