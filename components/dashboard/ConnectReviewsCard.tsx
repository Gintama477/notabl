"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppealForm } from "./AppealForm";
import { LoadingDots } from "@/components/ui/LoadingDots";

const PLACE_ID_FINDER_URL = "https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder";

/**
 * Shown at the top of the dashboard once an account has actually started a
 * paid subscription but hasn't connected real Google reviews yet — see the
 * showConnectReviewsCard condition in app/dashboard/page.tsx. Deliberately
 * large and step-by-step (Stripe-account-activation-flow style), not a thin
 * banner: this is the one remaining thing standing between a paying
 * customer and their real report, so it's the focal point of the page
 * rather than something easy to miss.
 *
 * Posts straight to the self-serve /api/reviews/connect-google route (see
 * that file for why it's safe to expose to a logged-in customer directly).
 * On success, shows a confirmation message for a moment before refreshing
 * the dashboard — a router.refresh() with hasDemoData now false makes the
 * parent stop rendering this card at all, so an instant refresh would cut
 * the confirmation off before anyone could read it.
 *
 * If the route reports the Place ID is already connected to a different
 * business (BusinessAlreadyClaimedError, lib/db/queries.ts), this shows a
 * distinct "already has a Notabl account" message with the shared
 * AppealForm instead of a generic failure — that's the one error case
 * where the honest next step is "talk to a human," not "try again."
 */
export function ConnectReviewsCard() {
  const router = useRouter();
  const [placeId, setPlaceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [claimedByOther, setClaimedByOther] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    setClaimedByOther(false);
    try {
      const res = await fetch("/api/reviews/connect-google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "business_already_claimed") {
          setClaimedByOther(true);
          setSubmitting(false);
          return;
        }
        setResult({ ok: false, message: data.error?.formErrors?.[0] || data.error || "Connection failed." });
        setSubmitting(false);
        return;
      }
      // cooledDown means connectGoogleReviewSource skipped re-fetching
      // since this exact Place ID was synced within the last 10 minutes
      // (see lib/db/queries.ts) — imported/skipped are both 0 in that case,
      // which would otherwise misleadingly read as "found nothing."
      setResult(
        data.cooledDown
          ? { ok: true, message: "This business was already synced within the last few minutes — try again shortly." }
          : {
              ok: true,
              message: `Connected — imported ${data.imported} review${data.imported === 1 ? "" : "s"}. Refreshing your dashboard…`,
            }
      );
      if (!data.cooledDown) setTimeout(() => router.refresh(), 1500);
      else setSubmitting(false);
    } catch {
      setResult({ ok: false, message: "Connection failed. Please try again." });
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border-2 border-teal-700 bg-white p-6 shadow-lg shadow-teal-900/5 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Get your real report</p>
      <h2 className="mt-1 font-serif text-xl font-semibold text-slate-900 sm:text-2xl">
        Connect your Google reviews
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        You&apos;re subscribed — one more step and this dashboard switches from sample data to your practice&apos;s
        real reviews.
      </p>

      <div className="mt-6 space-y-6">
        <div className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white">
            1
          </span>
          <div>
            <p className="font-medium text-slate-900">Find your Google Place ID</p>
            <p className="mt-1 text-sm text-slate-600">
              Open Google&apos;s{" "}
              <a
                href={PLACE_ID_FINDER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-teal-700 underline hover:text-teal-800"
              >
                Place ID Finder
              </a>
              , search your practice name, click it on the map, and copy the Place ID shown.
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white">
            2
          </span>
          <div className="flex-1">
            <p className="font-medium text-slate-900">Paste it here and connect</p>
            <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                value={placeId}
                onChange={(e) => setPlaceId(e.target.value)}
                placeholder="Google Place ID (e.g. ChIJ…)"
                required
                disabled={submitting}
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={submitting}
                className="shrink-0 rounded-md bg-teal-700 px-5 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    Connecting…
                    <LoadingDots />
                  </>
                ) : (
                  "Connect"
                )}
              </button>
            </form>
            {claimedByOther ? (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-900">This business already has a Notabl account.</p>
                <div className="mt-2">
                  <AppealForm appealType="business_already_claimed" />
                </div>
              </div>
            ) : (
              result && <p className={`mt-2 text-sm ${result.ok ? "text-teal-800" : "text-red-700"}`}>{result.message}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
