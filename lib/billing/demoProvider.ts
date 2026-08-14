// Used whenever STRIPE_SECRET_KEY isn't set (Phase 1 default). Simulates
// the checkout and billing-portal hand-off locally so the rest of the app
// (the /billing status page, the subscription state machine, the webhook
// handler's event types) can be built and tested end to end without a
// Stripe account — same idea as lib/ai/demoProvider.ts. Swapping in real
// Stripe test-mode keys later requires no code change, just env vars.

import { BillingProvider } from "./provider";

export class DemoBillingProvider implements BillingProvider {
  name = "demo-billing";

  // Params intentionally unused: real Stripe would need them (customer
  // email, success/cancel URLs, the Stripe customer ID) to build a hosted
  // session; the demo just points at a local page that simulates the
  // outcome, so nothing here needs the account's specifics.
  async createCheckoutSession(): Promise<{ url: string }> {
    return { url: "/billing/demo-checkout" };
  }

  async createPortalSession(): Promise<{ url: string }> {
    return { url: "/billing/demo-portal" };
  }
}
