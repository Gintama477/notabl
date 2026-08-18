// Real Stripe implementation — only instantiated when STRIPE_SECRET_KEY is
// set (lib/billing/provider.ts). A key starting with sk_test_ puts every
// call in Stripe's test mode: real API shape, fake cards, zero real money.
// Nothing here changes when you eventually switch to a live key — that's
// the point of testing against this path early.

import Stripe from "stripe";
import { PLANS, DEFAULT_PLAN } from "@/config/pricing";
import { BillingProvider, CheckoutParams, PortalParams } from "./provider";

export class StripeBillingProvider implements BillingProvider {
  name = "stripe";
  private client: Stripe;

  constructor(secretKey: string) {
    this.client = new Stripe(secretKey);
  }

  async createCheckoutSession({ accountId, email, successUrl, cancelUrl }: CheckoutParams): Promise<{ url: string }> {
    const priceId = PLANS[DEFAULT_PLAN].stripePriceId;
    if (!priceId) {
      throw new Error(
        "STRIPE_SECRET_KEY is set but STRIPE_PRICE_ID_PRO is not — create the Notabl Pro price in your Stripe dashboard (test mode) and set STRIPE_PRICE_ID_PRO."
      );
    }
    const session = await this.client.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        trial_period_days: PLANS[DEFAULT_PLAN].trialDays,
      },
      metadata: { accountId },
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url };
  }

  async createPortalSession({ stripeCustomerId, returnUrl }: PortalParams): Promise<{ url: string }> {
    if (!stripeCustomerId) {
      throw new Error("No Stripe customer on file yet — start a checkout session first.");
    }
    const session = await this.client.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  }

  /** Used by the webhook route to verify the request actually came from Stripe. */
  constructEvent(payload: string | Buffer, signature: string, webhookSecret: string): Stripe.Event {
    return this.client.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  /**
   * Used by the webhook route's checkout.session.completed handler to learn
   * the real status (trialing vs active — trial_period_days means a brand
   * new subscription is genuinely "trialing", not "active") and the real
   * trial_end for the subscription that checkout just created. The session
   * object itself only carries the subscription's ID, not its status.
   */
  async retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.client.subscriptions.retrieve(subscriptionId);
  }
}
