// Fixed theme-category enum shared by the AI extraction prompt, the Zod
// validator, and the dashboard UI. The AI is constrained to these categories
// only — it cannot invent a new one. Add a category here (and to the prompt
// in lib/ai/prompts/) if you want to expand coverage; do it in one place.

export const THEME_CATEGORIES = [
  "staff_friendliness",
  "scheduling",
  "waiting_time",
  "cleanliness",
  "communication",
  "billing",
  "treatment_experience",
  "parking_accessibility",
  "office_environment",
  "professionalism",
] as const;

export type ThemeCategory = (typeof THEME_CATEGORIES)[number];

export const THEME_LABELS: Record<ThemeCategory, string> = {
  staff_friendliness: "Staff Friendliness",
  scheduling: "Scheduling",
  waiting_time: "Waiting Time",
  cleanliness: "Cleanliness",
  communication: "Communication",
  billing: "Billing",
  treatment_experience: "Treatment Experience",
  parking_accessibility: "Parking / Accessibility",
  office_environment: "Office Environment",
  professionalism: "Professionalism",
};

export const SENTIMENTS = ["positive", "neutral", "negative"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const SEVERITIES = ["low", "medium", "high"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const TREND_DIRECTIONS = ["increasing", "decreasing", "flat", "new"] as const;
export type TrendDirection = (typeof TREND_DIRECTIONS)[number];
