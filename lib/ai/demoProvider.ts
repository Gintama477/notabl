// Deterministic, free, no-API-key analyzer used whenever ANTHROPIC_API_KEY is
// not set (Phase 1 default, and useful in dev/test forever — see
// docs/ARCHITECTURE.md §18 cost control). It's a rule-based keyword matcher,
// not a toy that only works on the bundled demo dataset — it will produce a
// reasonable (if less nuanced than an LLM) structured extraction on any
// English review text. This keeps the rest of the pipeline (validation,
// rollups, report generation) fully exercised without spending money or
// requiring credentials.

import { ThemeCategory, Sentiment, Severity } from "@/config/themes";
import { ReviewExtraction, WeeklyNarrative } from "./validate";

type KeywordRule = {
  category: ThemeCategory;
  positive: string[];
  negative: string[];
};

const KEYWORD_RULES: KeywordRule[] = [
  {
    category: "staff_friendliness",
    positive: ["friendly", "welcoming", "smile", "warm", "kind", "personable", "patient with"],
    negative: ["rude", "unfriendly", "dismissive", "cold staff"],
  },
  {
    category: "scheduling",
    positive: ["easy to book", "scheduled quickly", "on time"],
    negative: ["reschedule", "overbook", "scheduled", "appointment was delayed", "third time in a row", "falling behind"],
  },
  {
    category: "waiting_time",
    positive: ["seen right away", "no wait"],
    negative: ["waited", "wait", "waiting", "45 minutes", "an hour", "delay", "delayed", "sat for"],
  },
  {
    category: "cleanliness",
    positive: ["clean", "spotless", "sanitized", "immaculate", "modern", "bright"],
    negative: ["dirty", "messy", "unclean", "outdated and dirty"],
  },
  {
    category: "communication",
    positive: ["kept me informed", "communicated well", "called me back"],
    negative: ["no one picked up", "couldn't reach", "impossible to reach", "voicemail", "never got a callback", "phone lines"],
  },
  {
    category: "billing",
    positive: ["billing was clear", "transparent pricing"],
    negative: ["billing", "confusing", "extra charges", "insurance billing", "quoted", "costs before"],
  },
  {
    category: "treatment_experience",
    positive: ["painless", "gentle", "thorough", "smoothly", "barely felt"],
    negative: ["painful", "rushed procedure", "rough"],
  },
  {
    category: "parking_accessibility",
    positive: ["easy parking", "plenty of parking"],
    negative: ["parking", "parking lot", "park two blocks", "limited parking"],
  },
  {
    category: "office_environment",
    positive: ["comfortable office", "cozy", "nice atmosphere"],
    negative: ["cramped", "outdated office", "uncomfortable waiting room"],
  },
  {
    category: "professionalism",
    positive: ["professional", "knowledgeable", "trust", "expert"],
    negative: ["unprofessional", "careless", "sloppy"],
  },
];

const HIGH_SEVERITY_CUES = ["again", "third time", "never", "impossible", "always", "every visit", "no one"];

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function findVerbatimExcerpt(sentence: string, sourceText: string): string | null {
  // sentence is already a substring of sourceText by construction (we split
  // sourceText itself), but trim to a reasonable excerpt length.
  const trimmed = sentence.length > 160 ? sentence.slice(0, 157) + "..." : sentence;
  return sourceText.includes(sentence) ? trimmed : null;
}

export async function demoAnalyzeReview(reviewText: string, rating: number): Promise<ReviewExtraction> {
  const overallSentiment: Sentiment = rating >= 4 ? "positive" : rating === 3 ? "neutral" : "negative";
  const sentences = splitSentences(reviewText);

  const themeMap = new Map<ThemeCategory, { sentiment: Sentiment; severity: Severity; excerpt: string | null; confidence: number }>();

  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase();
    for (const rule of KEYWORD_RULES) {
      const hitPositive = rule.positive.some((kw) => lowerSentence.includes(kw));
      const hitNegative = rule.negative.some((kw) => lowerSentence.includes(kw));
      if (!hitPositive && !hitNegative) continue;

      const sentiment: Sentiment = hitNegative && !hitPositive ? "negative" : hitPositive && !hitNegative ? "positive" : overallSentiment;
      const hasHighSeverityCue = HIGH_SEVERITY_CUES.some((cue) => lowerSentence.includes(cue));
      const severity: Severity = sentiment === "negative" ? (hasHighSeverityCue ? "high" : rating <= 2 ? "medium" : "low") : "low";
      const excerpt = findVerbatimExcerpt(sentence, reviewText);

      // Keep the strongest signal per category if it appears more than once.
      const existing = themeMap.get(rule.category);
      if (!existing || (severity === "high" && existing.severity !== "high")) {
        themeMap.set(rule.category, { sentiment, severity, excerpt, confidence: 0.75 });
      }
    }
  }

  // Fallback: if nothing matched but the review is short praise/complaint,
  // don't force a theme — an empty themes array is a valid, honest output.
  const themes = Array.from(themeMap.entries()).map(([category, v]) => ({
    category,
    sentiment: v.sentiment,
    severity: v.severity,
    confidence: v.confidence,
    excerpt: v.excerpt,
  }));

  return {
    sentiment: overallSentiment,
    themes: themes.slice(0, 6),
  };
}

// Specific, operational next-step per theme category — deliberately concrete
// ("review front-desk call handling") rather than generic ("improve
// communication"), per the requirement that recommendations must be
// actionable, not vague filler like "continue providing excellent service."
const ACTION_SUGGESTIONS: Record<ThemeCategory, string> = {
  staff_friendliness: "Review recent front-desk and clinical staff interactions with the team.",
  scheduling: "Review appointment scheduling procedures and confirm double-booking or rescheduling isn't slipping.",
  waiting_time: "Review how patients are triaged and seated, and whether appointment slots are running long.",
  cleanliness: "Review facility cleaning checklists and schedules with your office manager.",
  communication: "Review front-desk call handling and missed-call procedures.",
  billing: "Review how billing and insurance costs are explained to patients before treatment.",
  treatment_experience: "Review how procedures are explained and paced for patients — this is about the patient experience, not clinical technique.",
  parking_accessibility: "Review parking availability and signage near the office.",
  office_environment: "Review the waiting room and office layout for comfort issues.",
  professionalism: "Review recent patient interactions for tone and consistency with the team.",
};

function actionSuggestionFor(category: ThemeCategory): string {
  return ACTION_SUGGESTIONS[category];
}

/**
 * Deterministic narrative generator mirroring what the Claude narrative
 * prompt would do: turn a structured rollup into plain-language sections.
 * Template-based (no AI call, $0 cost) but obeys the exact same constraint —
 * it only ever describes categories/numbers present in the input rollup.
 */
export async function demoGenerateNarrative(structuredRollupJson: string, businessName: string): Promise<WeeklyNarrative> {
  const rollup = JSON.parse(structuredRollupJson) as {
    themes: {
      category: ThemeCategory;
      mentionCount: number;
      positiveCount: number;
      negativeCount: number;
      priorMentionCount: number;
      priorPositiveCount: number;
      priorNegativeCount: number;
      trendDirection: string;
      pctChangeVsPrior: number | null;
    }[];
    totalReviews: number;
  };

  const { THEME_LABELS } = await import("@/config/themes");

  const positiveSorted = rollup.themes
    .filter((t) => t.positiveCount > t.negativeCount && t.positiveCount > 0)
    .sort((a, b) => b.positiveCount - a.positiveCount);
  const positiveThemes = positiveSorted.slice(0, 4);

  const negativeThemes = rollup.themes
    .filter((t) => t.negativeCount > 0 && t.negativeCount >= t.positiveCount)
    .sort((a, b) => b.negativeCount - a.negativeCount)
    .slice(0, 4);

  // trendDirection === "new" alone isn't enough — that's true of any theme
  // with zero mentions one period ago, regardless of sentiment, and this
  // list feeds "Emerging Issues" and "Recommended Actions" (both implicitly
  // framed as problems to look into). Without the same negativeCount filter
  // negativeThemes uses just above, a newly-appearing POSITIVE theme (e.g.
  // overwhelming praise for professionalism that just started showing up)
  // gets told to the owner as something to "investigate... before it
  // becomes a pattern," which is backwards. A newly-emerging positive theme
  // is still worth surfacing — it belongs in topPositiveThemes/Opportunities
  // (computed separately above), never here.
  const emerging = rollup.themes
    .filter((t) => t.trendDirection === "new" && t.negativeCount > 0 && t.negativeCount >= t.positiveCount)
    .slice(0, 5);
  const worsening = rollup.themes.filter((t) => t.trendDirection === "increasing" && t.negativeCount > 0);

  // "this period"/"this week" reads as a narrow, recent slice of time — but
  // under the cumulative report model these counts are totals across the
  // business's ENTIRE review history to date, computed fresh each run (see
  // lib/analysis/runAnalysis.ts). Paired on the same dashboard with "New
  // Reviews This Week" (genuinely narrow), "86 this period" next to "0 new
  // this week" reads as a contradiction when it isn't one. "total"/
  // "overall" for a raw cumulative count, "since your last report" for an
  // actual before/after comparison — never "period," which is the
  // ambiguous word here.
  const topPositiveThemes = positiveThemes.map((t) => ({
    category: t.category,
    summary: `${THEME_LABELS[t.category]} continues to receive positive mentions (${t.positiveCount} total).`,
  }));

  // Strictly the positives BEYOND the ones topPositiveThemes takes, so the
  // two lists can never overlap. Sliced from positiveSorted at exactly the
  // index topPositiveThemes stops at — not a hardcoded 2, which is the bug
  // the previous component version shipped with: it sliced from index 2 on
  // the assumption that "the top 2 already show in What Patients Love",
  // while topPositiveThemes actually takes four. Opportunities therefore
  // repeated the 3rd and 4th strongest themes verbatim from the card
  // beside it. The live provider avoids this by being instructed not to
  // repeat a category (lib/ai/prompts/generateNarrative.ts); this stays
  // templated on purpose — fallback output for demo data, never what a
  // paying account sees — but returns the identical shape so the two paths
  // can't diverge structurally.
  const opportunities = positiveSorted.slice(positiveThemes.length, positiveThemes.length + 3).map((t) => ({
    category: t.category,
    summary: `${THEME_LABELS[t.category]} has ${t.positiveCount} positive mention${t.positiveCount === 1 ? "" : "s"} overall but isn't among the top strengths — an under-used angle worth drawing attention to.`,
  }));

  const topNegativeThemes = negativeThemes.map((t) => ({
    category: t.category,
    summary: `${THEME_LABELS[t.category]} has been mentioned negatively ${t.negativeCount} time${t.negativeCount === 1 ? "" : "s"} overall.`,
  }));

  const emergingIssues = emerging.map((t) => ({
    category: t.category,
    // "new" already conveys the timing correctly on its own — no need for
    // "this period" alongside it.
    summary: `${THEME_LABELS[t.category]} is a newly appearing theme, with ${t.mentionCount} mention${t.mentionCount === 1 ? "" : "s"} so far.`,
  }));

  const changesFromLastPeriod = rollup.themes
    .filter((t) => t.pctChangeVsPrior !== null && Math.abs(t.pctChangeVsPrior ?? 0) >= 20)
    .sort((a, b) => Math.abs(b.pctChangeVsPrior ?? 0) - Math.abs(a.pctChangeVsPrior ?? 0))
    .slice(0, 6)
    .map((t) => {
      const direction = (t.pctChangeVsPrior ?? 0) > 0 ? "increased" : "decreased";
      return `${THEME_LABELS[t.category]} mentions ${direction} ${Math.abs(Math.round(t.pctChangeVsPrior ?? 0))}% since your last report.`;
    });

  const recommendedActions = [
    ...worsening.slice(0, 2).map((t) => ({
      title: `Review ${THEME_LABELS[t.category].toLowerCase()}`,
      detail: `${THEME_LABELS[t.category]} complaints increased from ${t.priorNegativeCount} mention${t.priorNegativeCount === 1 ? "" : "s"} to ${t.negativeCount} mention${t.negativeCount === 1 ? "" : "s"}. ${actionSuggestionFor(t.category)}`,
    })),
    ...emerging.slice(0, 2).map((t) => ({
      title: `Investigate new ${THEME_LABELS[t.category].toLowerCase()} feedback`,
      detail: `This is a newly appearing theme (${t.mentionCount} mention${t.mentionCount === 1 ? "" : "s"}, none before your last report) — worth a look.`,
    })),
  ].slice(0, 5);

  const topIssue = negativeThemes[0];
  const topPositive = positiveThemes[0];
  const summaryParts: string[] = [];
  summaryParts.push(
    `This report covers all ${rollup.totalReviews} review${rollup.totalReviews === 1 ? "" : "s"} for ${businessName}.`
  );
  if (topPositive) {
    summaryParts.push(`${THEME_LABELS[topPositive.category]} remains a consistent strength, mentioned positively ${topPositive.positiveCount} times overall.`);
  }
  if (topIssue) {
    summaryParts.push(`The most notable area for attention is ${THEME_LABELS[topIssue.category].toLowerCase()}, mentioned negatively ${topIssue.negativeCount} times overall.`);
  }
  if (worsening.length > 0) {
    summaryParts.push(`${THEME_LABELS[worsening[0].category]} shows an increasing trend since your last report and is worth monitoring closely.`);
  }
  if (emerging.length > 0) {
    summaryParts.push(`${THEME_LABELS[emerging[0].category]} is a newly appearing topic that didn't show up before your last report.`);
  }

  return {
    executiveSummary: summaryParts.join(" "),
    topPositiveThemes,
    topNegativeThemes,
    emergingIssues,
    opportunities,
    changesFromLastPeriod,
    recommendedActions: recommendedActions.length > 0 ? recommendedActions : [
      { title: "Keep up current practices", detail: "No significant negative trends were detected. Continue current operations." },
    ],
  };
}

// Deterministic, $0-cost reply drafts — same rating-only branching a real
// provider would land on, and follows every rule in
// lib/ai/prompts/draftReply.ts (no patient confirmation, no treatment
// detail, no reviewer name, no dispute) by construction, since neither
// template ever looks at the review text or author name at all. Exercises
// the whole "Draft a reply" pipeline (route, validation, storage) with zero
// API cost when no ANTHROPIC_API_KEY is configured.
const DEMO_REPLY_POSITIVE =
  "Thank you for taking the time to share your feedback. Our team is committed to providing a welcoming, high-quality experience for everyone, and we appreciate hearing from you.";
const DEMO_REPLY_NEGATIVE =
  "Thank you for sharing your feedback. We take all feedback seriously and would welcome the chance to discuss this further — please reach out to our office directly.";

export async function demoDraftReply(rating: number): Promise<string> {
  return rating <= 3 ? DEMO_REPLY_NEGATIVE : DEMO_REPLY_POSITIVE;
}
