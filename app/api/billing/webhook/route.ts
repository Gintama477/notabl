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
import { track } from "@/lib/analytics/track";
import { logAutomationError } from "@/lib/monitoring/logError";

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
      if (accountId) {
        // The session itself only carries the subscription's ID, not its
        // status — checkout.sessions.create sets trial_period_days (see
        // lib/billing/stripeProvider.ts), so a brand-new subscription is
        // genuinely "trialing" at this point, not "active". Retrieving it
        // is what makes status/trialEndsAt here the real, Stripe-confirmed
        // values rather than an assumption.
        const stripeStatus = stripeSubscriptionId ? await provider.retrieveSubscription(stripeSubscriptionId) : null;
        await updateSubscriptionForAccount(accountId, {
          status: stripeStatus ? mapStripeSubscriptionStatus(stripeStatus.status) : "active",
          stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
          stripeSubscriptionId,
          trialEndsAt: stripeStatus?.trial_end ? new Date(stripeStatus.trial_end * 1000).toISOString() : null,
        });
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

/**
 * Maps a Stripe subscription status onto our own status column. Only
 * trialing/active are translated by name; every other Stripe status
 * (incomplete, incomplete_expired, unpaid, paused, ...) passes through
 * as-is rather than being silently collapsed into one of our known values —
 * better to see an unfamiliar string in the admin panel than to mislabel it.
 */
function mapStripeSubscriptionStatus(stripeStatus: Stripe.Subscription.Status): string {
  if (stripeStatus === "trialing") return "trialing";
  if (stripeStatus === "active") return "active";
  return stripeStatus;
}
