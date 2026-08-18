import Link from "next/link";

/**
 * Combined disclosure + upsell bar. The "this is sample data" disclosure is
 * non-negotiable (shown whenever the parent decides real reviews aren't
 * connected yet — see data.hasDemoData in app/dashboard/page.tsx, unchanged
 * by this component). The second-sentence CTA is conditional: the parent
 * passes showSubscriptionCta={false} once the account has actually
 * completed real Stripe checkout (stripeSubscriptionId set — NOT just
 * subscription.status === "trialing", which every account gets immediately
 * at signup regardless of real billing), and only the plain disclosure
 * sentence renders.
 *
 * Copy deliberately doesn't say "first N days free" here — that trial
 * clock starts at signup, not at the moment this CTA is clicked, so
 * promising a fresh N-day countdown right here would overstate what's left.
 */
export function DemoDataBanner({ showSubscriptionCta }: { showSubscriptionCta: boolean }) {
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-center text-sm font-medium text-amber-800">
      This dashboard is showing sample data.
      {showSubscriptionCta && (
        <>
          {" "}
          <Link href="/billing" className="underline hover:text-amber-900">
            Click here to start your subscription
          </Link>{" "}
          and see your real report before your trial ends.
        </>
      )}
    </div>
  );
}
