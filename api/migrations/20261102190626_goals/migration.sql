CREATE TYPE "goal_link_item" AS ENUM('habit', 'task');--> statement-breakpoint
CREATE TYPE "goal_progress_mode" AS ENUM('slider', 'count');--> statement-breakpoint
CREATE TYPE "goal_progress_source" AS ENUM('manual', 'habit', 'task');--> statement-breakpoint
CREATE TYPE "goal_status" AS ENUM('active', 'paused', 'completed');--> statement-breakpoint
CREATE TABLE "goal_links" (
	"id" text PRIMARY KEY,
	"goal_id" text NOT NULL,
	"user_id" text NOT NULL,
	"item_type" "goal_link_item" NOT NULL,
	"item_id" text NOT NULL,
	"amount" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_links_amount_range" CHECK ("amount" between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "goal_progress_events" (
	"id" text PRIMARY KEY,
	"goal_id" text NOT NULL,
	"user_id" text NOT NULL,
	"delta" numeric(12,2) NOT NULL,
	"value_after" numeric(12,2) NOT NULL,
	"source" "goal_progress_source" NOT NULL,
	"source_id" text,
	"source_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_progress_events_delta" CHECK ("delta" <> 0),
	CONSTRAINT "goal_progress_events_source_id" CHECK (("source" = 'manual') = ("source_id" is null))
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"progress_mode" "goal_progress_mode" NOT NULL,
	"progress_percent" numeric(5,2) DEFAULT '0' NOT NULL,
	"target_count" integer,
	"current_count" integer,
	"target_date" date,
	"status" "goal_status" DEFAULT 'active'::"goal_status" NOT NULL,
	"completed_at" timestamp with time zone,
	"privacy" "privacy" NOT NULL,
	"share_to_live" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_name_length" CHECK (char_length("name") between 1 and 200),
	CONSTRAINT "goals_description_length" CHECK (char_length("description") <= 2000),
	CONSTRAINT "goals_percent_range" CHECK ("progress_percent" between 0 and 100),
	CONSTRAINT "goals_progress_shape" CHECK (("progress_mode" = 'slider' and "target_count" is null and "current_count" is null)
        or ("progress_mode" = 'count'
          and "target_count" between 1 and 1000000
          and "current_count" between 0 and 1000000)),
	CONSTRAINT "goals_completed_at" CHECK (("status" = 'completed') = ("completed_at" is not null)),
	CONSTRAINT "goals_completed_reached" CHECK ("status" <> 'completed' or (case "progress_mode"
        when 'slider' then "progress_percent" = 100
        else "current_count" >= "target_count" end))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "goal_links_goal_item_idx" ON "goal_links" ("goal_id","item_type","item_id");--> statement-breakpoint
CREATE INDEX "goal_links_user_item_idx" ON "goal_links" ("user_id","item_type","item_id");--> statement-breakpoint
CREATE INDEX "goal_progress_events_goal_idx" ON "goal_progress_events" ("goal_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "goal_progress_events_source_idx" ON "goal_progress_events" ("goal_id","source","source_id");--> statement-breakpoint
CREATE INDEX "goal_progress_events_user_idx" ON "goal_progress_events" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "goals_user_status_idx" ON "goals" ("user_id","status");--> statement-breakpoint
CREATE INDEX "goals_user_created_idx" ON "goals" ("user_id","created_at","id");--> statement-breakpoint
ALTER TABLE "goal_links" ADD CONSTRAINT "goal_links_goal_id_goals_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "goal_progress_events" ADD CONSTRAINT "goal_progress_events_goal_id_goals_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE;