"use client";

import { useState } from "react";
import { SectionCard } from "./Sections";
import { DraftReplyButton } from "./DraftReplyButton";
import { formatReviewText } from "@/lib/reviews/formatReviewText";

export type LowRatedReview = {
  id: string;
  authorName: string | null;
  rating: number;
  reviewText: string;
  reviewDate: string;
};

const COLLAPSED_LIMIT = 3;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// The single thing a practice owner most wants to see, surfaced directly
// instead of requiring a trip to All Reviews + a rating filter. Deliberately
// always meaningful, unlike the theme cards beside it: even an excellent,
// 4.8-star practice has a handful of 1-2 star reviews (getDashboardData's
// own definition of "negative" — see MetricsRow's negativePct), and it's
// those SPECIFIC reviews — full text, not a theme summary — that a
// good-but-imperfect practice owner actually wants to read and respond to.
// This is deliberately the highest-value addition on a sparse "What
// Patients Dislike" column: real content the theme cards can't provide,
// not a rephrasing of the same summary.
//
// A client component (like NewThisWeek.tsx) purely for the expand/collapse
// state below — reuses the exact same review-card markup and
// DraftReplyButton as the All Reviews page (app/dashboard/reviews/page.tsx).
export function LowRatedReviewsCard({
  reviews,
  googleReviewsUrl,
}: {
  reviews: LowRatedReview[];
  googleReviewsUrl: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? reviews : reviews.slice(0, COLLAPSED_LIMIT);
  const hasMore = reviews.length > COLLAPSED_LIMIT;

  return (
    <SectionCard
      title="Reviews Worth Your Attention"
      accent="text-slate-900"
      empty={reviews.length === 0}
      // Genuinely good news, stated plainly — not filler. A practice with
      // zero low-rated reviews has nothing to act on, and the message
      // should say exactly that instead of a generic "nothing to report."
      emptyMessage="No reviews rated 1–2 stars. Nothing needs a response right now."
    >
      {visible.map((r) => (
        <div key={r.id} className="rounded-md border border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{r.authorName?.trim() || "Anonymous"}</span>
            <span>
              {"★".repeat(r.rating)}
              {"☆".repeat(Math.max(0, 5 - r.rating))} · {fmtDate(r.reviewDate)}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{formatReviewText(r.reviewText)}</p>
          <DraftReplyButton reviewId={r.id} googleReviewsUrl={googleReviewsUrl} />
        </div>
      ))}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          {expanded ? "Show fewer" : `Show all ${reviews.length} reviews`}
        </button>
      )}
    </SectionCard>
  );
}
