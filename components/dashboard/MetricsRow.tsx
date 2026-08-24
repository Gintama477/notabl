"use client";

import { useConnectTransition } from "./ConnectTransition";

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 font-serif text-2xl font-semibold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function MetricsRow({
  totalReviews,
  reviewsAnalyzedCount,
  avgRating,
  positivePct,
  negativePct,
  emergingIssuesCount,
  importantThemesCount,
}: {
  totalReviews: number;
  // How many of totalReviews actually have themes extracted
  // (reviews.analyzedWith IS NOT NULL) — see getDashboardData,
  // lib/db/queries.ts. "Reviews Analyzed" used to just show totalReviews
  // (really "reviews imported"), which read as a finished number even
  // mid-run. When these two differ, the tile says so plainly instead of
  // implying completeness it doesn't have.
  reviewsAnalyzedCount: number;
  avgRating: number;
  positivePct: number;
  negativePct: number;
  emergingIssuesCount: number;
  importantThemesCount: number;
}) {
  const { connecting } = useConnectTransition();

  // Every number here is server-rendered from the demo dataset that a
  // connect is in the middle of deleting. Showing "45 / 100" beside the
  // connect card's "imported 17 reviews" is worse than showing nothing, so
  // these become placeholders until real data arrives.
  if (connecting) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
            <div className="mt-3 h-6 w-12 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  const analysisComplete = reviewsAnalyzedCount >= totalReviews;
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <Metric
        label="Reviews Analyzed"
        value={analysisComplete ? String(totalReviews) : `${reviewsAnalyzedCount} / ${totalReviews}`}
        sub={analysisComplete ? undefined : "Analysis in progress"}
      />
      <Metric label="Average Rating" value={`${avgRating.toFixed(1)} / 5`} />
      <Metric label="Positive Reviews" value={`${positivePct}%`} />
      <Metric label="Negative Reviews" value={`${negativePct}%`} />
      <Metric label="Emerging Issues" value={String(emergingIssuesCount)} />
      <Metric label="Important Themes" value={String(importantThemesCount)} />
    </div>
  );
}
