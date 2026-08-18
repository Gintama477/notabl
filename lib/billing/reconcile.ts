// Shared "apply what Stripe says about this subscription to our DB" logic —
// used by both the webhook's checkout.session.completed handler (the normal
// path) and app/billing/page.tsx's fallback (when the webhook hasn't landed
// yet by the time the customer's browser reaches the success page). Kept in
// one place so the two paths can never drift out of sync with each other.

import Stripe from "stripe";
import { updateSubscriptionForAccount } from "@/lib/db/queries";
import { StripeBillingProvider } from "./stripeProvider";

/**
 * Maps a Stripe subscription status onto our own status column. Only
 * trialing/active are translated by name; every other Stripe status
 * (incomplete, incomplete_expired, unpaid, paused, ...) passes through
 * as-is rather than being silently collapsed into one of our known values —
 * better to see an unfamiliar string in the admin panel than to mislabel it.
 */
export function mapStripeSubscriptionStatus(stripeStatus: Stripe.Subscription.Status): string {
  if (stripeStatus === "trialing") return "trialing";
  if (stripeStatus === "active") return "active";
  return stripeStatus;
}

/**
 * Retrieves the real subscription from Stripe (status, trial_end — the
 * session/webhook payload alone don't reliably carry these) and writes the
 * result to this account's subscriptions row.
 */
export async function reconcileSubscriptionFromStripe(
  accountId: string,
  stripeSubscriptionId: string,
  stripeCustomerId: string | null,
  provider: StripeBillingProvider
): Promise<void> {
  const stripeSub = await provider.retrieveSubscription(stripeSubscriptionId);
  await updateSubscriptionForAccount(accountId, {
    status: mapStripeSubscriptionStatus(stripeSub.status),
    stripeCustomerId,
    stripeSubscriptionId,
    trialEndsAt: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000).toISOString() : null,
  });
}
