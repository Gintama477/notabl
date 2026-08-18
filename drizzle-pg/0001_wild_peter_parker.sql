CREATE TABLE "prospects" (
	"id" text PRIMARY KEY NOT NULL,
	"business_name" text NOT NULL,
	"website" text,
	"phone" text,
	"city" text,
	"state" text,
	"google_place_id" text NOT NULL,
	"google_rating" double precision,
	"google_review_count" integer,
	"contact_email" text,
	"email_subject" text,
	"email_body" text,
	"status" text DEFAULT 'drafted' NOT NULL,
	"sent_at" text,
	"skip_reason" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_appeals" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text,
	"business_id" text,
	"appeal_type" text NOT NULL,
	"message" text NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DEFAULT 'none';--> statement-breakpoint
ALTER TABLE "support_appeals" ADD CONSTRAINT "support_appeals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_appeals" ADD CONSTRAINT "support_appeals_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prospects_place_id_unique" ON "prospects" USING btree ("google_place_id");--> statement-breakpoint
CREATE INDEX "prospects_status_idx" ON "prospects" USING btree ("status","created_at");