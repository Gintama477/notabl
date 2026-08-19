import { THEME_LABELS, ThemeCategory } from "@/config/themes";
import type { ThemeExcerpt } from "@/lib/db/queries";

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
type ExcerptsByTheme = Record<string, ThemeExcerpt[]>;

// Real, verbatim patient quotes shown under a theme's summary. Excerpts have
// already been validated as exact substrings of their source review at
// analysis time (lib/ai/validate.ts), so nothing here re-checks that — this
// only handles display: star rating, italics, and attribution.
function QuoteList({ quotes }: { quotes: ThemeExcerpt[] | undefined }) {
  if (!quotes || quotes.length === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {quotes.map((q, i) => (
        <blockquote key={i} className="border-l-2 border-slate-200 pl-3 text-sm italic text-slate-500">
          &ldquo;{q.text}&rdquo;
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

function SectionCard({
  title,
  accent,
  children,
  empty,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <h3 className={`font-serif text-lg font-semibold ${accent}`}>{title}</h3>
      {empty ? (
        <p className="mt-3 text-sm text-slate-400">Nothing notable this period.</p>
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
          <QuoteList quotes={excerptsByTheme?.[t.category]} />
        </div>
      ))}
    </SectionCard>
  );
}

export function WhatPatientsDislike({ items, excerptsByTheme }: { items: ThemeRef[]; excerptsByTheme?: ExcerptsByTheme }) {
  return (
    <SectionCard title="What Patients Dislike" accent="text-red-800" empty={items.length === 0}>
      {items.map((t) => (
        <div key={t.category} className="border-l-2 border-red-600 pl-3">
          <p className="text-sm font-medium text-slate-800">{THEME_LABELS[t.category]}</p>
          <p className="text-sm text-slate-600">{t.summary}</p>
          <QuoteList quotes={excerptsByTheme?.[t.category]} />
        </div>
      ))}
    </SectionCard>
  );
}

export function NewThisWeek({ items, excerptsByTheme }: { items: ThemeRef[]; excerptsByTheme?: ExcerptsByTheme }) {
  return (
    <SectionCard title="New This Week" accent="text-amber-800" empty={items.length === 0}>
      {items.map((t) => (
        <div key={t.category} className="border-l-2 border-amber-500 pl-3">
          <p className="text-sm font-medium text-slate-800">{THEME_LABELS[t.category]}</p>
          <p className="text-sm text-slate-600">{t.summary}</p>
          <QuoteList quotes={excerptsByTheme?.[t.category]} />
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
            Mentions {r.pctChangeVsPrior !== null ? `increased ${Math.round(r.pctChangeVsPrior)}%` : "increased"} compared with the
            previous period ({r.negativeCount} negative mention{r.negativeCount === 1 ? "" : "s"} this period).
          </p>
          <QuoteList quotes={excerptsByTheme?.[r.themeCategory]} />
        </div>
      ))}
    </SectionCard>
  );
}

export function Opportunities({ rollups, excerptsByTheme }: { rollups: Rollup[]; excerptsByTheme?: ExcerptsByTheme }) {
  const positiveSorted = rollups
    .filter((r) => r.positiveCount > r.negativeCount && r.positiveCount > 0)
    .sort((a, b) => b.positiveCount - a.positiveCount);
  // Frame the 3rd+ strongest positive themes as under-leveraged marketing
  // opportunities — the top 2 already show in "What Patients Love".
  const opportunities = positiveSorted.slice(2, 5);
  return (
    <SectionCard title="Opportunities" accent="text-teal-800" empty={opportunities.length === 0}>
      {opportunities.map((r) => (
        <div key={r.themeCategory} className="border-l-2 border-teal-600 pl-3">
          <p className="text-sm font-medium text-slate-800">{THEME_LABELS[r.themeCategory as ThemeCategory]}</p>
          <p className="text-sm text-slate-600">
            Praised in {r.positiveCount} review{r.positiveCount === 1 ? "" : "s"} this period — consider
            highlighting this in your marketing or patient communications.
          </p>
          <QuoteList quotes={excerptsByTheme?.[r.themeCategory]} />
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
