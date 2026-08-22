import { THEME_LABELS, ThemeCategory } from "@/config/themes";
import type { ThemeExcerpt, ThemeExcerptsBySentiment } from "@/lib/db/queries";
import { formatReviewText } from "@/lib/reviews/formatReviewText";

type ThemeRef = { category: ThemeCategory; summary: string };
type Action = { title: string; detail: string };
type Rollup = {
  themeCategory: string;
  mentionCount: number;
  positiveCount: number;
  negativeCount: number;
  trendDirection: string;
  pctChangeVsPrior: number | null;
};
type ExcerptsByTheme = ThemeExcerptsBySentiment;

// Real, verbatim patient quotes shown under a theme's summary. Excerpts have
// already been validated as exact substrings of their source review at
// analysis time (lib/ai/validate.ts), so nothing here re-checks that — this
// only handles display: star rating, italics, and attribution.
//
// IMPORTANT: every quote passed here must already match the sentiment of
// the section it's rendered in — this component does no sentiment
// filtering of its own, on purpose, so that guarantee has to hold at every
// call site below (excerptsByTheme?.[category].positive for a positive
// section, .negative for a negative one, never the other bucket or an
// unfiltered list). A 5-star quote illustrating a complaint is how this bug
// happened the first time; see getThemeExcerptsForBusiness in
// lib/db/queries.ts for where the positive/negative split is enforced.
function QuoteList({ quotes }: { quotes: ThemeExcerpt[] | undefined }) {
  if (!quotes || quotes.length === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {quotes.map((q, i) => (
        <blockquote key={i} className="whitespace-pre-line border-l-2 border-slate-200 pl-3 text-sm italic text-slate-500">
          &ldquo;{formatReviewText(q.text)}&rdquo;
          <footer className="mt-1 not-italic text-xs text-slate-400">
            <span aria-hidden className="text-amber-500">
              {"★".repeat(q.rating)}
              {"☆".repeat(Math.max(0, 5 - q.rating))}
            </span>{" "}
            — {q.authorName?.trim() || "Anonymous"}
          </footer>
        </blockquote>
      ))}
    </div>
  );
}

// Exported (not just used locally) so components/dashboard/NewThisWeek.tsx
// — a separate client component, since it needs interactive expand/collapse
// state that the rest of this file doesn't — can reuse the same card shell.
export function SectionCard({
  title,
  accent,
  children,
  empty,
  emptyMessage = "Nothing notable to report.",
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
  empty?: boolean;
  emptyMessage?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <h3 className={`font-serif text-lg font-semibold ${accent}`}>{title}</h3>
      {empty ? (
        <p className="mt-3 text-sm text-slate-400">{emptyMessage}</p>
      ) : (
        <div className="mt-4 space-y-3">{children}</div>
      )}
    </div>
  );
}

export function WhatPatientsLove({ items, excerptsByTheme }: { items: ThemeRef[]; excerptsByTheme?: ExcerptsByTheme }) {
  return (
    <SectionCard title="What Patients Love" accent="text-teal-800" empty={items.length === 0}>
      {items.map((t) => (
        <div key={t.category} className="border-l-2 border-teal-600 pl-3">
          <p className="text-sm font-medium text-slate-800">{THEME_LABELS[t.category]}</p>
          <p className="text-sm text-slate-600">{t.summary}</p>
          <QuoteList quotes={excerptsByTheme?.[t.category]?.positive} />
        </div>
      ))}
    </SectionCard>
  );
}

// Only rendered when there ARE genuinely negative theme mentions — see
// app/dashboard/page.tsx, which falls through to real low-rated reviews
// (or a single honest "nothing needs your attention" line) when there
// aren't any.
//
// This deliberately has NO "closest thing to a weak spot" fallback. An
// earlier version relabelled itself "Where You're Least Strong" and showed
// the least-dominant POSITIVE themes, producing lines like "Billing —
// praised in 8 of 9 mentions — your least-dominant positive theme, not a
// complaint." That is accurate and useless: praise reframed as a weakness
// is noise dressed as insight, and it put positive quotes under a
// negative-sounding heading, the exact confusion the sentiment-bucketing
// work existed to remove. Never label praise as a weakness here.
export function WhatPatientsDislike({ items, excerptsByTheme }: { items: ThemeRef[]; excerptsByTheme?: ExcerptsByTheme }) {
  return (
    <SectionCard title="What Patients Dislike" accent="text-red-800" empty={items.length === 0}>
      {items.map((t) => (
        <div key={t.category} className="border-l-2 border-red-600 pl-3">
          <p className="text-sm font-medium text-slate-800">{THEME_LABELS[t.category]}</p>
          <p className="text-sm text-slate-600">{t.summary}</p>
          <QuoteList quotes={excerptsByTheme?.[t.category]?.negative} />
        </div>
      ))}
    </SectionCard>
  );
}

export function IssuesGettingWorse({ rollups, excerptsByTheme }: { rollups: Rollup[]; excerptsByTheme?: ExcerptsByTheme }) {
  const worsening = rollups.filter((r) => r.trendDirection === "increasing" && r.negativeCount > 0);
  return (
    <SectionCard title="Issues Getting Worse" accent="text-red-800" empty={worsening.length === 0}>
      {worsening.map((r) => (
        <div key={r.themeCategory} className="border-l-2 border-red-600 pl-3">
          <p className="text-sm font-medium text-slate-800">{THEME_LABELS[r.themeCategory as ThemeCategory]}</p>
          <p className="text-sm text-slate-600">
            Mentions {r.pctChangeVsPrior !== null ? `increased ${Math.round(r.pctChangeVsPrior)}%` : "increased"} since your last
            report ({r.negativeCount} negative mention{r.negativeCount === 1 ? "" : "s"} overall).
          </p>
          <QuoteList quotes={excerptsByTheme?.[r.themeCategory]?.negative} />
        </div>
      ))}
    </SectionCard>
  );
}

// Takes stored, AI-written items (like RecommendedActions), NOT rollups it
// summarizes itself. This used to derive the 3rd-through-5th strongest
// positive themes and write its own sentence — which meant every practice,
// forever, read the identical "consider highlighting this in your
// marketing or patient communications", three times on one page, with only
// the theme name and a number changing. That product intent (surface the
// strengths the headline section didn't cover) is preserved, just moved
// into the prompt, where the model is told not to repeat a category it
// already put in topPositiveThemes — see lib/ai/prompts/generateNarrative.ts.
export function Opportunities({ items, excerptsByTheme }: { items: ThemeRef[]; excerptsByTheme?: ExcerptsByTheme }) {
  return (
    <SectionCard
      title="Opportunities"
      accent="text-teal-800"
      empty={items.length === 0}
      // An honest empty state: a practice with only one or two themes has
      // no under-used strength to surface, and the model returning none is
      // the correct answer rather than a gap to pad.
      emptyMessage="Nothing under-used to flag — your strongest themes are already covered above."
    >
      {items.map((t) => (
        <div key={t.category} className="border-l-2 border-teal-600 pl-3">
          <p className="text-sm font-medium text-slate-800">{THEME_LABELS[t.category]}</p>
          <p className="text-sm text-slate-600">{t.summary}</p>
          <QuoteList quotes={excerptsByTheme?.[t.category]?.positive} />
        </div>
      ))}
    </SectionCard>
  );
}

export function RecommendedActions({ items }: { items: Action[] }) {
  return (
    <SectionCard title="Recommended Actions" accent="text-slate-900" empty={items.length === 0}>
      <ol className="space-y-3">
        {items.map((a, i) => (
          <li key={a.title} className="flex gap-3">
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-medium text-slate-800">{a.title}</p>
              <p className="text-sm text-slate-600">{a.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}
