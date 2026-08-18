import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionAccountId } from "@/lib/auth/session";
import { getBusinessForAccount, createSupportAppeal } from "@/lib/db/queries";
import { checkRateLimit } from "@/lib/rateLimit";

// Session-gated. Backs the two "someone else may already have this
// business" appeal flows — see BusinessAlreadyClaimedError and
// findDuplicateBusiness in lib/db/queries.ts, and
// components/dashboard/AppealForm.tsx for the shared UI. accountId (and
// businessId, when the account has one) are always derived from the
// session, never accepted from the client. Writes to support_appeals for a
// human to review in /admin — nothing here resolves anything automatically.
const AppealSchema = z.object({
  appealType: z.enum(["business_already_claimed", "duplicate_business_signup"]),
  message: z.string().min(1).max(2000),
});

export async function POST(req: NextRequest) {
  const accountId = await getSessionAccountId();
  if (!accountId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const rateLimit = checkRateLimit(`support-appeal:${accountId}`, 5, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      {
        status: 429,
        headers: rateLimit.retryAfterSeconds ? { "Retry-After": String(rateLimit.retryAfterSeconds) } : undefined,
      }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = AppealSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const business = await getBusinessForAccount(accountId);

  await createSupportAppeal({
    accountId,
    businessId: business?.id ?? null,
    appealType: parsed.data.appealType,
    message: parsed.data.message,
  });

  return NextResponse.json({ ok: true });
}
