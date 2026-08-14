import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { updateSubscriptionForAccount } from "@/lib/db/queries";

const ToggleSchema = z.object({
  accountId: z.string().min(1),
  enabled: z.boolean(),
});

// Easy on/off per point 18 ("must be easy for the user (admin) to
// enable/disable") — one call, no coupon codes, no expiry dates to manage.
export async function POST(req: NextRequest) {
  const authorized = await hasValidAdminSession();
  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = ToggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await updateSubscriptionForAccount(parsed.data.accountId, { isPilot: parsed.data.enabled });
  return NextResponse.json({ ok: true });
}
