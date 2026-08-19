import { NextRequest, NextResponse } from "next/server";
import { getBusinessBySlug, getGoogleWriteReviewUrl } from "@/lib/db/queries";
import { track } from "@/lib/analytics/track";

// The one place a public-review click gets counted — deliberately
// server-side, before the redirect, rather than trying to track the click
// from the client (an <a href> to Google directly). Client-side tracking on
// an outbound link is unreliable (the navigation can start before a fetch
// finishes) and would mean the counting logic lives in the patient's
// browser instead of on our server.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const googleReviewUrl = await getGoogleWriteReviewUrl(business.id);
  if (!googleReviewUrl) {
    // Shouldn't normally be reachable — the public page only renders this
    // link when a Google review URL exists — but if the source got
    // disconnected between page load and click, send the patient back to
    // the review-request page rather than a broken redirect.
    return NextResponse.redirect(new URL(`/r/${slug}`, req.url));
  }

  await track("review_request_public_clicked", { businessId: business.id });

  return NextResponse.redirect(googleReviewUrl);
}
