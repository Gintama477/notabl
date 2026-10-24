// Industry context for the AI prompts. The pipeline was written for dental
// practices ("patients", "clinical"); report-first outreach runs it on other
// local businesses too, where that wording is simply wrong. The analysis
// code sets the context once per business (runAnalysisForBusiness) and the
// prompt builders read it — no provider-interface change needed.
import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage<string>();

export function withIndustry<T>(industry: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  return storage.run(industry || "dental", fn);
}

export function currentIndustry(): string {
  return storage.getStore() || "dental";
}

import { industryWords as wordsFor, type IndustryWords } from "./industryWords";
export type { IndustryWords };

/** Wording for the industry in context (defaults to dental). */
export function industryWords(industry: string = currentIndustry()): IndustryWords {
  return wordsFor(industry);
}
