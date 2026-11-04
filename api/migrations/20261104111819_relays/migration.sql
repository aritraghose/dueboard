CREATE TYPE "relay_status" AS ENUM('pending', 'delivered', 'answered', 'declined', 'expired', 'cancelled');--> statement-breakpoint
CREATE TABLE "relays" (
	"id" text PRIMARY KEY,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"message" text NOT NULL,
	"status" "relay_status" DEFAULT 'pending'::"relay_status" NOT NULL,
	"answer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"answered_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sender_synced" boolean DEFAULT true NOT NULL,
	"recipient_synced" boolean DEFAULT false NOT NULL,
	"retry_at" timestamp with time zone,
	CONSTRAINT "relays_not_self" CHECK ("from_user_id" <> "to_user_id"),
	CONSTRAINT "relays_message_length" CHECK (char_length("message") between 1 and 1000),
	CONSTRAINT "relays_answer" CHECK (("status" = 'answered') = ("answer" is not null) and ("answer" is null or char_length("answer") between 1 and 1000)),
	CONSTRAINT "relays_answered_at" CHECK (("status" in ('answered', 'declined')) = ("answered_at" is not null)),
	CONSTRAINT "relays_delivered_at" CHECK ("status" not in ('delivered', 'answered', 'declined') or "delivered_at" is not null)
);
--> statement-breakpoint
CREATE INDEX "relays_from_idx" ON "relays" ("from_user_id","created_at");--> statement-breakpoint
CREATE INDEX "relays_to_idx" ON "relays" ("to_user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "relays_open_expires_idx" ON "relays" ("expires_at") WHERE "status" in ('pending', 'delivered');--> statement-breakpoint
CREATE INDEX "relays_unsynced_idx" ON "relays" ("updated_at") WHERE not "sender_synced" or not "recipient_synced";