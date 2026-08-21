import Link from "next/link";
import { THEME_LABELS, ThemeCategory } from "@/config/themes";
import type { ThemeExcerpt } from "@/lib/db/queries";
import { formatLastUpdated } from "@/lib/reports/formatLastUpdated";
import { formatReviewText } from "@/lib/reviews/formatReviewText";

type ThemeRef = { category: ThemeCategory; summary: string };
type Action = { title: string; detail: string };
type ExcerptsByTheme = Record<string, ThemeExcerpt[]>;

type ReviewRow = {
  id: string;
  authorName: string | null;
  rating: number;
  reviewText: string;
  reviewDate: string;
};

type ReportRow = {
  // periodStart/periodEnd are deliberately NOT in this type — they're
  // internal comparison anchors for the trend math and must never be
  // rendered (see lib/db/schema.pg.ts). Leaving them out means a future
  // edit can't accidentally reach for one.
  createdAt: string;
  executiveSummary: string;
  topPositiveThemesJson: string;
  topNegativeThemesJson: string;
  emergingIssuesJson: string;
  changesFromLastPeriodJson: string;
  recommendedActionsJson: string;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function ReportBody({
  businessName,
  report,
  sampleReviews,
  totalReviews,
  possiblyTruncated = false,
  excerptsByTheme = {},
  allReviewsHref,
}: {
  businessName: string;
  report: ReportRow;
  sampleReviews: ReviewRow[];
  // The business's full review count. Honest and genuinely useful under
  // the cumulative model ("covers all N reviews" is literally true); a
  // date range in its place was neither.
  totalReviews: number;
  // True when the connected Google source hit its import cap (see
  // OUTSCRAPER_REVIEWS_LIMIT, lib/reviews/outscraperProvider.ts) and the
  // practice likely has more reviews than totalReviews reflects. Never let
  // a truncated import present itself as complete — see the banner below.
  // Optional/defaulted so the public /sample-report page (which has no
  // real Google source to check) doesn't need to pass it.
  possiblyTruncated?: boolean;
  // Real, verbatim quotes per theme category. Optional and defaulted to {}
  // so this component keeps working unchanged for callers that don't pass
  // it (there are none left as of this change, but it keeps the type
  // backward-compatible).
  excerptsByTheme?: ExcerptsByTheme;
  // Only ever passed from the authenticated dashboard report page — the
  // public /sample-report page (also rendered by this component) must
  // never link to a dashboard route, so it simply omits this prop.
  allReviewsHref?: string;
}) {
  const topPositiveThemes: ThemeRef[] = JSON.parse(report.topPositiveThemesJson);
  const topNegativeThemes: ThemeRef[] = JSON.parse(report.topNegativeThemesJson);
  const emergingIssues: ThemeRef[] = JSON.parse(report.emergingIssuesJson);
  const changesFromLastPeriod: string[] = JSON.parse(report.changesFromLastPeriodJson);
  const recommendedActions: Action[] = JSON.parse(report.recommendedActionsJson);

  return (
    <article className="rounded-lg border border-slate-200 bg-white">
      <header className="border-b border-slate-200 px-8 py-8">
        {/* Not "Weekly" — there is no weekly cadence anymore (triggered
            alerts replaced it, see lib/alerts/reviewAlerts.ts), and calling
            it weekly sets an expectation nothing meets. */}
        <p className="text-xs font-medium uppercase tracking-wide text-teal-700">Notabl Review Report</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold text-slate-900">{businessName}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Last updated {formatLastUpdated(report.createdAt)} ·{" "}
          {possiblyTruncated ? "Covers your most recent" : "Covers all"} {totalReviews} review
          {totalReviews === 1 ? "" : "s"}
        </p>
        {possiblyTruncated && (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Your practice may have more reviews on Google than we imported — this report reflects the most recent
            {" "}
            {totalReviews}.
          </p>
        )}
      </header>

      <div className="space-y-10 px-8 py-8">
        <section>
          <h2 className="font-serif text-lg font-semibold text-slate-900">Executive Summary</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{report.executiveSummary}</p>
          <p className="mt-2 text-xs text-slate-400">
            AI interpretation, generated only from the verified statistics below — not from unreviewed raw text.
          </p>
        </section>

        <ThemeListSection
          title="Top Positive Themes"
          items={topPositiveThemes}
          accent="text-teal-800"
          barColor="border-teal-600"
          excerptsByTheme={excerptsByTheme}
        />
        <ThemeListSection
          title="Top Negative Themes"
          items={topNegativeThemes}
          accent="text-red-800"
          barColor="border-red-600"
          excerptsByTheme={excerptsByTheme}
        />
        <ThemeListSection
          title="Newly Emerging Issues"
          items={emergingIssues}
          accent="text-amber-800"
          barColor="border-amber-500"
          excerptsByTheme={excerptsByTheme}
        />

        <section>
          {/* This section describes something genuinely real — a comparison
              against the previous snapshot — so it stays. It just says
              "report," which a customer understands, rather than "period,"
              which describes nothing that exists under the cumulative model. */}
          <h2 className="font-serif text-lg font-semibold text-slate-900">What&apos;s Changed Since Your Last Report</h2>
          <p className="mt-1 text-xs text-slate-400">Calculated data — a direct comparison of theme mention counts against your last report.</p>
          {changesFromLastPeriod.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">No changes of 20% or more since your last report.</p>
          ) : (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {changesFromLastPeriod.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-slate-900">Recommended Actions</h2>
          <p className="mt-1 text-xs text-slate-400">AI interpretation — operational suggestions only, not medical or clinical advice.</p>
          <ol className="mt-3 space-y-3">
            {recommendedActions.map((a, i) => (
              <li key={i} className="flex gap-3">
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
        </section>

        <section>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-serif text-lg font-semibold text-slate-900">Important Reviews</h2>
            {allReviewsHref && (
              <Link href={allReviewsHref} className="text-xs font-medium text-teal-700 hover:text-teal-800">
                View all reviews →
              </Link>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Source review data — shown verbatim, unedited. A representative sample from your reviews, not a comprehensive list.
          </p>
          <div className="mt-3 space-y-3">
            {sampleReviews.map((r) => (
              <div key={r.id} className="rounded-md border border-slate-200 p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{r.authorName || "Anonymous"}</span>
                  <span>
                    {"★".repeat(r.rating)}
                    {"☆".repeat(5 - r.rating)} · {fmtDate(r.reviewDate)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{formatReviewText(r.reviewText)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </article>
  );
}

function ThemeListSection({
  title,
  items,
  accent,
  barColor,
  excerptsByTheme = {},
}: {
  title: string;
  items: ThemeRef[];
  accent: string;
  barColor: string;
  excerptsByTheme?: ExcerptsByTheme;
}) {
  return (
    <section>
      <h2 className={`font-serif text-lg font-semibold ${accent}`}>{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">None found.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((t) => (
            <div key={t.category} className={`border-l-2 ${barColor} pl-3`}>
              <p className="text-sm font-medium text-slate-800">{THEME_LABELS[t.category]}</p>
              <p className="text-sm text-slate-600">{t.summary}</p>
              <QuoteList quotes={excerptsByTheme[t.category]} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Real, verbatim patient quotes shown under a theme's summary — already
// validated as exact substrings of their source review at analysis time
// (lib/ai/validate.ts's sanitizeExtraction), so this only handles display.
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
