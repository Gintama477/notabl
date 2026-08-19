// Single source of truth for pricing. Nothing else in the app should hardcode
// a dollar amount or trial length — import from here so changing the price is
// a one-line edit, not a find-and-replace across the codebase.

export const PLANS = {
  notabl_pro: {
    id: "notabl_pro",
    name: "Notabl Pro",
    priceMonthlyUsd: 49,
    trialDays: 7,
    features: [
      "Weekly automated review analysis",
      "Full dashboard: themes, trends, emerging issues",
      "Weekly email report",
      "Unlimited historical reports",
      "Review request QR code and landing page",
      "See how many new reviews your requests brought in",
      "Up to 1 business location",
    ],
    // Stripe price ID — set once you create the product in your Stripe dashboard.
    // Left blank in Phase 1 (no live Stripe integration yet).
    stripePriceId: process.env.STRIPE_PRICE_ID_PRO || "",
  },
} as const;

export type PlanId = keyof typeof PLANS;

export const DEFAULT_PLAN: PlanId = "notabl_pro";

export const FREE_TRIAL = {
  // What a visitor gets without paying: the public sample report and a
  // limited (demo-data) dashboard after signup, for PLANS.notabl_pro.trialDays.
  sampleReportAvailablePublicly: true,
  dashboardReviewLimit: 25, // demo dashboard shows at most this many reviews' worth of detail pre-payment
};

export function formatPrice(usd: number): string {
  return `$${usd}`;
}
