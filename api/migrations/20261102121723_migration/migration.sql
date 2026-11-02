CREATE TYPE "task_status" AS ENUM('idle', 'working', 'settled');
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assigned_date" date,
	"deadline_date" date,
	"tag_id" text NOT NULL,
	"status" "task_status" DEFAULT 'idle'::"task_status" NOT NULL,
	"settled_at" timestamp with time zone,
	"privacy" "privacy" NOT NULL,
	"share_to_live" boolean NOT NULL,
	"importance" smallint,
	"expected_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_title_length" CHECK (char_length("title") between 1 and 200),
	CONSTRAINT "tasks_description_length" CHECK (char_length("description") <= 2000),
	CONSTRAINT "tasks_importance_range" CHECK ("importance" between 1 and 5),
	CONSTRAINT "tasks_expected_minutes_range" CHECK ("expected_minutes" between 1 and 1440),
	CONSTRAINT "tasks_dates_order" CHECK ("assigned_date" is null or "deadline_date" is null or "assigned_date" <= "deadline_date"),
	CONSTRAINT "tasks_settled_at" CHECK (("status" = 'settled') = ("settled_at" is not null))
);

--> statement-breakpoint
CREATE INDEX "tasks_user_assigned_idx" ON "tasks" ("user_id","assigned_date");
--> statement-breakpoint
CREATE INDEX "tasks_user_deadline_idx" ON "tasks" ("user_id","deadline_date");
--> statement-breakpoint
CREATE INDEX "tasks_user_status_idx" ON "tasks" ("user_id","status");
--> statement-breakpoint
CREATE INDEX "tasks_user_created_idx" ON "tasks" ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "tasks_user_unscheduled_idx" ON "tasks" ("user_id","status") WHERE "assigned_date" is null and "deadline_date" is null;
--> statement-breakpoint
CREATE INDEX "tasks_tag_idx" ON "tasks" ("tag_id");
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tag_id_tags_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT;
