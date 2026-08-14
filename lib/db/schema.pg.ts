// Postgres port of lib/db/schema.ts — same tables, same columns, same
// relationships, translated to pg-core. Written and validated (via
// `drizzle-kit push` against a real local Postgres 16 instance — see
// docs/DEPLOYMENT.md "Postgres migration, already written and tested") so
// the eventual cutover to a hosted Postgres (Supabase or similar) is a
// config change, not a design question.
//
// Deliberately keeps every date/time column as `text` (ISO-8601 strings),
// exactly like schema.ts, instead of Postgres's native `timestamp` type.
// The whole app already treats these as strings end to end (`new
// Date().toISOString()` in, `new Date(value)` out) — switching to a native
// timestamp type would change what `db.select()` hands back (a JS Date
// object instead of a string) and risk subtly breaking code that wasn't
// written expecting that. Same reasoning as the "driver swap, not a
// rewrite" comment in schema.ts: keep the data model identical, change only
// what genuinely has to change for Postgres (booleans, floating point).
//
// NOT currently wired into the running app — lib/db/client.ts still points
// at ./schema (SQLite) for zero-setup local dev. This file becomes live the
// moment DATABASE_URL is set and lib/db/client.ts is switched to import
// from here instead; see docs/DEPLOYMENT.md for the exact steps.
//
// Keep this in sync with schema.ts by hand if either changes — there are no
// generated migrations shared between the two, they're independent DDL for
// the same logical model.

import {
  pgTable,
  text,
  integer,
  doublePrecision,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () => text("created_at").notNull().default(sql`now()`);

// ---------------------------------------------------------------------------
// Accounts & Users
// ---------------------------------------------------------------------------

export const accounts = pgTable("accounts", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("owner"),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  authProviderId: text("auth_provider_id"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Businesses
// ---------------------------------------------------------------------------

export const businesses = pgTable("businesses", {
  id: id(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  industry: text("industry").notNull().default("dental"),
  website: text("website"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  phone: text("phone"),
  timezone: text("timezone").notNull().default("America/New_York"),
  createdAt: createdAt(),
});

export const reviewSources = pgTable("review_sources", {
  id: id(),
  businessId: text("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  sourceUrl: text("source_url"),
  externalId: text("external_id"),
  status: text("status").notNull().default("active"),
  connectedAt: createdAt(),
  lastSyncedAt: text("last_synced_at"),
});

// ---------------------------------------------------------------------------
// Reviews & AI Analysis
// ---------------------------------------------------------------------------

export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    reviewSourceId: text("review_source_id")
      .notNull()
      .references(() => reviewSources.id, { onDelete: "cascade" }),
    externalReviewId: text("external_review_id"),
    authorName: text("author_name"),
    rating: integer("rating").notNull(),
    reviewText: text("review_text").notNull(),
    reviewDate: text("review_date").notNull(),
    isDemoData: boolean("is_demo_data").notNull().default(true),
    rawPayloadJson: text("raw_payload_json"),
    analyzedAt: text("analyzed_at"),
    createdAt: createdAt(),
  },
  (t) => ({
    sourceExternalUnique: uniqueIndex("reviews_source_external_unique").on(
      t.reviewSourceId,
      t.externalReviewId
    ),
    businessDateIdx: index("reviews_business_date_idx").on(t.businessId, t.reviewDate),
  })
);

export const analysisRuns = pgTable("analysis_runs", {
  id: id(),
  businessId: text("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  runType: text("run_type").notNull(),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  status: text("status").notNull().default("pending"),
  reviewsAnalyzedCount: integer("reviews_analyzed_count").notNull().default(0),
  aiModelUsed: text("ai_model_used"),
  promptVersion: text("prompt_version"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  errorMessage: text("error_message"),
  createdAt: createdAt(),
});

export const reviewThemeMentions = pgTable(
  "review_theme_mentions",
  {
    id: id(),
    reviewId: text("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    analysisRunId: text("analysis_run_id")
      .notNull()
      .references(() => analysisRuns.id, { onDelete: "cascade" }),
    themeCategory: text("theme_category").notNull(),
    sentiment: text("sentiment").notNull(),
    severity: text("severity").notNull(),
    confidence: doublePrecision("confidence").notNull().default(1.0),
    excerpt: text("excerpt"),
    createdAt: createdAt(),
  },
  (t) => ({
    reviewIdx: index("rtm_review_idx").on(t.reviewId),
    runThemeIdx: index("rtm_run_theme_idx").on(t.analysisRunId, t.themeCategory),
  })
);

export const themeRollups = pgTable(
  "theme_rollups",
  {
    id: id(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    analysisRunId: text("analysis_run_id")
      .notNull()
      .references(() => analysisRuns.id, { onDelete: "cascade" }),
    themeCategory: text("theme_category").notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    mentionCount: integer("mention_count").notNull().default(0),
    positiveCount: integer("positive_count").notNull().default(0),
    negativeCount: integer("negative_count").notNull().default(0),
    neutralCount: integer("neutral_count").notNull().default(0),
    trendDirection: text("trend_direction").notNull().default("flat"),
    pctChangeVsPrior: doublePrecision("pct_change_vs_prior"),
  },
  (t) => ({
    businessPeriodIdx: index("theme_rollups_business_period_idx").on(t.businessId, t.periodStart),
  })
);

// ---------------------------------------------------------------------------
// Weekly Reports & Email
// ---------------------------------------------------------------------------

export const weeklyReports = pgTable("weekly_reports", {
  id: id(),
  businessId: text("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  analysisRunId: text("analysis_run_id")
    .notNull()
    .unique()
    .references(() => analysisRuns.id, { onDelete: "cascade" }),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  executiveSummary: text("executive_summary").notNull(),
  topPositiveThemesJson: text("top_positive_themes_json").notNull(),
  topNegativeThemesJson: text("top_negative_themes_json").notNull(),
  emergingIssuesJson: text("emerging_issues_json").notNull(),
  changesFromLastPeriodJson: text("changes_from_last_period_json").notNull(),
  recommendedActionsJson: text("recommended_actions_json").notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: createdAt(),
});

export const emailDeliveries = pgTable("email_deliveries", {
  id: id(),
  businessId: text("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  weeklyReportId: text("weekly_report_id").references(() => weeklyReports.id, {
    onDelete: "set null",
  }),
  recipientEmail: text("recipient_email").notNull(),
  emailType: text("email_type").notNull(),
  status: text("status").notNull().default("queued"),
  resendMessageId: text("resend_message_id"),
  sentAt: text("sent_at"),
  openedAt: text("opened_at"),
  errorMessage: text("error_message"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export const subscriptions = pgTable("subscriptions", {
  id: id(),
  accountId: text("account_id")
    .notNull()
    .unique()
    .references(() => accounts.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  planId: text("plan_id").notNull().default("notabl_pro"),
  status: text("status").notNull().default("trialing"),
  trialEndsAt: text("trial_ends_at"),
  currentPeriodEnd: text("current_period_end"),
  createdAt: createdAt(),
  canceledAt: text("canceled_at"),
  isPilot: boolean("is_pilot").notNull().default(false),
});

// ---------------------------------------------------------------------------
// Analytics & Ops
// ---------------------------------------------------------------------------

export const events = pgTable(
  "events",
  {
    id: id(),
    accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
    businessId: text("business_id").references(() => businesses.id, { onDelete: "set null" }),
    eventName: text("event_name").notNull(),
    propertiesJson: text("properties_json"),
    createdAt: createdAt(),
  },
  (t) => ({
    nameCreatedIdx: index("events_name_created_idx").on(t.eventName, t.createdAt),
  })
);

export const automationLogs = pgTable("automation_logs", {
  id: id(),
  jobName: text("job_name").notNull(),
  businessId: text("business_id").references(() => businesses.id, { onDelete: "set null" }),
  status: text("status").notNull(),
  detail: text("detail"),
  startedAt: createdAt(),
  finishedAt: text("finished_at"),
});

export const feedback = pgTable("feedback", {
  id: id(),
  accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
  clarityImmediate: text("clarity_immediate"),
  mostUsefulPart: text("most_useful_part"),
  confusingPart: text("confusing_part"),
  wouldSaveTime: text("would_save_time"),
  wouldUseWeekly: text("would_use_weekly"),
  wouldPay49: text("would_pay_49"),
  reasonablePriceIfNot: text("reasonable_price_if_not"),
  whatWouldChangeToPay: text("what_would_change_to_pay"),
  createdAt: createdAt(),
});
