CREATE TABLE "patient_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"rating" integer,
	"message" text NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "patient_feedback" ADD CONSTRAINT "patient_feedback_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_slug_unique" UNIQUE("slug");