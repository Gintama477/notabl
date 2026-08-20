CREATE TABLE "review_replies" (
	"id" text PRIMARY KEY NOT NULL,
	"review_id" text NOT NULL,
	"draft_text" text NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "review_replies_review_id_unique" UNIQUE("review_id")
);
--> statement-breakpoint
ALTER TABLE "review_replies" ADD CONSTRAINT "review_replies_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;