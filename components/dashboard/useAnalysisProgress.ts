import { useCallback, useRef, useState } from "react";

export type AnalysisProgress = {
  analyzed: number;
  total: number;
  // null until enough data exists to estimate — see recordRound below.
  estimateLabel: string | null;
};

// Formats a remaining-seconds estimate into plain, coarse language — never
// a precise ticking countdown, which reads as broken the moment it's off
// by even a few seconds. "almost done" below ~30s avoids ever showing
// "about 0 minutes left."
export function formatRemainingEstimate(remainingSeconds: number): string {
  if (remainingSeconds < 30) return "almost done";
  const minutes = Math.round(remainingSeconds / 60);
  if (minutes <= 1) return "about a minute left";
  return `about ${minutes} minutes left`;
}

// Shared by RunAnalysisButton and ConnectReviewsCard — both drive the same
// auto-continue analysis loop (lib/analysis/runAnalysis.ts's
// EXTRACTION_BUDGET_MS-bounded rounds) and both need the same progress
// display, so this logic lives in one place instead of being reimplemented
// (and drifting) twice.
//
// The estimate is derived from THIS SESSION'S measured throughput
// (elapsed time / reviews analyzed so far), never a hardcoded
// seconds-per-review constant — the concurrency change in
// lib/analysis/runAnalysis.ts makes this several times faster than the ~4s/
// review it was measured at, and a hardcoded number would then be wrong in
// the wrong direction. Measuring live means it's automatically correct
// whatever the current rate actually is, before or after that change.
export function useAnalysisProgress() {
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const roundRef = useRef(0);
  // The smoothed remaining-SECONDS estimate, not the rendered label — kept
  // separate so "never let it increase" compares actual numbers, not
  // already-rounded strings that could tie at the same label while the
  // underlying seconds crept up underneath it.
  const lastEstimateSecondsRef = useRef<number | null>(null);

  // Call once, right before the first request of a run — a fetch's own
  // latency is real elapsed time and belongs in the throughput measurement.
  const start = useCallback(() => {
    startedAtRef.current = Date.now();
    roundRef.current = 0;
    lastEstimateSecondsRef.current = null;
    setProgress(null);
  }, []);

  // Call once after each round's response comes back, with the running
  // total analyzed and however many are still remaining.
  const recordRound = useCallback((analyzed: number, remaining: number) => {
    roundRef.current += 1;

    // Estimate from the FIRST completed round onward.
    //
    // This deliberately started at round 2, on the reasoning that one data
    // point is too noisy to extrapolate from. Measured in production, that
    // reasoning was wrong twice over. A "data point" is not one review: a
    // round is a full wall-clock budget window, so round 1 measures 40-odd
    // reviews and yields a perfectly stable per-review rate. And once
    // intermediate rounds stopped generating throwaway narratives
    // (lib/analysis/runAnalysis.ts), a 200-review backlog drains in 2-3
    // rounds instead of 5+ — so "from round 2" meant the estimate appeared
    // on the round that finishes the work, where remaining hits 0, progress
    // clears, and it renders never. Faster analysis made the estimate
    // permanently invisible.
    //
    // A first-round estimate skewing high is safe and self-correcting: the
    // ConnectReviewsCard path includes its one-time Google import in that
    // elapsed time, which can only make the first estimate pessimistic, and
    // the never-increase rule below lets later rounds revise it downward.
    let estimateLabel: string | null = null;
    if (roundRef.current >= 1 && startedAtRef.current !== null && analyzed > 0 && remaining > 0) {
      const elapsedSeconds = (Date.now() - startedAtRef.current) / 1000;
      const secondsPerReview = elapsedSeconds / analyzed;
      const rawEstimateSeconds = secondsPerReview * remaining;

      // Never let the displayed estimate jump upward — a slower round (a
      // 429 retry, a momentarily slow response) would otherwise make the
      // number visibly climb, and an estimate that jumps from 4 minutes
      // back up to 9 is worse than no estimate at all. Only revise it
      // downward as real progress confirms things are on track or faster.
      const smoothedSeconds =
        lastEstimateSecondsRef.current === null
          ? rawEstimateSeconds
          : Math.min(lastEstimateSecondsRef.current, rawEstimateSeconds);
      lastEstimateSecondsRef.current = smoothedSeconds;
      estimateLabel = formatRemainingEstimate(smoothedSeconds);
    }

    setProgress(remaining > 0 ? { analyzed, total: analyzed + remaining, estimateLabel } : null);
  }, []);

  // Call in a finally block (or wherever the existing code already resets
  // progress to null) — same effect, plus resets the timing refs so a
  // second run later doesn't inherit the first run's stale estimate.
  const clear = useCallback(() => {
    setProgress(null);
    startedAtRef.current = null;
    roundRef.current = 0;
    lastEstimateSecondsRef.current = null;
  }, []);

  return { progress, start, recordRound, clear };
}
