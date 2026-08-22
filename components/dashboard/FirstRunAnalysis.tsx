"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingDots } from "@/components/ui/LoadingDots";
import { useAnalysisProgress } from "./useAnalysisProgress";

// Same backstop as RunAnalysisButton / ConnectReviewsCard.
const MAX_ROUNDS = 20;

/**
 * Runs a business's first analysis automatically when the dashboard loads
 * with reviews but no report yet.
 *
 * This is the work signup used to do inside its own request, which is what
 * broke it: once real Claude was configured, a full analysis pass blew
 * past Vercel's silent 10-second default and the signup form hung on
 * "Setting up your dashboard…" forever. Moving it here keeps the promise
 * that the customer never clicks anything to make analysis happen, while
 * giving them something better than a frozen form — visible progress, a
 * time estimate, and a page they can leave and come back to.
 *
 * Starts once per mount, guarded by a ref: React Strict Mode double-invokes
 * effects in development, and a second concurrent loop would double the
 * API calls for no benefit. Once a report exists the dashboard stops
 * rendering this at all, so it can't re-trigger on later visits.
 */
export function FirstRunAnalysis() {
  const router = useRouter();
  const { progress, start, recordRound, clear } = useAnalysisProgress();
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(true);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function run() {
      start();
      let totalAnalyzed = 0;
      try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const res = await fetch("/api/analysis/run", { method: "POST" });
          const data = await res.json().catch(() => null);

          if (!res.ok) {
            // Every analyzed review is already committed, so say so —
            // "failed" alone would read as though the work were lost.
            setMessage(
              res.status === 429
                ? "Rate limited — your progress is saved. Click “Run Analysis Now” in a few minutes to continue."
                : "Analysis was interrupted. Your progress is saved — click “Run Analysis Now” to continue."
            );
            return;
          }

          totalAnalyzed += data.reviewsNewlyAnalyzed ?? 0;
          const remaining = data.reviewsRemaining ?? 0;
          recordRound(totalAnalyzed, remaining);
          if (remaining > 0) continue;

          clear();
          // Reloads the server component so the freshly written report
          // renders in place of this card.
          router.refresh();
          return;
        }
        setMessage("Analyzed as much as one session allows — click “Run Analysis Now” to finish the rest.");
        router.refresh();
      } catch {
        setMessage("Analysis was interrupted. Your progress is saved — click “Run Analysis Now” to continue.");
      } finally {
        setRunning(false);
      }
    }

    void run();
    // Deliberately mount-only: this fires once for a business with no
    // report, and the ref above makes a repeat invocation a no-op anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-10 rounded-lg border border-slate-200 bg-white p-8 text-center">
      {running ? (
        <>
          <p className="flex items-center justify-center text-slate-700">
            {progress
              ? `Analyzing your reviews… ${progress.analyzed} of ${progress.total}${progress.estimateLabel ? ` · ${progress.estimateLabel}` : ""}`
              : "Analyzing your reviews…"}
            <LoadingDots color="slate" />
          </p>
          <p className="mt-2 text-sm text-slate-500">
            This runs by itself — you can leave this page and come back, and it&apos;ll pick up where it left off.
          </p>
        </>
      ) : (
        <p className="text-slate-600">{message ?? "Analysis finished."}</p>
      )}
    </div>
  );
}
