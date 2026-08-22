"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingDots } from "@/components/ui/LoadingDots";
import { useAnalysisProgress } from "./useAnalysisProgress";

// runAnalysisForBusiness's extraction loop is wall-clock budgeted (~45s per
// call — see EXTRACTION_BUDGET_MS in lib/analysis/runAnalysis.ts), so one
// click on a business with a lot of reviews (e.g. right after
// ANTHROPIC_API_KEY gets set and everything needs re-analyzing with real
// Claude instead of the keyword-matching DemoProvider) won't finish in a
// single request. Rather than stop and make the owner click repeatedly,
// this keeps calling the endpoint automatically while reviewsRemaining > 0.
// MAX_ROUNDS is a backstop so a persistent failure (or a runaway edge case)
// can't loop forever — not a number expected to be hit in normal use.
const MAX_ROUNDS = 20;

// " after 24 reviews" / "" — a run that died before finishing even one
// round has no count worth quoting, and "after 0 reviews" reads worse than
// saying nothing.
function analyzedSoFar(count: number): string {
  return count > 0 ? ` after ${count} review${count === 1 ? "" : "s"}` : "";
}

export function RunAnalysisButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const { progress, start, recordRound, clear } = useAnalysisProgress();
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setRunning(true);
    setMessage(null);
    start();
    let totalAnalyzed = 0;

    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const res = await fetch("/api/analysis/run", { method: "POST" });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          // Never just "Analysis failed." — every review analyzed before
          // this point is already committed (analyzedAt/analyzedWith is
          // written per review, see lib/analysis/runAnalysis.ts), so the
          // work is genuinely not lost and the message must say so. The
          // old wording read like it was, which is the opposite of true
          // and the thing most likely to make someone give up.
          setMessage(
            res.status === 429
              ? `Rate limited${analyzedSoFar(totalAnalyzed)}. Your progress is saved — click "Run Analysis Now" again in a few minutes to continue.`
              : `Analysis was interrupted${analyzedSoFar(totalAnalyzed)}. Your progress is saved — click "Run Analysis Now" to continue.`
          );
          return;
        }

        totalAnalyzed += data.reviewsNewlyAnalyzed;
        const remaining = data.reviewsRemaining ?? 0;
        recordRound(totalAnalyzed, remaining);

        if (remaining > 0) {
          continue; // next round, automatically
        }

        setMessage(`Done — ${totalAnalyzed} review(s) analyzed.`);
        // The only path that clears progress: everything finished, so
        // there's no partial state left worth showing. Every other exit
        // below deliberately LEAVES the last progress/estimate on screen
        // (see the render) so the customer can see how far it actually got.
        clear();
        router.refresh();
        return;
      }

      // Hit MAX_ROUNDS without finishing — still real progress, just say so
      // plainly rather than implying it's actually done.
      setMessage(`Analyzed ${totalAnalyzed} review(s) so far. Your progress is saved — click "Run Analysis Now" again to finish the rest.`);
      router.refresh();
    } catch {
      setMessage(`Analysis was interrupted${analyzedSoFar(totalAnalyzed)}. Your progress is saved — click "Run Analysis Now" to continue.`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <button
          onClick={handleClick}
          disabled={running}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60"
        >
          {running ? (
            <>
              {progress
                ? `Analyzing your reviews… ${progress.analyzed} of ${progress.total}${progress.estimateLabel ? ` · ${progress.estimateLabel}` : ""}`
                : "Running analysis…"}
              <LoadingDots color="slate" />
            </>
          ) : (
            "Run Analysis Now"
          )}
        </button>
        {message && <span className="text-xs text-slate-500">{message}</span>}
      </div>
      {running && progress && (
        <p className="text-xs text-slate-400">
          You can leave this page — analysis continues, and you can pick it up here any time.
        </p>
      )}
      {/* Deliberately still rendered once the run has STOPPED, whenever a
          partial result is left over (an interrupted or rate-limited run —
          the success path clears it). "Analysis was interrupted" on its own
          doesn't tell anyone how far it got; this does, and it's the
          concrete evidence behind the "your progress is saved" claim in
          the message beside it. */}
      {!running && progress && (
        <p className="text-xs text-slate-400">
          Analyzed {progress.analyzed} of {progress.total} so far — saved
          {progress.estimateLabel ? ` · ${progress.estimateLabel} when you resume` : ""}.
        </p>
      )}
    </div>
  );
}
