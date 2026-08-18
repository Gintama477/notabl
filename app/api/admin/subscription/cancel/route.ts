import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { getSubscriptionForAccount, updateSubscriptionForAccount } from "@/lib/db/queries";
import { isLiveBillingEnabled } from "@/lib/billing/provider";
import { StripeBillingProvider } from "@/lib/billing/stripeProvider";
import { track } from "@/lib/analytics/track";

const CancelSchema = z.object({ accountId: z.string().min(1) });

/**
 * Admin-only "Cancel Subscription" button (components/admin/PilotManagement.tsx's
 * PilotToggleTable). Cancels at the end of the current billing period, NOT
 * immediately — see StripeBillingProvider.cancelAtPeriodEnd for why that
 * one flag alone gives "cancel now, keep access until the period ends"
 * with no extra app logic: Stripe keeps status trialing/active until the
 * period genuinely ends, then fires customer.subscription.deleted, which
 * the existing webhook handler already turns into status "canceled".
 *
 * So this route deliberately does NOT set status to "canceled" itself —
 * only records canceledAt (when the cancellation was requested), leaving
 * status alone so the account keeps showing (and being) active/trialing
 * until the webhook does that flip for real.
 */
export async function POST(req: NextRequest) {
  const authorized = await hasValidAdminSession();
  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = CancelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { accountId } = parsed.data;

  const subscription = await getSubscriptionForAccount(accountId);
  if (!subscription) {
    return NextResponse.json({ error: "No subscription found for this account." }, { status: 404 });
  }

  if (!isLiveBillingEnabled()) {
    // No live Stripe key configured — nothing real to cancel via the API.
    // Mirrors app/api/billing/demo-cancel/route.ts's simulation (immediate
    // status: "canceled", since there's no real Stripe period-end to
    // simulate distinctly without a live key) so this button still does
    // something sensible in dev.
    await updateSubscriptionForAccount(accountId, { status: "canceled", canceledAt: new Date().toISOString() });
    await track("subscription_cancelled", { accountId, properties: { mode: "demo", by: "admin" } });
    return NextResponse.json({ ok: true, demo: true });
  }

  if (!subscription.stripeSubscriptionId) {
    return NextResponse.json(
      { error: "This account has no Stripe subscription on file to cancel — try Resync with Stripe first." },
      { status: 400 }
    );
  }

  try {
    const provider = new StripeBillingProvider(process.env.STRIPE_SECRET_KEY as string);
    await provider.cancelAtPeriodEnd(subscription.stripeSubscriptionId);
    await updateSubscriptionForAccount(accountId, { canceledAt: new Date().toISOString() });
    await track("subscription_cancelled", { accountId, properties: { by: "admin" } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Admin cancel-at-period-end failed:", err);
    return NextResponse.json({ error: "Could not cancel the subscription. Check server logs." }, { status: 500 });
  }
}
