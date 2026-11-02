CREATE TYPE "habit_period_unit" AS ENUM('day', 'week', 'month');--> statement-breakpoint
CREATE TYPE "habit_schedule_kind" AS ENUM('flexible', 'specific_days');--> statement-breakpoint
CREATE TYPE "habit_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TABLE "habit_checkins" (
	"id" text PRIMARY KEY,
	"habit_id" text NOT NULL,
	"user_id" text NOT NULL,
	"local_date" date NOT NULL,
	"count" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habit_checkins_count" CHECK ("count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "habit_pauses" (
	"id" text PRIMARY KEY,
	"habit_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	CONSTRAINT "habit_pauses_order" CHECK ("end_date" is null or "end_date" > "start_date")
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"schedule_kind" "habit_schedule_kind" NOT NULL,
	"target_count" smallint NOT NULL,
	"period_unit" "habit_period_unit" NOT NULL,
	"period_length" smallint NOT NULL,
	"weekdays" smallint[],
	"month_days" smallint[],
	"start_date" date NOT NULL,
	"status" "habit_status" DEFAULT 'active'::"habit_status" NOT NULL,
	"privacy" "privacy" NOT NULL,
	"share_to_live" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habits_title_length" CHECK (char_length("title") between 1 and 200),
	CONSTRAINT "habits_description_length" CHECK (char_length("description") <= 2000),
	CONSTRAINT "habits_target_range" CHECK ("target_count" between 1 and 100),
	CONSTRAINT "habits_period_length_range" CHECK ("period_length" between 1 and 365),
	CONSTRAINT "habits_schedule_shape" CHECK (("schedule_kind" = 'flexible' and "weekdays" is null and "month_days" is null)
        or ("schedule_kind" = 'specific_days' and "period_unit" = 'day' and "period_length" = 1
          and (("weekdays" is null) <> ("month_days" is null))
          and ("weekdays" is null or (cardinality("weekdays") > 0 and "weekdays" <@ '{0,1,2,3,4,5,6}'::smallint[]))
          and ("month_days" is null or (cardinality("month_days") > 0 and 0 < all("month_days") and 32 > all("month_days")))))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "habit_checkins_habit_date_idx" ON "habit_checkins" ("habit_id","local_date");--> statement-breakpoint
CREATE INDEX "habit_checkins_user_date_idx" ON "habit_checkins" ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "habit_pauses_habit_idx" ON "habit_pauses" ("habit_id","start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "habit_pauses_open_idx" ON "habit_pauses" ("habit_id") WHERE "end_date" is null;--> statement-breakpoint
CREATE INDEX "habits_user_created_idx" ON "habits" ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "habits_user_status_idx" ON "habits" ("user_id","status");--> statement-breakpoint
ALTER TABLE "habit_checkins" ADD CONSTRAINT "habit_checkins_habit_id_habits_id_fkey" FOREIGN KEY ("habit_id") REFERENCES "habits"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "habit_pauses" ADD CONSTRAINT "habit_pauses_habit_id_habits_id_fkey" FOREIGN KEY ("habit_id") REFERENCES "habits"("id") ON DELETE CASCADE;