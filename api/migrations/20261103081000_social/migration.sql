CREATE TYPE "connection_request_status" AS ENUM('pending', 'accepted', 'declined', 'cancelled');--> statement-breakpoint
CREATE TABLE "blocks" (
	"blocker_id" text,
	"blocked_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_pkey" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "blocks_not_self" CHECK ("blocker_id" <> "blocked_id")
);
--> statement-breakpoint
CREATE TABLE "connection_requests" (
	"id" text PRIMARY KEY,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"status" "connection_request_status" DEFAULT 'pending'::"connection_request_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "connection_requests_not_self" CHECK ("from_user_id" <> "to_user_id"),
	CONSTRAINT "connection_requests_responded_at" CHECK (("status" = 'pending') = ("responded_at" is null))
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"user_low" text,
	"user_high" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_pkey" PRIMARY KEY("user_low","user_high"),
	CONSTRAINT "connections_order" CHECK ("user_low" < "user_high" collate "C")
);
--> statement-breakpoint
CREATE INDEX "blocks_blocked_idx" ON "blocks" ("blocked_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connection_requests_pending_idx" ON "connection_requests" ("from_user_id","to_user_id") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "connection_requests_from_idx" ON "connection_requests" ("from_user_id","created_at");--> statement-breakpoint
CREATE INDEX "connection_requests_to_idx" ON "connection_requests" ("to_user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "connections_user_high_idx" ON "connections" ("user_high");