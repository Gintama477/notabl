// The one seam between "app logic" and "which AI backend is running."
// Everything else in the app calls analyzeReview()/generateNarrative() from
// lib/ai/extractReview.ts and lib/ai/generateReportNarrative.ts, which in
// turn call whichever provider is active here. Swapping demo -> live Claude
// is a config change (set ANTHROPIC_API_KEY), not a code change.

import Anthropic from "@anthropic-ai/sdk";
import { ReviewExtraction, ReviewExtractionSchema, WeeklyNarrative, WeeklyNarrativeSchema, DraftReplySchema } from "./validate";
import { buildExtractReviewPrompt, EXTRACT_REVIEW_PROMPT_VERSION } from "./prompts/extractReview";
import { buildNarrativePrompt } from "./prompts/generateNarrative";
import { buildDraftReplyPrompt } from "./prompts/draftReply";
import { demoAnalyzeReview, demoGenerateNarrative, demoDraftReply } from "./demoProvider";

export interface AIProvider {
  name: string;
  // EXTRACTION version ONLY — this is what gets stored per review as
  // reviews.analyzedWith, and runAnalysis.ts re-extracts every review whose
  // stored value doesn't match. It must therefore reflect ONLY what
  // actually determines a review's extracted themes.
  //
  // This used to be `${EXTRACT}/${NARRATIVE}`, which meant a change to how
  // the summary PARAGRAPHS are worded invalidated all 200 reviews'
  // extractions and ordered a full, expensive re-analysis of the entire
  // history — ~200 seconds of API calls against a 45s per-run budget, so
  // it never finished (production got 12 reviews in and stalled there for
  // days). Extraction and narration are independent: changing one must
  // never invalidate the other. See GENERATE_NARRATIVE_PROMPT_VERSION's
  // own comment in lib/ai/prompts/generateNarrative.ts, and the
  // narrativeVersion column on weeklyReports which is what tracks the
  // narrative side instead.
  promptVersion: string;
  analyzeReview(reviewText: string, rating: number): Promise<ReviewExtraction>;
  generateNarrative(structuredRollupJson: string, businessName: string): Promise<WeeklyNarrative>;
  draftReply(reviewText: string, rating: number, businessName: string): Promise<string>;
}

class ClaudeProvider implements AIProvider {
  name = "claude-sonnet";
  promptVersion = EXTRACT_REVIEW_PROMPT_VERSION;
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  private async callOnce(prompt: string): Promise<unknown> {
    const msg = await this.client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI response did not contain JSON");
    return JSON.parse(match[0]);
  }

  // A 429 (Anthropic.RateLimitError) means we're calling faster than the
  // account's per-minute limit allows — expected to happen occasionally
  // now that lib/analysis/runAnalysis.ts's extraction loop fires several
  // of these concurrently instead of one at a time. A short fixed delay
  // then a single retry rides out a transient limit instead of failing
  // the review outright; extractReviewThemes's own blind retry-once
  // (lib/ai/extractReview.ts) has no delay and isn't 429-aware, so it
  // wouldn't reliably help here on its own. If 429s persist even with
  // this, the fix is a lower BATCH_SIZE in runAnalysis.ts, not a longer
  // delay here.
  private async callJson(prompt: string): Promise<unknown> {
    try {
      return await this.callOnce(prompt);
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return await this.callOnce(prompt);
      }
      throw err;
    }
  }

  async analyzeReview(reviewText: string, rating: number): Promise<ReviewExtraction> {
    const raw = await this.callJson(buildExtractReviewPrompt(reviewText, rating));
    return ReviewExtractionSchema.parse(raw);
  }

  async generateNarrative(structuredRollupJson: string, businessName: string): Promise<WeeklyNarrative> {
    const raw = await this.callJson(buildNarrativePrompt(structuredRollupJson, businessName));
    return WeeklyNarrativeSchema.parse(raw);
  }

  async draftReply(reviewText: string, rating: number, businessName: string): Promise<string> {
    const raw = await this.callJson(buildDraftReplyPrompt(reviewText, rating, businessName));
    return DraftReplySchema.parse(raw).reply;
  }
}

class DemoProvider implements AIProvider {
  name = "demo-provider";
  promptVersion = "demo-v1";

  async analyzeReview(reviewText: string, rating: number): Promise<ReviewExtraction> {
    return demoAnalyzeReview(reviewText, rating);
  }

  async generateNarrative(structuredRollupJson: string, businessName: string): Promise<WeeklyNarrative> {
    return demoGenerateNarrative(structuredRollupJson, businessName);
  }

  async draftReply(_reviewText: string, rating: number, _businessName: string): Promise<string> {
    return demoDraftReply(rating);
  }
}

let cachedProvider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (cachedProvider) return cachedProvider;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  cachedProvider = apiKey ? new ClaudeProvider(apiKey) : new DemoProvider();
  return cachedProvider;
}

export function isLiveAIEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
