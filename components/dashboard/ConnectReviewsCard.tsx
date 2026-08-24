"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppealForm } from "./AppealForm";
import { LoadingDots } from "@/components/ui/LoadingDots";
import { useAnalysisProgress } from "./useAnalysisProgress";
import { useConnectTransition } from "./ConnectTransition";

const PLACE_ID_FINDER_URL = "https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder";

// Mirrors components/dashboard/RunAnalysisButton.tsx's auto-continue pattern
// (and components/admin/PilotManagement.tsx's ConnectGoogleReviewsForm,
// which does the same thing for an admin connecting on a customer's
// behalf) — same wall-clock-budgeted extraction loop
// (lib/analysis/runAnalysis.ts), same reason to keep going automatically,
// same backstop.
const MAX_ANALYSIS_ROUNDS = 20;

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
 * That route only runs ONE ~45s-budgeted analysis pass and returns
 * reviewsRemaining — a business with more than a handful of reviews (280,
 * 389, 400 in the outreach queue) won't finish in that first pass. Rather
 * than leave the customer to notice and click a separate "Run Analysis Now"
 * button themselves, this keeps calling /api/analysis/run automatically
 * (same endpoint, same session, same business) until reviewsRemaining hits
 * 0, showing one continuous "Analyzing your reviews… N of Total" progress
 * state throughout — a connect step should never quietly leave work
 * unfinished. Only refreshes the dashboard once everything is actually
 * done, or says plainly that it's still going if MAX_ANALYSIS_ROUNDS is hit
 * — never implies completion it hasn't reached.
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
  const { progress, start, recordRound, clear } = useAnalysisProgress();
  const { beginConnect, endConnect } = useConnectTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [claimedByOther, setClaimedByOther] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    setClaimedByOther(false);
    // Before the request, not after: connectGoogleReviewSource deletes
    // every demo review, so from this instant the metric tiles and the
    // demo banner are describing rows that are being removed. They hide
    // themselves until fresh server data lands (see ConnectTransition).
    beginConnect();

    try {
      const res = await fetch("/api/reviews/connect-google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId }),
      });
      const data = await res.json();

      if (!res.ok) {
        // Nothing was deleted on a failed connect, so the demo metrics
        // and banner are truthful again and must come back.
        endConnect();
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
      // (see lib/db/queries.ts) — imported/skipped/reviewsRemaining are all
      // 0 in that case, which would otherwise misleadingly read as "found
      // nothing" or "fully analyzed."
      if (data.cooledDown) {
        // A cooled-down connect changed nothing either.
        endConnect();
        setResult({ ok: true, message: "This business was already synced within the last few minutes — try again shortly." });
        setSubmitting(false);
        return;
      }

      const importedMessage = `Connected — imported ${data.imported} review${data.imported === 1 ? "" : "s"}.`;
      let totalAnalyzed = data.reviewsNewlyAnalyzed ?? 0; // always 0 — connect imports only
      let remaining = data.reviewsRemaining ?? 0;

      // Timing starts HERE, after the import, not before it. The connect
      // request above is a 20-40s Outscraper fetch that analyzes nothing,
      // so folding its latency into the throughput measurement would make
      // the first estimate roughly twice the real remaining time. What's
      // being extrapolated is analysis speed, so only analysis time counts.
      start();
      // Shows "0 of N" immediately rather than a bare spinner. No estimate
      // yet — nothing has been analyzed to measure a rate from.
      recordRound(totalAnalyzed, remaining);

      for (let round = 0; remaining > 0 && round < MAX_ANALYSIS_ROUNDS; round++) {
        const runRes = await fetch("/api/analysis/run", { method: "POST" });
        const runData = await runRes.json().catch(() => null);

        if (!runRes.ok) {
          const reason = runRes.status === 429 ? runData?.error || "Rate limited." : runData?.error || "Analysis failed.";
          setResult({
            ok: true,
            message: `${importedMessage} Analyzed ${totalAnalyzed} review(s) so far, then paused: ${reason} Click "Run Analysis Now" on your dashboard to finish.`,
          });
          setSubmitting(false);
          clear();
          router.refresh();
          return;
        }

        totalAnalyzed += runData.reviewsNewlyAnalyzed ?? 0;
        remaining = runData.reviewsRemaining ?? 0;
        recordRound(totalAnalyzed, remaining);
      }

      if (remaining > 0) {
        // Hit MAX_ANALYSIS_ROUNDS without finishing — real progress was
        // made, but don't imply it's done. "Run Analysis Now" on the
        // dashboard picks up exactly where this left off.
        setResult({
          ok: true,
          message: `${importedMessage} Analyzed ${totalAnalyzed} review(s) so far — still going. Click "Run Analysis Now" on your dashboard to finish the rest.`,
        });
        setSubmitting(false);
        clear();
        router.refresh();
        return;
      }

      setResult({ ok: true, message: `${importedMessage} Analyzed all ${totalAnalyzed} review(s). Refreshing your dashboard…` });
      // Immediately, not on a timer. The suppressed metrics/banner stay
      // suppressed until this lands, so every extra second of delay is a
      // second of blanked chrome for no benefit.
      router.refresh();
    } catch {
      endConnect();
      setResult({ ok: false, message: "Connection failed. Please try again." });
      setSubmitting(false);
      clear();
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
                    {progress
                      ? `Analyzing your reviews… ${progress.analyzed} of ${progress.total}${progress.estimateLabel ? ` · ${progress.estimateLabel}` : ""}`
                      : "Connecting…"}
                    <LoadingDots />
                  </>
                ) : (
                  "Connect"
                )}
              </button>
            </form>
            {submitting && progress && (
              // Matters most right here: this is a brand-new paying
              // customer's very first experience of the product, and the
              // one thing a long unattended wait actually risks is them
              // closing the tab — which the resumable design doesn't need
              // them to avoid, but they don't know that unless told.
              <p className="mt-2 text-xs text-slate-500">
                You can leave this page — analysis continues, and you can pick it up here any time.
              </p>
            )}
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
