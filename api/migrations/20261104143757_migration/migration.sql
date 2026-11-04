CREATE TABLE "ask_documents" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ask_documents_name_length" CHECK (char_length("name") between 1 and 120),
	CONSTRAINT "ask_documents_text_length" CHECK (char_length("text") between 1 and 12000)
);

--> statement-breakpoint
CREATE INDEX "ask_documents_user_created_idx" ON "ask_documents" ("user_id","created_at");
