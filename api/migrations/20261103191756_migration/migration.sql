CREATE TABLE "tibo_wipes" (
	"user_id" text PRIMARY KEY,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL
);

