"use client";

import { useConnectTransition } from "./ConnectTransition";

import Link from "next/link";
import { PLANS, DEFAULT_PLAN } from "@/config/pricing";

/**
 * Combined disclosure + upsell bar. The "you're viewing example reviews"
 * disclosure is non-negotiable (shown whenever the parent decides real
 * reviews aren't connected yet — see data.hasDemoData in
 * app/dashboard/page.tsx, unchanged by this component). The second-sentence
 * CTA is conditional: the parent passes showSubscriptionCta={false} only
 * while the account is CURRENTLY active/trialing (isActiveOrTrialing) —
 * NOT merely "has ever subscribed" (that used to hide this CTA forever
 * once a trial lapsed or a subscription got canceled/went unpaid, even
 * though that account is back to "not paying, not seeing real data" the
 * same as day one).
 *
 * hasUsedTrialBefore controls the wording, not just whether it shows: a
 * returning customer whose trial already ran out once isn't eligible for
 * a second free trial (checkout skips trial_period_days whenever
 * stripeCustomerId is already set — see lib/billing/stripeProvider.ts), so
 * promising "first N days free" to that person would be actively
 * misleading. Computed by the parent the same way checkout already
 * decides this: subscription?.stripeCustomerId != null.
 */
export function DemoDataBanner({
  showSubscriptionCta,
  hasUsedTrialBefore,
}: {
  showSubscriptionCta: boolean;
  hasUsedTrialBefore: boolean;
}) {
  const plan = PLANS[DEFAULT_PLAN];
  const { connecting } = useConnectTransition();

  // hasDemoData is server-rendered, so this banner outlived the truth: it
  // kept saying "you're viewing example reviews" for seconds after the
  // connect card had already reported real reviews imported. It must never
  // be possible to read both statements on one screen.
  if (connecting) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-center text-sm font-medium text-amber-800">
      You&apos;re viewing example reviews, not your practice&apos;s real data.
      {showSubscriptionCta && (
        <>
          {" "}
          <Link href="/billing" className="underline hover:text-amber-900">
            {hasUsedTrialBefore ? "Click here to subscribe" : "Click here to start your subscription"}
          </Link>{" "}
          {hasUsedTrialBefore ? "and see your real report." : `and see your real report — first ${plan.trialDays} days free.`}
        </>
      )}
    </div>
  );
}
