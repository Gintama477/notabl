"use client";

import { useState } from "react";
import { SectionCard } from "./Sections";
import { formatReviewText } from "@/lib/reviews/formatReviewText";

export type NewReview = {
  id: string;
  authorName: string | null;
  rating: number;
  reviewText: string;
  reviewDate: string;
};

const COLLAPSED_LIMIT = 3;

// Under the cumulative report model (see lib/analysis/runAnalysis.ts), the
// theme sections elsewhere on the dashboard are built from the business's
// full review history and are never empty — so this section is deliberately
// the ONE honest, literal "what came in since last time" list. A quiet week
// with zero new reviews is a completely normal, expected state here, not a
// sign anything's broken.
//
// A client component (unlike the rest of components/dashboard/Sections.tsx)
// purely for the expand/collapse state below — a busy practice can get more
// than a handful of new reviews in a week, and showing all of them
// uncapped looks overwhelming even once app/dashboard/page.tsx limits this
// to a genuine trailing-7-day window.
export function NewThisWeek({ reviews }: { reviews: NewReview[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? reviews : reviews.slice(0, COLLAPSED_LIMIT);
  const hasMore = reviews.length > COLLAPSED_LIMIT;

  return (
    <SectionCard
      title="New Reviews This Week"
      accent="text-amber-800"
      empty={reviews.length === 0}
      emptyMessage="No new reviews since your last report."
    >
      {visible.map((r) => (
        <div key={r.id} className="border-l-2 border-amber-500 pl-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{r.authorName?.trim() || "Anonymous"}</span>
            <span aria-hidden className="text-amber-500">
              {"★".repeat(r.rating)}
              {"☆".repeat(Math.max(0, 5 - r.rating))}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-line text-sm italic text-slate-600">
            &ldquo;{formatReviewText(r.reviewText)}&rdquo;
          </p>
        </div>
      ))}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium text-amber-800 hover:text-amber-900"
        >
          {expanded ? "Show fewer" : `See all ${reviews.length} reviews`}
        </button>
      )}
    </SectionCard>
  );
}
