CREATE TABLE "todos" (
	"id" serial PRIMARY KEY,
	"user_id" text NOT NULL,
	"text" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE INDEX "todos_user_id_idx" ON "todos" ("user_id");
