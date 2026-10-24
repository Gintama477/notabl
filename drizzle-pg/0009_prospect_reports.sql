-- Report-first outreach (24 Oct 2026): a real report built from the
-- prospect's own public Google reviews before the first email.
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "report_business_id" text;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "report_token" text;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "report_built_at" text;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "report_review_count" integer;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "report_view_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "report_first_viewed_at" text;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "followup_sent_at" text;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "reply_status" text;
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_report_token_unique" ON "prospects" ("report_token");
