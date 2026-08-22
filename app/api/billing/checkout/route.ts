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
import { getSiteUrl } from "@/lib/siteUrl";

// Creates a Stripe Checkout session. A missing maxDuration is a silent 10s
// limit, not "no limit" — see app/api/signup/route.ts for the bug that
// trap caused.
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const accountId = await getSessionAccountId();
  if (!accountId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const [business, account, subscription] = await Promise.all([
    getBusinessForAccount(accountId),
    getAccountById(accountId),
    getSubscriptionForAccount(accountId),
  ]);
  if (!business || !account) return NextResponse.json({ error: "No business found" }, { status: 404 });

  const provider = await getBillingProvider();
  // Fixed site address for anything Stripe holds onto and redirects back
  // to later (successUrl/cancelUrl, the portal's returnUrl below) — Stripe
  // could send the customer back minutes after the session was created,
  // long after "whatever URL this request happened to come from" is
  // useful. requestOrigin stays request-derived and is ONLY used for the
  // local redirect fallback further down (the demo billing provider's
  // relative-path return value) — that's redirecting THIS request's own
  // browser right now, not something Stripe stores, so it should stay
  // wherever the tester actually is (e.g. a preview deployment).
  const siteUrl = getSiteUrl();
  const requestOrigin = req.nextUrl.origin;

  // A customer with an existing, not-fully-canceled Stripe subscription
  // (e.g. past_due after a declined card, still open and being
  // auto-retried by Stripe) must never get a SECOND subscription created
  // on the same customer — that's exactly what happens if this route just
  // calls checkout.sessions.create again. Send them to the portal instead,
  // where Stripe lets them update the payment method and retry the SAME
  // subscription/invoice. Reserve fresh Checkout for accounts with no
  // live Stripe subscription at all (status "none" or "canceled").
  //
  // Based on status alone, NOT stripeSubscriptionId — a row can genuinely
  // be "trialing"/"active" with stripeCustomerId/stripeSubscriptionId
  // still null (an incomplete reconciliation), and requiring that second
  // field was pure fragility. The portal branch below still separately
  // checks subscription.stripeCustomerId before using it, though — that's
  // a real technical requirement (you can't open a portal session for a
  // Stripe customer that doesn't exist on file), not the same kind of
  // fragile double-gating. A status-says-live-but-no-stripeCustomerId
  // account instead falls through to a normal fresh checkout below, which
  // doubles as another self-heal path alongside /billing's "Resync with
  // Stripe" button (lib/billing/reconcile.ts).
  const hasLiveSubscription = subscription != null && subscription.status !== "none" && subscription.status !== "canceled";
  if (hasLiveSubscription && subscription.stripeCustomerId) {
    try {
      const { url } = await provider.createPortalSession({
        accountId,
        stripeCustomerId: subscription.stripeCustomerId,
        returnUrl: `${siteUrl}/billing`,
      });
      return NextResponse.redirect(url.startsWith("http") ? url : `${requestOrigin}${url}`, { status: 303 });
    } catch (err) {
      console.error("Portal session creation failed (checkout redirect path):", err);
      return NextResponse.json({ error: "Could not open billing portal." }, { status: 500 });
    }
  }

  await track("checkout_started", { accountId, businessId: business.id });

  // Closes the "different email, same office" gap — see that function's
  // doc comment. Only meaningful once this business has actually connected
  // a Google review source, which for most self-serve accounts happens
  // AFTER their first checkout — this mainly bites a re-checkout after
  // cancellation, or an admin-connected business self-serving billing
  // later. Still worth checking every time; it's cheap.
  const denyTrial = await isPlaceIdAlreadyTrialedByAnotherAccount(business.id);

  try {
    const { url } = await provider.createCheckoutSession({
      accountId,
      email: account.email,
      // {CHECKOUT_SESSION_ID} is a literal Stripe placeholder it substitutes
      // server-side — lets /billing's success state look the session up
      // directly (see reconcileSubscriptionFromStripe) if the webhook
      // hasn't landed yet by the time the browser gets here.
      successUrl: `${siteUrl}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${siteUrl}/billing?checkout=cancelled`,
      // Non-null only if this account has completed a real checkout before
      // (even if later canceled) — see StripeBillingProvider for what that
      // changes: no second free trial, and reuse the same Stripe customer.
      existingStripeCustomerId: subscription?.stripeCustomerId ?? null,
      denyTrial,
    });
    return NextResponse.redirect(url.startsWith("http") ? url : `${requestOrigin}${url}`, { status: 303 });
  } catch (err) {
    console.error("Checkout session creation failed:", err);
    return NextResponse.json({ error: "Could not start checkout. Check server logs." }, { status: 500 });
  }
}
