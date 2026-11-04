ALTER TABLE "user_settings" DROP COLUMN "tibo_session_ended";
--> statement-breakpoint
ALTER TABLE "tibo_events" DROP CONSTRAINT "tibo_events_kind", ADD CONSTRAINT "tibo_events_kind" CHECK ("kind" in ('settings_changed'));
