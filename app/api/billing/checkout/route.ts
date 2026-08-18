import { NextRequest, NextResponse } from "next/server";
import { getSessionAccountId } from "@/lib/auth/session";
import { getBusinessForAccount, getAccountById, getSubscriptionForAccount } from "@/lib/db/queries";
import { getBillingProvider } from "@/lib/billing/provider";
import { track } from "@/lib/analytics/track";

export async function POST(req: NextRequest) {
  const accountId = await getSessionAccountId();
  if (!accountId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const [business, account, subscription] = await Promise.all([
    getBusinessForAccount(accountId),
    getAccountById(accountId),
    getSubscriptionForAccount(accountId),
  ]);
  if (!business || !account) return NextResponse.json({ error: "No business found" }, { status: 404 });

  await track("checkout_started", { accountId, businessId: business.id });

  const provider = await getBillingProvider();
  const origin = req.nextUrl.origin;
  try {
    const { url } = await provider.createCheckoutSession({
      accountId,
      email: account.email,
      successUrl: `${origin}/billing?checkout=success`,
      cancelUrl: `${origin}/billing?checkout=cancelled`,
      // Non-null only if this account has completed a real checkout before
      // (even if later canceled) — see StripeBillingProvider for what that
      // changes: no second free trial, and reuse the same Stripe customer.
      existingStripeCustomerId: subscription?.stripeCustomerId ?? null,
    });
    return NextResponse.redirect(url.startsWith("http") ? url : `${origin}${url}`, { status: 303 });
  } catch (err) {
    console.error("Checkout session creation failed:", err);
    return NextResponse.json({ error: "Could not start checkout. Check server logs." }, { status: 500 });
  }
}
