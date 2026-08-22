import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionAccountId } from "@/lib/auth/session";
import {
  getBusinessForAccount,
  getDashboardData,
  getSubscriptionForAccount,
  getGoogleWriteReviewUrl,
  getReviewRequestStats,
  getPatientFeedbackForBusiness,
} from "@/lib/db/queries";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { BfcacheGuard } from "@/components/BfcacheGuard";
import { CopyLinkButton } from "@/components/dashboard/CopyLinkButton";
import { inactiveSubscriptionMessage } from "@/lib/billing/statusCopy";
import { generateReviewRequestQrSvg } from "@/lib/reviews/reviewRequestQr";
import { getSiteUrl } from "@/lib/siteUrl";

const WINDOW_OPTIONS = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default async function ReviewRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days: daysParam } = await searchParams;

  const accountId = await getSessionAccountId();
  if (!accountId) redirect("/signup");

  const business = await getBusinessForAccount(accountId);
  if (!business) redirect("/signup");

  // Same gating signals as app/dashboard/reviews/page.tsx — kept identical
  // deliberately so this page can never show real attribution data in a
  // situation the main dashboard wouldn't.
  const data = await getDashboardData(business.id);
  const subscription = await getSubscriptionForAccount(accountId);
  const isActiveOrTrialing = subscription?.status === "active" || subscription?.status === "trialing";
  const subscriptionInactive = !data.hasDemoData && !isActiveOrTrialing;

  const windowDays = WINDOW_OPTIONS.some((o) => o.days === Number(daysParam)) ? Number(daysParam) : 30;

  let content = null;
  if (!data.hasDemoData && !subscriptionInactive && business.slug) {
    const shortLink = `${getSiteUrl()}/r/${business.slug}`;
    const googleReviewUrl = await getGoogleWriteReviewUrl(business.id);
    const qrSvg = await generateReviewRequestQrSvg(shortLink, 220);
    const qrDownloadHref = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      await generateReviewRequestQrSvg(shortLink, 800)
    )}`;

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd);
    windowStart.setUTCDate(windowStart.getUTCDate() - windowDays);
    const stats = await getReviewRequestStats(business.id, windowStart.toISOString(), windowEnd.toISOString());
    const feedback = await getPatientFeedbackForBusiness(business.id);

    content = (
      <>
        {!googleReviewUrl && (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Your Google review link isn&apos;t connected right now, so the &ldquo;Leave a public review&rdquo; option
            on your QR code and link won&apos;t work until it is. Reconnect it from the{" "}
            <Link href="/dashboard" className="underline hover:text-amber-900">
              main dashboard
            </Link>
            .
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[auto_1fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
            {/* Server-generated SVG from our own trusted qrcode library
                (see lib/reviews/reviewRequestQr.ts) — not user-supplied
                content, so dangerouslySetInnerHTML is safe here unlike the
                raw-review-text rendering elsewhere in the app. */}
            <div
              className="mx-auto w-fit"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <a
              href={qrDownloadHref}
              download={`${business.slug}-review-qr.svg`}
              className="mt-4 inline-block rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Download print-quality QR (SVG)
            </a>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="font-serif text-lg font-semibold text-slate-900">Your review-request link</h2>
            <p className="mt-1 text-sm text-slate-600">
              Hand out the QR code at checkout, stick it on the front desk, or drop this link into the appointment
              reminders you already send.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <code className="flex-1 break-all text-sm text-slate-700">{shortLink}</code>
              <CopyLinkButton text={shortLink} />
            </div>
            <Link
              href="/dashboard/review-requests/print"
              className="mt-4 inline-block rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              Print cards
            </Link>
          </div>
        </div>

        <div className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-serif text-lg font-semibold text-slate-900">How it&apos;s working</h2>
            <div className="flex gap-2">
              {WINDOW_OPTIONS.map((o) => (
                <Link
                  key={o.days}
                  href={`/dashboard/review-requests?days=${o.days}`}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    windowDays === o.days
                      ? "bg-teal-700 text-white"
                      : "border border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {o.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Page views" value={String(stats.pageViews)} />
            <Stat label="Clicked public review" value={String(stats.publicClicks)} />
            <Stat label="Private feedback sent" value={String(stats.privateSubmissions)} />
            <Stat label="New Google reviews" value={String(stats.newReviewsInWindow)} />
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-700">Rating movement</p>
            {stats.ratingBefore !== null && stats.ratingNow !== null ? (
              <p className="mt-1 font-serif text-2xl font-semibold text-slate-900">
                {stats.ratingBefore.toFixed(1)} → {stats.ratingNow.toFixed(1)}
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-400">
                Not enough history yet ({stats.reviewCountBefore} review{stats.reviewCountBefore === 1 ? "" : "s"} before
                this window — need at least 5 for this to mean anything).
              </p>
            )}
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Page views, clicks, and new reviews above are both measured over the same {windowDays}-day window, not
            individually matched — someone can leave a review without ever scanning the code, so these numbers show
            correlation, not proof that a specific review came from a specific scan.
          </p>
        </div>

        <div className="mt-10">
          <h2 className="font-serif text-lg font-semibold text-slate-900">Private Feedback</h2>
          {/* Neutralized to match the no-gating rule the public marketing
              copy now follows (see components/marketing/ReviewRequestsSection.tsx).
              This page is authenticated rather than public, so the framing is
              lower-risk here, but "the complaint that didn't become a 1-star
              review" describes the gating value prop and there's no cost to
              stating it descriptively instead. */}
          <p className="mt-1 text-xs text-slate-400">
            Sent by patients who chose to send it straight to you rather than post publicly. Not shown on Google, and
            not counted in your rating.
          </p>
          {feedback.length === 0 ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-8 text-center">
              <p className="text-slate-600">No private feedback yet.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {feedback.map((f) => (
                <div key={f.id} className="rounded-md border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span aria-hidden className="text-amber-500">
                      {f.rating ? "★".repeat(f.rating) + "☆".repeat(5 - f.rating) : "No rating given"}
                    </span>
                    <span>{fmtDate(f.createdAt)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{f.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <BfcacheGuard />
      <Header variant="app" />
      <main className="flex-1 bg-slate-50 py-10">
        <div className="mx-auto max-w-3xl px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Get More Reviews</p>
              <h1 className="font-serif text-2xl font-semibold text-slate-900">{business.name}</h1>
            </div>
            {/* No "Back to Dashboard" here — see the matching note in
                app/dashboard/reviews/page.tsx: the app header's nav
                provides it persistently, on every app page. */}
          </div>

          {data.hasDemoData ? (
            <div className="mt-10 rounded-lg border border-amber-200 bg-amber-50 p-8 text-center">
              <p className="text-slate-700">Connect your Google reviews to set up review requests.</p>
              <Link
                href="/dashboard"
                className="mt-4 inline-block rounded-md bg-teal-700 px-6 py-2.5 text-sm font-medium text-white hover:bg-teal-800"
              >
                Go to Dashboard
              </Link>
            </div>
          ) : subscriptionInactive ? (
            <div className="mt-10 rounded-lg border border-amber-200 bg-amber-50 p-8 text-center">
              <p className="text-slate-700">{inactiveSubscriptionMessage(subscription?.status)}</p>
              <Link
                href="/billing"
                className="mt-4 inline-block rounded-md bg-teal-700 px-6 py-2.5 text-sm font-medium text-white hover:bg-teal-800"
              >
                Reactivate Subscription
              </Link>
            </div>
          ) : !business.slug ? (
            // Shouldn't be reachable — every business gets a slug at
            // creation (createAccountWithDemoBusiness) or via the one-off
            // backfill (scripts/backfill-business-slugs.ts) — but stay
            // defensive rather than silently rendering nothing.
            <div className="mt-10 rounded-lg border border-slate-200 bg-white p-8 text-center">
              <p className="text-slate-600">
                Your review-request link is still being set up. Please check back in a moment, or contact support if
                this persists.
              </p>
            </div>
          ) : (
            content
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-serif text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
