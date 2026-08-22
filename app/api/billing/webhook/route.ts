// Real Stripe webhook handler — the source of truth for subscription state
// once live billing is on (Phase 3). Point your Stripe webhook endpoint
// (test mode first) at POST /api/billing/webhook and set
// STRIPE_WEBHOOK_SECRET to the signing secret Stripe gives you for it.
//
// Not reachable in any meaningful way while STRIPE_SECRET_KEY is unset —
// there's no real Stripe account sending events here, so this route just
// exists ready-to-go for when Phase 3 connects a real (test-mode) key. The
// demo-mode equivalent of these state transitions lives in
// app/api/billing/demo-checkout/route.ts.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { isLiveBillingEnabled } from "@/lib/billing/provider";
import { StripeBillingProvider } from "@/lib/billing/stripeProvider";
import { updateSubscriptionForAccount, getAccountIdByStripeCustomerId } from "@/lib/db/queries";
import { reconcileSubscriptionFromStripe, mapStripeSubscriptionStatus } from "@/lib/billing/reconcile";
import { track } from "@/lib/analytics/track";
import { logAutomationError } from "@/lib/monitoring/logError";

// Verifies and reconciles against the Stripe API. A missing maxDuration is a silent 10s limit, not "no limit" —
// see app/api/signup/route.ts for the bug that trap caused.
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!isLiveBillingEnabled()) {
    return NextResponse.json({ error: "Live billing is not configured." }, { status: 404 });
  }
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set — cannot verify webhook signature.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  const payload = await req.text();
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const provider = new StripeBillingProvider(process.env.STRIPE_SECRET_KEY as string);
  let event: Stripe.Event;
  try {
    event = provider.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    await logAutomationError("stripe-webhook", `Signature verification failed: ${String(err)}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await handleStripeEvent(event, provider);
  } catch (err) {
    console.error("Stripe webhook processing failed:", err);
    await logAutomationError("stripe-webhook", `Failed processing ${event.type} (event ${event.id}): ${String(err)}`);
    // Still 200 rather than 500 for a processing error, once verified as a
    // real Stripe event — a 500 here would make Stripe retry indefinitely
    // for an error that's almost certainly not transient (e.g. a bad
    // metadata field), and the failure is already logged above for a human
    // to look at.
    return NextResponse.json({ received: true, warning: "processed with errors, see automation logs" });
  }

  return NextResponse.json({ received: true });
}

async function handleStripeEvent(event: Stripe.Event, provider: StripeBillingProvider): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const accountId = session.metadata?.accountId;
      const stripeSubscriptionId = typeof session.subscription === "string" ? session.subscription : null;
      const stripeCustomerId = typeof session.customer === "string" ? session.customer : null;
      if (accountId && stripeSubscriptionId) {
        // Shared with app/billing/page.tsx's session_id fallback, for when
        // the customer's browser reaches the success page before this
        // webhook has landed — see lib/billing/reconcile.ts.
        await reconcileSubscriptionFromStripe(accountId, stripeSubscriptionId, stripeCustomerId, provider);
        await track("subscription_started", { accountId });
      } else if (accountId) {
        // No subscription id on the session somehow — still record the
        // customer link rather than dropping the event entirely.
        await updateSubscriptionForAccount(accountId, { status: "active", stripeCustomerId });
        await track("subscription_started", { accountId });
      }
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : null;
      const accountId = customerId ? await getAccountIdByStripeCustomerId(customerId) : null;
      if (accountId) {
        await updateSubscriptionForAccount(accountId, {
          status: mapStripeSubscriptionStatus(sub.status),
          currentPeriodEnd: sub.items.data[0]?.current_period_end
            ? new Date(sub.items.data[0].current_period_end * 1000).toISOString()
            : null,
        });
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : null;
      const accountId = customerId ? await getAccountIdByStripeCustomerId(customerId) : null;
      if (accountId) {
        await updateSubscriptionForAccount(accountId, {
          status: "canceled",
          canceledAt: new Date().toISOString(),
        });
        await track("subscription_cancelled", { accountId });
      }
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
      const accountId = customerId ? await getAccountIdByStripeCustomerId(customerId) : null;
      if (accountId) {
        await updateSubscriptionForAccount(accountId, { status: "past_due" });
      }
      break;
    }
    default:
      // Ignore event types we don't act on.
      break;
  }
}
