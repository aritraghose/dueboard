CREATE TABLE "notes" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"local_date" date NOT NULL,
	"privacy" "privacy" NOT NULL,
	"share_to_live" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_body_length" CHECK (char_length("body") between 1 and 60)
);
--> statement-breakpoint
CREATE INDEX "notes_user_local_date_idx" ON "notes" ("user_id","local_date","created_at","id");