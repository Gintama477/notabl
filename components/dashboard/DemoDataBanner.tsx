import Link from "next/link";
import { PLANS, DEFAULT_PLAN } from "@/config/pricing";

/**
 * Combined disclosure + upsell bar. The "this is sample data" disclosure is
 * non-negotiable (shown whenever the parent decides real reviews aren't
 * connected yet — see data.hasDemoData in app/dashboard/page.tsx, unchanged
 * by this component). The second-sentence CTA is conditional: once an
 * account has an active or trialing subscription, there's no more checkout
 * step to push them toward, so the parent passes showSubscriptionCta={false}
 * and only the plain disclosure sentence renders.
 */
export function DemoDataBanner({ showSubscriptionCta }: { showSubscriptionCta: boolean }) {
  const plan = PLANS[DEFAULT_PLAN];
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-center text-sm font-medium text-amber-800">
      This dashboard is showing sample data.
      {showSubscriptionCta && (
        <>
          {" "}
          <Link href="/billing" className="underline hover:text-amber-900">
            Click here to start your subscription
          </Link>{" "}
          and see your real report — first {plan.trialDays} days free.
        </>
      )}
    </div>
  );
}
