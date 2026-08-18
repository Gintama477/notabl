import Link from "next/link";
import { PLANS, DEFAULT_PLAN } from "@/config/pricing";

/**
 * Combined disclosure + upsell bar. The "this is sample data" disclosure is
 * non-negotiable (shown whenever the parent decides real reviews aren't
 * connected yet — see data.hasDemoData in app/dashboard/page.tsx, unchanged
 * by this component). The "Start your subscription" CTA is conditional:
 * once an account has an active or trialing subscription, there's no more
 * checkout step to push them toward, so the parent passes
 * showSubscriptionCta={false} and only the plain disclosure renders.
 */
export function DemoDataBanner({ showSubscriptionCta }: { showSubscriptionCta: boolean }) {
  const plan = PLANS[DEFAULT_PLAN];
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-center text-xs font-medium text-amber-800">
      This dashboard is showing sample data.
      {showSubscriptionCta && (
        <>
          {" "}
          <Link href="/billing" className="underline hover:text-amber-900">
            Start your subscription
          </Link>{" "}
          to see your real reports — first {plan.trialDays} days free.
        </>
      )}
    </div>
  );
}
