import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { deleteBusinessAndAllData, BusinessDeletionRefusedError } from "@/lib/db/queries";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// Deletes across a dozen tables in one transaction. A missing maxDuration is a silent 10s limit, not "no limit" —
// see app/api/signup/route.ts for the bug that trap caused.
export const maxDuration = 30;

const DeleteSchema = z.object({
  businessId: z.string().min(1),
  // Must equal the business name exactly. Re-verified inside
  // deleteBusinessAndAllData rather than trusted from here, so a
  // hand-crafted request can't skip the confirmation the UI enforces.
  confirmName: z.string().min(1),
});

// Admin-only, irreversible, and the single most destructive route in the
// app. Everything it can refuse, it refuses inside
// deleteBusinessAndAllData (real Stripe subscription, the public sample
// business, a mismatched confirmation name) and reports back as a 409 with
// the reason — never a silent no-op, which on a delete would be
// indistinguishable from success.
export async function POST(req: NextRequest) {
  const authorized = await hasValidAdminSession();
  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`admin-delete-business:${getClientIp(req)}`, 5, 10 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many delete attempts. Please try again later." },
      {
        status: 429,
        headers: rateLimit.retryAfterSeconds ? { "Retry-After": String(rateLimit.retryAfterSeconds) } : undefined,
      }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await deleteBusinessAndAllData(parsed.data.businessId, parsed.data.confirmName);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof BusinessDeletionRefusedError) {
      // Expected and deliberate, not a server fault — the admin needs to
      // read the reason, so it goes back verbatim.
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("deleteBusinessAndAllData failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Delete failed." }, { status: 500 });
  }
}
