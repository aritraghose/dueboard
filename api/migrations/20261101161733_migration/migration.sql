CREATE TYPE "activity_kind" AS ENUM('task_settled', 'habit_completed', 'goal_progressed', 'goal_completed', 'session_started', 'session_completed', 'session_stopped', 'note_created');
--> statement-breakpoint
CREATE TYPE "activity_subject" AS ENUM('task', 'habit', 'goal', 'session', 'note');
--> statement-breakpoint
CREATE TYPE "privacy" AS ENUM('public', 'connections', 'private');
--> statement-breakpoint
CREATE TYPE "relay_policy" AS ENUM('connections', 'anyone', 'none');
--> statement-breakpoint
CREATE TYPE "system_tag_kind" AS ENUM('default', 'habit', 'goal');
--> statement-breakpoint
CREATE TABLE "activity" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"kind" "activity_kind" NOT NULL,
	"subject_type" "activity_subject" NOT NULL,
	"subject_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"local_date" date NOT NULL,
	"meta" jsonb DEFAULT '{}' NOT NULL
);

--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"system_kind" "system_tag_kind",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY,
	"time_zone" text NOT NULL,
	"default_privacy" "privacy" DEFAULT 'connections'::"privacy" NOT NULL,
	"default_share_to_timeline" boolean DEFAULT true NOT NULL,
	"relay_policy" "relay_policy" DEFAULT 'connections'::"relay_policy" NOT NULL,
	"ai_quota_override" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE INDEX "activity_user_occurred_idx" ON "activity" ("user_id","occurred_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "activity_user_local_date_idx" ON "activity" ("user_id","local_date");
--> statement-breakpoint
CREATE INDEX "activity_subject_idx" ON "activity" ("subject_type","subject_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_name_idx" ON "tags" ("user_id",lower("name"));
--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_system_kind_idx" ON "tags" ("user_id","system_kind") WHERE "system_kind" is not null;
