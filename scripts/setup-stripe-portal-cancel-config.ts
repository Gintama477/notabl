// One-time setup script — NOT run automatically, NOT part of the request
// path. Locks in "cancel at period end" for the Stripe Billing Portal via
// a Configuration object, rather than trusting whatever the Dashboard's
// current default happens to be (Settings -> Billing -> Customer portal ->
// Subscriptions -> Cancellation is the equivalent manual toggle, but that's
// a per-mode Dashboard setting someone could change later without anyone
// noticing here).
//
// Deliberately a script you run and inspect, not code that creates/patches
// a Configuration on every portal session request — the Configuration API
// has enough required-field nuance (business_profile, other features) that
// getting it wrong inside a live request path could break the ENTIRE
// portal for every customer, not just cancellation behavior. Safer to do
// this once, read the output, and only then wire the resulting id in.
//
// Run once per Stripe mode (test and live are entirely separate
// Configuration objects — see docs/STRIPE-TEST-MODE.md):
//   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/setup-stripe-portal-cancel-config.ts
//   STRIPE_SECRET_KEY=sk_live_... npx tsx scripts/setup-stripe-portal-cancel-config.ts
//
// Then set the printed id as STRIPE_PORTAL_CONFIGURATION_ID in Vercel for
// the matching environment (test key -> Preview/Development, live key ->
// Production) — see lib/billing/stripeProvider.ts's createPortalSession,
// which passes it through when set and falls back to the account's
// current default configuration (today's behavior, unchanged) when not.

import "dotenv/config";
import Stripe from "stripe";

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error("Set STRIPE_SECRET_KEY before running this script (test key or live key — see the header comment).");
    process.exit(1);
  }
  const mode = secretKey.startsWith("sk_live_") ? "LIVE" : secretKey.startsWith("sk_test_") ? "TEST" : "UNKNOWN";
  console.log(`Using a Stripe ${mode}-mode key.`);

  const stripe = new Stripe(secretKey);

  const existing = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
  const current = existing.data[0];
  let finalConfigId: string;

  if (current) {
    console.log(`Found the account's current default configuration (${current.id}) — patching subscription_cancel only.`);
    const updated = await stripe.billingPortal.configurations.update(current.id, {
      features: {
        subscription_cancel: { enabled: true, mode: "at_period_end" },
      },
    });
    finalConfigId = updated.id;
    console.log(`Updated. Configuration id: ${updated.id}`);
    console.log(`subscription_cancel.mode is now: ${updated.features.subscription_cancel.mode}`);
  } else {
    // No default configuration exists yet (a fresh Stripe account that's
    // never had the portal configured, in this mode) — create one with a
    // sensible, minimal baseline alongside the setting we actually care
    // about, matching what the Dashboard's own defaults typically enable.
    console.log("No existing default configuration found — creating a new one.");
    const created = await stripe.billingPortal.configurations.create({
      business_profile: {
        headline: "Manage your Notabl subscription",
      },
      features: {
        subscription_cancel: { enabled: true, mode: "at_period_end" },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        customer_update: { enabled: true, allowed_updates: ["email", "address"] },
      },
    });
    finalConfigId = created.id;
    console.log(`Created. Configuration id: ${created.id}`);
    console.log(
      "This was NOT set as the account's default — review it in the Stripe Dashboard " +
        "(Settings -> Billing -> Customer portal) and mark it default there if it looks right, " +
        "or just rely on STRIPE_PORTAL_CONFIGURATION_ID picking it explicitly (see below) either way."
    );
  }

  console.log("\nNext step: set this in Vercel's environment variables for the matching environment:");
  console.log(`  STRIPE_PORTAL_CONFIGURATION_ID=${finalConfigId}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
