import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionAccountId } from "@/lib/auth/session";
import { getBusinessForAccount, getDashboardData, getSubscriptionForAccount } from "@/lib/db/queries";
import { generateReviewRequestQrSvg } from "@/lib/reviews/reviewRequestQr";
import { getSiteUrl } from "@/lib/siteUrl";
import { PrintButton } from "@/components/dashboard/PrintButton";

// A plain, print-optimized card view — four copies of the same card
// (practice name + QR + "Scan to leave us a review") on one page, meant to
// be printed and cut apart for the front desk / checkout counter. Uses
// Tailwind's built-in print: variant (a real @media print stylesheet under
// the hood) to hide the on-screen-only nav/button and tighten spacing for
// paper — no PDF library needed for something this simple.
export default async function PrintReviewRequestPage() {
  const accountId = await getSessionAccountId();
  if (!accountId) redirect("/signup");

  const business = await getBusinessForAccount(accountId);
  if (!business) redirect("/signup");

  // Same gating as app/dashboard/review-requests/page.tsx — no reason to
  // duplicate the explanatory empty states here, just bounce back to the
  // main page which already has them.
  const data = await getDashboardData(business.id);
  const subscription = await getSubscriptionForAccount(accountId);
  const isActiveOrTrialing = subscription?.status === "active" || subscription?.status === "trialing";
  const subscriptionInactive = !data.hasDemoData && !isActiveOrTrialing;
  if (data.hasDemoData || subscriptionInactive || !business.slug) {
    redirect("/dashboard/review-requests");
  }

  const shortLink = `${getSiteUrl()}/r/${business.slug}`;
  const qrSvg = await generateReviewRequestQrSvg(shortLink, 200);

  return (
    <div className="min-h-screen bg-slate-100 p-8 print:bg-white print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href="/dashboard/review-requests" className="text-sm font-medium text-slate-500 hover:text-slate-800">
          ← Back to Review Requests
        </Link>
        <PrintButton />
      </div>

      <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2 print:max-w-none print:grid-cols-2 print:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex flex-col items-center justify-center gap-4 rounded-xl border border-slate-300 bg-white p-8 text-center print:break-inside-avoid print:rounded-none print:border-slate-400"
          >
            <p className="font-serif text-xl font-semibold text-slate-900">{business.name}</p>
            {/* Server-generated SVG from our own trusted qrcode library —
                see the dangerouslySetInnerHTML comment in
                app/dashboard/review-requests/page.tsx. */}
            <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <p className="text-base font-medium text-slate-700">Scan to leave us a review</p>
          </div>
        ))}
      </div>
    </div>
  );
}
