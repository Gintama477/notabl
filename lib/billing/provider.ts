// The one seam between "app logic" and "which billing backend is running" —
// same pattern as lib/ai/provider.ts and lib/email/send.ts. Everything else
// in the app calls the functions here; swapping demo -> real Stripe is a
// config change (set STRIPE_SECRET_KEY to a test-mode key, then eventually
// a live key), not a code change. See docs/STRIPE-TEST-MODE.md.

export interface CheckoutParams {
  accountId: string;
  email: string;
  successUrl: string;
  cancelUrl: string;
  // Set only when this account has completed a real Stripe checkout before
  // (their subscriptions row already has a stripeCustomerId, even if the
  // subscription was later canceled) — see StripeBillingProvider for what
  // that changes about the session it creates.
  existingStripeCustomerId?: string | null;
}

export interface PortalParams {
  accountId: string;
  stripeCustomerId: string | null;
  returnUrl: string;
}

export interface BillingProvider {
  name: string;
  createCheckoutSession(params: CheckoutParams): Promise<{ url: string }>;
  createPortalSession(params: PortalParams): Promise<{ url: string }>;
}

export function isLiveBillingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let cachedProvider: BillingProvider | null = null;

export async function getBillingProvider(): Promise<BillingProvider> {
  if (cachedProvider) return cachedProvider;
  if (isLiveBillingEnabled()) {
    const { StripeBillingProvider } = await import("./stripeProvider");
    cachedProvider = new StripeBillingProvider(process.env.STRIPE_SECRET_KEY as string);
  } else {
    const { DemoBillingProvider } = await import("./demoProvider");
    cachedProvider = new DemoBillingProvider();
  }
  return cachedProvider;
}
