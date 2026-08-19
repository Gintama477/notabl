import { NextRequest, NextResponse } from "next/server";
import { PatientFeedbackSchema } from "@/lib/validation/patientFeedback";
import { getBusinessBySlug, submitPatientFeedback } from "@/lib/db/queries";
import { track } from "@/lib/analytics/track";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// Public, unauthenticated, reachable by anyone who has the link — rate
// limited the same way the other public POST routes are (checkRateLimit +
// getClientIp, see lib/rateLimit.ts). 5 submissions per IP per hour: this
// is a "send us feedback" form, not something a real patient would ever
// legitimately submit more than a couple of times.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const rateLimit = checkRateLimit(`review-request-feedback:${getClientIp(req)}`, 5, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      {
        status: 429,
        headers: rateLimit.retryAfterSeconds ? { "Retry-After": String(rateLimit.retryAfterSeconds) } : undefined,
      }
    );
  }

  const business = await getBusinessBySlug(slug);
  if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = PatientFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // No name/email/phone accepted or stored — see the comment above the
  // patientFeedback table in lib/db/schema.pg.ts.
  await submitPatientFeedback(business.id, {
    rating: parsed.data.rating ?? null,
    message: parsed.data.message,
  });

  await track("review_request_private_submitted", { businessId: business.id });

  return NextResponse.json({ ok: true });
}
