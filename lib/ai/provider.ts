// The one seam between "app logic" and "which AI backend is running."
// Everything else in the app calls analyzeReview()/generateNarrative() from
// lib/ai/extractReview.ts and lib/ai/generateReportNarrative.ts, which in
// turn call whichever provider is active here. Swapping demo -> live Claude
// is a config change (set ANTHROPIC_API_KEY), not a code change.

import Anthropic from "@anthropic-ai/sdk";
import { ReviewExtraction, ReviewExtractionSchema, WeeklyNarrative, WeeklyNarrativeSchema, DraftReplySchema } from "./validate";
import { buildExtractReviewPrompt, EXTRACT_REVIEW_PROMPT_VERSION } from "./prompts/extractReview";
import { buildNarrativePrompt, GENERATE_NARRATIVE_PROMPT_VERSION } from "./prompts/generateNarrative";
import { buildDraftReplyPrompt } from "./prompts/draftReply";
import { demoAnalyzeReview, demoGenerateNarrative, demoDraftReply } from "./demoProvider";

export interface AIProvider {
  name: string;
  promptVersion: string;
  analyzeReview(reviewText: string, rating: number): Promise<ReviewExtraction>;
  generateNarrative(structuredRollupJson: string, businessName: string): Promise<WeeklyNarrative>;
  draftReply(reviewText: string, rating: number, businessName: string): Promise<string>;
}

class ClaudeProvider implements AIProvider {
  name = "claude-sonnet";
  promptVersion = `${EXTRACT_REVIEW_PROMPT_VERSION}/${GENERATE_NARRATIVE_PROMPT_VERSION}`;
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  private async callJson(prompt: string): Promise<unknown> {
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
