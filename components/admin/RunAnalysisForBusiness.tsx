"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingDots } from "@/components/ui/LoadingDots";
import { useAnalysisProgress } from "@/components/dashboard/useAnalysisProgress";

// Same backstop as the customer-facing loops.
const MAX_ROUNDS = 20;

/**
 * Runs analysis for any business, from the admin panel, without needing to
 * log in as that business.
 *
 * The gap this fills: /api/admin/analysis/run has always existed, but
 * nothing in the UI called it outside the Connect-Google flow — so a
 * business you can't sign in as had no way to be analyzed at all. That
 * includes the one that matters most: "Brightview Family Dental" owns the
 * public /sample-report page and belongs to sample-report@notabl.demo,
 * which isn't a real inbox, so there's no magic link to log in with. Its
 * reviews were still analyzed by the pre-Claude keyword matcher while
 * being shown to prospects as a demo of an AI product.
 *
 * Also the practical way to apply a narrative version bump: the reuse
 * check in runAnalysisForBusiness regenerates a report whose
 * narrativeVersion is stale, so one run per business is all a wording
 * change needs — no re-extraction, and cheap when reviews are already
 * current.
 *
 * Drives the same auto-continuing round loop as RunAnalysisButton, with
 * the same progress and time estimate, because a business with a full
 * backlog of stale reviews needs several rounds and one click should still
 * finish the job.
 */
export function RunAnalysisForBusiness({ businesses }: { businesses: { id: string; name: string }[] }) {
  const router = useRouter();
  const [businessId, setBusinessId] = useState("");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { progress, start, recordRound, clear } = useAnalysisProgress();

  async function run() {
    if (!businessId) return;
    setRunning(true);
    setMessage(null);
    start();
    let totalAnalyzed = 0;

    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const res = await fetch("/api/admin/analysis/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessId }),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          // Every analyzed review is committed as it goes, so this is
          // genuinely resumable — say so rather than implying lost work.
          setMessage(
            `${data?.error || "Analysis failed."} ${totalAnalyzed} review(s) analyzed so far — progress is saved, run again to continue.`
          );
          return;
        }

        totalAnalyzed += data.reviewsNewlyAnalyzed ?? 0;
        const remaining = data.reviewsRemaining ?? 0;
        recordRound(totalAnalyzed, remaining);
        if (remaining > 0) continue;

        setMessage(
          totalAnalyzed > 0
            ? `Done — ${totalAnalyzed} review(s) analyzed and the report regenerated.`
            : "Done — nothing needed re-analyzing, and the report was regenerated if its wording was out of date."
        );
        clear();
        router.refresh();
        return;
      }

      setMessage(`Analyzed ${totalAnalyzed} review(s) so far — progress is saved, run again to finish the rest.`);
      router.refresh();
    } catch {
      setMessage(`Analysis was interrupted${totalAnalyzed > 0 ? ` after ${totalAnalyzed} review(s)` : ""}. Progress is saved — run again to continue.`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <p className="mb-2 text-sm font-medium text-slate-800">Run analysis for a business</p>
      <p className="mb-3 text-xs text-slate-500">
        Re-analyzes anything stale and regenerates that business&apos;s report. Needed for businesses you
        can&apos;t sign in as — including the sample-report practice — and after a narrative version bump.
        Keeps going across rounds by itself.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={businessId}
          onChange={(e) => setBusinessId(e.target.value)}
          disabled={running}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
        >
          <option value="">Select a business…</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={run}
          disabled={running || !businessId}
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {running ? (
            <>
              {progress
                ? `Analyzing… ${progress.analyzed} of ${progress.total}${progress.estimateLabel ? ` · ${progress.estimateLabel}` : ""}`
                : "Running…"}
              <LoadingDots />
            </>
          ) : (
            "Run Analysis"
          )}
        </button>
      </div>
      {running && (
        <p className="mt-2 text-xs text-slate-400">
          Leaving this page stops the loop, but every analyzed review is already saved — running again picks up
          where it left off.
        </p>
      )}
      {message && <p className="mt-2 text-xs text-slate-600">{message}</p>}
    </div>
  );
}
