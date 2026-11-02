CREATE TYPE "focus_session_status" AS ENUM('running', 'paused', 'completed', 'stopped');--> statement-breakpoint
CREATE TABLE "focus_session_segments" (
	"id" text PRIMARY KEY,
	"session_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "focus_session_segments_order" CHECK ("ended_at" is null or "ended_at" >= "started_at")
);
--> statement-breakpoint
CREATE TABLE "focus_sessions" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"label" text,
	"planned_minutes" integer NOT NULL,
	"status" "focus_session_status" NOT NULL,
	"local_date" date NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"privacy" "privacy" NOT NULL,
	"share_to_live" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "focus_sessions_label_length" CHECK ("label" is null or char_length("label") between 1 and 100),
	CONSTRAINT "focus_sessions_planned_minutes" CHECK ("planned_minutes" between 1 and 600),
	CONSTRAINT "focus_sessions_ends_at" CHECK (("status" = 'running') = ("ends_at" is not null)),
	CONSTRAINT "focus_sessions_ended_at" CHECK (("status" in ('completed', 'stopped')) = ("ended_at" is not null))
);
--> statement-breakpoint
CREATE INDEX "focus_session_segments_session_idx" ON "focus_session_segments" ("session_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "focus_session_segments_open_idx" ON "focus_session_segments" ("session_id") WHERE "ended_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "focus_sessions_one_active_idx" ON "focus_sessions" ("user_id") WHERE "status" in ('running', 'paused');--> statement-breakpoint
CREATE INDEX "focus_sessions_user_local_date_idx" ON "focus_sessions" ("user_id","local_date","started_at","id");--> statement-breakpoint
CREATE INDEX "focus_sessions_expiry_idx" ON "focus_sessions" ("ends_at") WHERE "status" = 'running';--> statement-breakpoint
ALTER TABLE "focus_session_segments" ADD CONSTRAINT "focus_session_segments_session_id_focus_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "focus_sessions"("id") ON DELETE CASCADE;