CREATE TABLE "tibo_events" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tibo_events_kind" CHECK ("kind" in ('session_completed', 'settings_changed'))
);

--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "tibo_proactive" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "tibo_morning_plan" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "tibo_morning_time" text DEFAULT '08:00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "tibo_deadline_nudges" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "tibo_habit_check" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "tibo_evening_time" text DEFAULT '20:00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "tibo_session_ended" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE INDEX "tibo_events_created_at_idx" ON "tibo_events" ("created_at");
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_tibo_morning_time" CHECK ("tibo_morning_time" in ('05:00', '05:30', '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00'));
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_tibo_evening_time" CHECK ("tibo_evening_time" in ('16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00', '23:30'));
