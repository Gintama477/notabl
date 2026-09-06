import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { getSubscriptionForAccount, updateSubscriptionForAccount } from "@/lib/db/queries";

const ToggleSchema = z.object({
  accountId: z.string().min(1),
  enabled: z.boolean(),
});

// Easy on/off per point 18 ("must be easy for the user (admin) to
// enable/disable") — one call, no coupon codes, no expiry dates to manage.
//
// IMPORTANT: access is gated on subscriptions.status, NOT on isPilot.
// Every dashboard page asks `status === "active" || status === "trialing"`
// and nothing anywhere reads isPilot to decide access — it is a label
// recording WHY an account is active, not the thing that makes it active.
// So any change here must write BOTH fields. Writing isPilot alone is the
// bug this route shipped with: on a canceled account, "Grant Pilot" flipped
// the flag to Yes, reported success, and left the dashboard locked — the
// same silent-no-op failure shape as the Stripe webhook that was broken for
// months. grantPilotAccess() in lib/db/queries.ts is the reference: it sets
// { isPilot: true, status: "active" } together, and enabling here matches it
// exactly.
export async function POST(req: NextRequest) {
  const authorized = await hasValidAdminSession();
  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = ToggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { accountId, enabled } = parsed.data;

  // Read before write: disabling needs to know whether a real Stripe
  // subscription owns the status field. A missing row is reported rather
  // than updated-to-nothing — an UPDATE matching zero rows would return
  // ok:true and change nothing, which is exactly the failure being fixed.
  const subscription = await getSubscriptionForAccount(accountId);
  if (!subscription) {
    return NextResponse.json({ error: "That account has no subscription row to update." }, { status: 404 });
  }

  if (enabled) {
    await updateSubscriptionForAccount(accountId, { isPilot: true, status: "active" });
    return NextResponse.json({ ok: true, isPilot: true, status: "active" });
  }

  // Revoking. If Stripe is behind this subscription, Stripe's webhook owns
  // `status` — overwriting it here desyncs the two again, so only the flag
  // comes off and the real billing state is left exactly as Stripe last set
  // it. With no stripeSubscriptionId there is no real subscription behind
  // the access at all, so leaving status "active" would hand out free
  // access with no record of why: it goes back to "canceled".
  const ownedByStripe = Boolean(subscription.stripeSubscriptionId);
  const changes = ownedByStripe
    ? { isPilot: false }
    : { isPilot: false, status: "canceled" };

  await updateSubscriptionForAccount(accountId, changes);
  return NextResponse.json({
    ok: true,
    isPilot: false,
    status: ownedByStripe ? subscription.status : "canceled",
  });
}
