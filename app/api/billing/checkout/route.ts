import { NextRequest, NextResponse } from "next/server";
import { getSessionAccountId } from "@/lib/auth/session";
import {
  getBusinessForAccount,
  getAccountById,
  getSubscriptionForAccount,
  isPlaceIdAlreadyTrialedByAnotherAccount,
} from "@/lib/db/queries";
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

  // Closes the "different email, same office" gap — see that function's
  // doc comment. Only meaningful once this business has actually connected
  // a Google review source, which for most self-serve accounts happens
  // AFTER their first checkout — this mainly bites a re-checkout after
  // cancellation, or an admin-connected business self-serving billing
  // later. Still worth checking every time; it's cheap.
  const denyTrial = await isPlaceIdAlreadyTrialedByAnotherAccount(business.id);

  const provider = await getBillingProvider();
  const origin = req.nextUrl.origin;
  try {
    const { url } = await provider.createCheckoutSession({
      accountId,
      email: account.email,
      // {CHECKOUT_SESSION_ID} is a literal Stripe placeholder it substitutes
      // server-side — lets /billing's success state look the session up
      // directly (see reconcileSubscriptionFromStripe) if the webhook
      // hasn't landed yet by the time the browser gets here.
      successUrl: `${origin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/billing?checkout=cancelled`,
      // Non-null only if this account has completed a real checkout before
      // (even if later canceled) — see StripeBillingProvider for what that
      // changes: no second free trial, and reuse the same Stripe customer.
      existingStripeCustomerId: subscription?.stripeCustomerId ?? null,
      denyTrial,
    });
    return NextResponse.redirect(url.startsWith("http") ? url : `${origin}${url}`, { status: 303 });
  } catch (err) {
    console.error("Checkout session creation failed:", err);
    return NextResponse.json({ error: "Could not start checkout. Check server logs." }, { status: 500 });
  }
}
