CREATE TYPE "ai_usage_reason" AS ENUM('tibo_reply', 'tibo_proactive', 'relay', 'ask_answer');--> statement-breakpoint
CREATE TABLE "ai_usage_events" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"units" integer NOT NULL,
	"reason" "ai_usage_reason" NOT NULL,
	"ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_events_units" CHECK ("units" > 0)
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"user_id" text,
	"period" text,
	"units" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_pkey" PRIMARY KEY("user_id","period"),
	CONSTRAINT "ai_usage_units" CHECK ("units" >= 0)
);
--> statement-breakpoint
CREATE INDEX "ai_usage_events_user_created_idx" ON "ai_usage_events" ("user_id","created_at");