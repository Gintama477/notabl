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
  // Short, URL-safe identifier for the public review-request page
  // (app/r/[slug]) — see lib/reviews/slug.ts. Nullable so this migration
  // applies cleanly to existing rows; every business must end up with one
  // (backfilled by scripts/backfill-business-slugs.ts) since the Review
  // Requests feature hangs entirely off it.
  slug: text("slug").unique(),
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
    // "${provider.name}/${provider.promptVersion}" (see lib/ai/provider.ts)
    // at the moment this review was last analyzed — e.g.
    // "demo-provider/demo-v1" or "claude-sonnet/extract-v1/narrative-v3".
    // Lets runAnalysisForBusiness (lib/analysis/runAnalysis.ts) tell "never
    // analyzed" apart from "analyzed, but by an older/different provider or
    // prompt version" and re-analyze the latter automatically — e.g. when
    // ANTHROPIC_API_KEY gets set and the app switches from the keyword-
    // matching DemoProvider to real Claude. Null on existing rows means
    // "analyzed by something unknown, before this tracking existed," which
    // is correctly treated as stale (every one of those was the keyword
    // matcher) without a backfill migration.
    analyzedWith: text("analyzed_with"),
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
  // INTERNAL COMPARISON ANCHORS — NEVER RENDER THESE TO A CUSTOMER.
  //
  // Under the cumulative report model (see lib/analysis/runAnalysis.ts) a
  // report has no "reporting period": it always covers the business's full
  // review history, recalculated fresh. These two columns exist solely so
  // the trend math can compare "totals now" against "totals as of the last
  // report" — periodStart is the cutoff for that prior snapshot, nothing
  // more. They are not a date range the report covers, and describing them
  // as one to a customer ("Latest analysis period: ...", "full history
  // through 2026-08-20 (compared with the snapshot as of 2026-08-13)")
  // produced exactly the confusion this rule exists to prevent.
  //
  // The only date a customer ever sees about a report is createdAt, shown
  // as "Last updated" (see lib/reports/formatLastUpdated.ts). The table and
  // column names stay as-is on purpose — renaming them is a migration for
  // no customer benefit.
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
  // Column default matches the intended insert-time default in
  // createAccountWithDemoBusiness (lib/db/queries.ts) — "none" until Stripe
  // confirms real checkout completed. That function always passes status
  // explicitly, so this default is only a safety net for any future insert
  // that doesn't; it existing as "trialing" was the same bug in one more
  // place. NOTE: changing this TS default does not retroactively alter the
  // column default already applied to the live Postgres database — that
  // needs its own migration/ALTER TABLE, deliberately not run here.
  status: text("status").notNull().default("none"),
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

// ---------------------------------------------------------------------------
// Outreach (cold email to prospective, not-yet-customer practices)
// ---------------------------------------------------------------------------

// One row per prospective dental practice found via lib/outreach/findProspects.ts
// (Outscraper Maps Search — public business-listing info only, never review
// content). Status flow: drafted -> sent | demo_sent | skipped. See
// docs/OUTREACH-AUTOMATION.md for the full design, including the point-24
// ("no automated mass outreach") reasoning and the deliberate one-at-a-time,
// human-approves-before-send flow this table backs.
export const prospects = pgTable(
  "prospects",
  {
    id: id(),
    businessName: text("business_name").notNull(),
    website: text("website"),
    phone: text("phone"),
    city: text("city"),
    state: text("state"),
    googlePlaceId: text("google_place_id").notNull(),
    googleRating: doublePrecision("google_rating"),
    googleReviewCount: integer("google_review_count"),
    contactEmail: text("contact_email"),
    emailSubject: text("email_subject"),
    emailBody: text("email_body"),
    status: text("status").notNull().default("drafted"),
    sentAt: text("sent_at"),
    skipReason: text("skip_reason"),
    createdAt: createdAt(),
  },
  (t) => ({
    placeIdUnique: uniqueIndex("prospects_place_id_unique").on(t.googlePlaceId),
    statusIdx: index("prospects_status_idx").on(t.status, t.createdAt),
  })
);

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

// Human-review queue for the two "this might be someone else's business"
// situations (see docs on connectGoogleReviewSource's already-claimed check
// and createAccountWithDemoBusiness's duplicate-business check in
// lib/db/queries.ts): a self-serve Google-connect blocked because another
// account already claimed that Place ID, or a signup that looks like a
// duplicate of an existing business by name+city/state. Deliberately just a
// landing spot for a human to read and act on by hand — no automatic
// resolution, since telling apart "legitimate new ownership" from
// "someone connected a business they don't own" isn't a decision code
// should make.
export const supportAppeals = pgTable("support_appeals", {
  id: id(),
  accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
  businessId: text("business_id").references(() => businesses.id, { onDelete: "set null" }),
  appealType: text("appeal_type").notNull(), // "business_already_claimed" | "duplicate_business_signup"
  message: text("message").notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Review Requests (QR code / landing page feature)
// ---------------------------------------------------------------------------

// Anonymous private feedback submitted from a practice's public review-
// request page (app/r/[slug]) when a patient chooses "send private
// feedback" instead of "leave a public review" — see docs/PROJECT-HANDOFF.md
// and the Review Requests feature build for the full design rationale.
//
// This table has, and must never gain, a name/email/phone column (or any
// other patient-identifying field). The entire feature is deliberately
// built so that no patient-identifying information ever reaches Notabl's
// servers — adding one here would make Notabl a HIPAA business associate
// and trigger signed BAAs with every customer plus HIPAA-tier
// infrastructure obligations across Supabase, Vercel, Resend, and Twilio
// (~$1,300/month before the first customer). A future "let the practice
// follow up with this patient" request is a pricing-tier and legal
// conversation, not a schema change — don't quietly reintroduce it here.
export const patientFeedback = pgTable("patient_feedback", {
  id: id(),
  businessId: text("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  rating: integer("rating"), // 1-5, optional — no pre-screening question forces this
  message: text("message").notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// AI-Drafted Review Replies
// ---------------------------------------------------------------------------

// One drafted reply per review, generated on demand (never on ingest — see
// app/api/reviews/[id]/draft-reply/route.ts) and cached here so a second
// "Draft a reply" click on the same review returns the stored draft instead
// of paying for another AI call. draftText is deliberately generic by
// design (see lib/ai/prompts/draftReply.ts for the HIPAA reasoning) and
// validated to contain no reviewer name before it's ever written here (see
// lib/ai/draftReply.ts).
//
// Same rule as patient_feedback above: no patient-identifying column here,
// and none should ever be added. A drafted reply is about the REVIEW, not
// the reviewer — reviewId is the only link this table needs.
export const reviewReplies = pgTable("review_replies", {
  id: id(),
  reviewId: text("review_id")
    .notNull()
    .unique()
    .references(() => reviews.id, { onDelete: "cascade" }),
  draftText: text("draft_text").notNull(),
  createdAt: createdAt(),
});
