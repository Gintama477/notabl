# Stripe Billing — Test-Mode Architecture

This documents what was built in this pass: the full billing state machine
and its wiring, ready to connect to a real Stripe account in **test mode**
first. **No real Stripe account is connected. No card has ever been
charged. Nothing here costs money.**

## What exists

- `lib/billing/provider.ts` — the same pluggable-provider pattern as the AI
  and email providers (`lib/ai/provider.ts`, `lib/email/send.ts`). Whether
  the app uses real Stripe or the local demo simulation is decided by one
  thing: is `STRIPE_SECRET_KEY` set?
- `lib/billing/stripeProvider.ts` — the real implementation. Creates a
  Stripe Checkout Session (subscription mode, with the plan's trial period)
  and a Billing Portal session. Untouched regardless of whether the key you
  eventually provide is `sk_test_...` (test mode, fake cards, no real money)
  or `sk_live_...` (real money) — that distinction lives entirely in which
  key you paste in, not in this code.
- `lib/billing/demoProvider.ts` — the fallback used right now (no key set).
  Sends you to a local page that simulates the two outcomes a real Checkout
  can have, without a Stripe account.
- `app/api/billing/checkout/route.ts` — starts a checkout (real or demo).
- `app/api/billing/portal/route.ts` — opens the billing portal (real or
  demo) for an active subscriber to manage or cancel their subscription.
- `app/api/billing/webhook/route.ts` — the real Stripe webhook handler.
  Handles `checkout.session.completed` (→ subscription becomes `active`),
  `customer.subscription.updated` (→ syncs status/renewal date),
  `customer.subscription.deleted` (→ `canceled`), and
  `invoice.payment_failed` (→ `past_due`). Returns 404 until
  `STRIPE_SECRET_KEY` is set — there's no real Stripe account to send it
  events yet.
- `app/api/billing/demo-checkout/route.ts`, `demo-cancel/route.ts` — the
  demo-mode equivalent of the four states above, so the subscription state
  machine (`subscriptions.status`: `trialing` → `active` / `past_due` →
  `canceled`) can be exercised end to end without Stripe. Both refuse to
  run if live billing is actually configured, so they can never become an
  accidental bypass in a real deployment.
- `app/billing/page.tsx` — a status page showing the current plan, status,
  and trial/renewal date, with the right action button for the current
  state (start checkout / retry a failed payment / manage billing).
- `app/billing/demo-checkout/page.tsx`, `demo-portal/page.tsx` — the local
  stand-ins for Stripe's hosted Checkout and Billing Portal pages, visible
  only in demo mode.
- Admin panel (`/admin`) now also shows a **Past Due** count alongside the
  existing Trialing/Active/Cancelled/MRR stats.
- Analytics: `checkout_started`, `subscription_started`, and
  `subscription_cancelled` (see `config/events.ts`) now fire from both the
  real webhook path and the demo path.

## Try it right now (demo mode, no setup)

1. Sign up (`/signup`) — you land on the dashboard with a `trialing`
   subscription, same as before.
2. Click **Billing** on the dashboard, then **Add Payment Method**.
3. On the demo checkout page, click **Simulate Successful Payment** (status
   becomes `active`) or **Simulate Failed Payment** (status becomes
   `past_due`, with a **Retry Payment** button back on `/billing`).
4. If active, **Manage Billing** takes you to the demo portal, where
   **Cancel Subscription** sets status to `canceled`.
5. Check `/admin` — the Trialing/Active/Past Due/Cancelled counts update to
   match.

## Turning on real Stripe test mode

1. Create a free Stripe account if you don't have one. Stay in **test
   mode** (the default — there's a toggle in the Stripe dashboard, make
   sure it's off).
2. Create a Product + Price for "Notabl Pro" at $49/month in the test-mode
   dashboard. Copy the price ID (`price_...`).
3. Set three environment variables: `STRIPE_SECRET_KEY` (test secret key,
   starts `sk_test_`), `STRIPE_PRICE_ID_PRO` (the price ID from step 2),
   and — once you've also created a webhook endpoint pointed at
   `POST /api/billing/webhook` in the Stripe dashboard (test mode) —
   `STRIPE_WEBHOOK_SECRET` (the signing secret Stripe shows you for that
   endpoint).
4. That's it — no code changes. The app now uses real (test-mode) Stripe
   Checkout and Billing Portal, still with zero real money moving, because
   test-mode keys only accept Stripe's published test card numbers.
5. When you're ready to charge real customers, swap the test keys for live
   keys (`sk_live_...`, a live-mode price ID, a live-mode webhook secret).
   I will not do this step for you without you explicitly telling me to —
   flagging it here since it's the one step that turns on real charges.
