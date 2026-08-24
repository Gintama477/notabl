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
// instead of requiring a trip to All Reviews + a rating filter. Shown in
// the right-hand dashboard column only when there are NO genuinely
// negative theme mentions to show there instead — see the priority order
// in app/dashboard/page.tsx. For a high-rated practice these specific
// reviews, in full, are the real actionable content; a theme summary of
// near-nothing is not.
//
// If there are none of these either, the card says exactly that in one
// clean line and renders nothing else. An honest short card beats a padded
// one, and it beats manufacturing a "weakness" out of praise (see the
// comment on WhatPatientsDislike in Sections.tsx for the version of this
// section that got that wrong).
//
// A client component (like NewThisWeek.tsx) purely for the expand/collapse
// state below — reuses the exact same review-card markup and
// DraftReplyButton as the All Reviews page (app/dashboard/reviews/page.tsx).
export function LowRatedReviewsCard({
  reviews,
  googleReviewsUrl,
  totalReviews,
}: {
  reviews: LowRatedReview[];
  googleReviewsUrl: string | null;
  totalReviews: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? reviews : reviews.slice(0, COLLAPSED_LIMIT);
  const hasMore = reviews.length > COLLAPSED_LIMIT;

  return (
    <SectionCard
      title="Reviews Worth Your Attention"
      accent="text-slate-900"
      empty={reviews.length === 0}
      // Genuinely good news, stated plainly with the real number in it —
      // not filler, and not a vague phrase. Reached only when there are
      // also no negative themes (see app/dashboard/page.tsx), so it can
      // honestly claim both at once.
      // Narrowed to what THIS card actually knows. It used to also claim
      // "no complaints", which now overlaps with the What Patients Dislike
      // card's own empty state sitting just above it — two cards asserting
      // the same thing in different words.
      emptyMessage={`No reviews below 4 stars across ${totalReviews} review${totalReviews === 1 ? "" : "s"}. Nothing needs a reply right now.`}
    >
      {/* Expanded, this scrolls inside its own box rather than growing the
          page indefinitely — a practice with 15 low-rated reviews would
          otherwise push everything below it far off screen. Collapsed
          (3 reviews) it never reaches the cap, so the box behaves as a
          plain list and no scrollbar appears. */}
      <div className={expanded ? "max-h-[32rem] space-y-3 overflow-y-auto pr-1" : "space-y-3"}>
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
      </div>
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
