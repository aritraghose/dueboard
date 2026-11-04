CREATE TYPE "notification_kind" AS ENUM('connection_request', 'connection_accepted');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone,
	CONSTRAINT "notifications_not_self" CHECK ("user_id" <> "actor_id")
);
--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_unseen_idx" ON "notifications" ("user_id") WHERE "seen_at" is null;--> statement-breakpoint
CREATE INDEX "notifications_actor_idx" ON "notifications" ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_request_kind_idx" ON "notifications" ("request_id","kind");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_request_id_connection_requests_id_fkey" FOREIGN KEY ("request_id") REFERENCES "connection_requests"("id") ON DELETE CASCADE;