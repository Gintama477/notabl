CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"role" text DEFAULT 'owner' NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "analysis_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"run_type" text NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviews_analyzed_count" integer DEFAULT 0 NOT NULL,
	"ai_model_used" text,
	"prompt_version" text,
	"started_at" text,
	"completed_at" text,
	"error_message" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"business_id" text,
	"status" text NOT NULL,
	"detail" text,
	"created_at" text DEFAULT now() NOT NULL,
	"finished_at" text
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"industry" text DEFAULT 'dental' NOT NULL,
	"website" text,
	"address" text,
	"city" text,
	"state" text,
	"phone" text,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"weekly_report_id" text,
	"recipient_email" text NOT NULL,
	"email_type" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"resend_message_id" text,
	"sent_at" text,
	"opened_at" text,
	"error_message" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text,
	"business_id" text,
	"event_name" text NOT NULL,
	"properties_json" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text,
	"clarity_immediate" text,
	"most_useful_part" text,
	"confusing_part" text,
	"would_save_time" text,
	"would_use_weekly" text,
	"would_pay_49" text,
	"reasonable_price_if_not" text,
	"what_would_change_to_pay" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_url" text,
	"external_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"last_synced_at" text
);
--> statement-breakpoint
CREATE TABLE "review_theme_mentions" (
	"id" text PRIMARY KEY NOT NULL,
	"review_id" text NOT NULL,
	"analysis_run_id" text NOT NULL,
	"theme_category" text NOT NULL,
	"sentiment" text NOT NULL,
	"severity" text NOT NULL,
	"confidence" double precision DEFAULT 1 NOT NULL,
	"excerpt" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"review_source_id" text NOT NULL,
	"external_review_id" text,
	"author_name" text,
	"rating" integer NOT NULL,
	"review_text" text NOT NULL,
	"review_date" text NOT NULL,
	"is_demo_data" boolean DEFAULT true NOT NULL,
	"raw_payload_json" text,
	"analyzed_at" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"plan_id" text DEFAULT 'notabl_pro' NOT NULL,
	"status" text DEFAULT 'trialing' NOT NULL,
	"trial_ends_at" text,
	"current_period_end" text,
	"created_at" text DEFAULT now() NOT NULL,
	"canceled_at" text,
	"is_pilot" boolean DEFAULT false NOT NULL,
	CONSTRAINT "subscriptions_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "theme_rollups" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"analysis_run_id" text NOT NULL,
	"theme_category" text NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"mention_count" integer DEFAULT 0 NOT NULL,
	"positive_count" integer DEFAULT 0 NOT NULL,
	"negative_count" integer DEFAULT 0 NOT NULL,
	"neutral_count" integer DEFAULT 0 NOT NULL,
	"trend_direction" text DEFAULT 'flat' NOT NULL,
	"pct_change_vs_prior" double precision
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email" text NOT NULL,
	"auth_provider_id" text,
	"created_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "weekly_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"analysis_run_id" text NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"executive_summary" text NOT NULL,
	"top_positive_themes_json" text NOT NULL,
	"top_negative_themes_json" text NOT NULL,
	"emerging_issues_json" text NOT NULL,
	"changes_from_last_period_json" text NOT NULL,
	"recommended_actions_json" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_reports_analysis_run_id_unique" UNIQUE("analysis_run_id")
);
--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_weekly_report_id_weekly_reports_id_fk" FOREIGN KEY ("weekly_report_id") REFERENCES "public"."weekly_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_sources" ADD CONSTRAINT "review_sources_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_theme_mentions" ADD CONSTRAINT "review_theme_mentions_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_theme_mentions" ADD CONSTRAINT "review_theme_mentions_analysis_run_id_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_review_source_id_review_sources_id_fk" FOREIGN KEY ("review_source_id") REFERENCES "public"."review_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_rollups" ADD CONSTRAINT "theme_rollups_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_rollups" ADD CONSTRAINT "theme_rollups_analysis_run_id_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_analysis_run_id_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_name_created_idx" ON "events" USING btree ("event_name","created_at");--> statement-breakpoint
CREATE INDEX "rtm_review_idx" ON "review_theme_mentions" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "rtm_run_theme_idx" ON "review_theme_mentions" USING btree ("analysis_run_id","theme_category");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_source_external_unique" ON "reviews" USING btree ("review_source_id","external_review_id");--> statement-breakpoint
CREATE INDEX "reviews_business_date_idx" ON "reviews" USING btree ("business_id","review_date");--> statement-breakpoint
CREATE INDEX "theme_rollups_business_period_idx" ON "theme_rollups" USING btree ("business_id","period_start");