CREATE TABLE "ask_questions" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"asker_id" text,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ask_questions_question_length" CHECK (char_length("question") between 1 and 500),
	CONSTRAINT "ask_questions_answer_length" CHECK (char_length("answer") <= 2000)
);

--> statement-breakpoint
CREATE TABLE "ask_settings" (
	"user_id" text PRIMARY KEY,
	"enabled" boolean DEFAULT false NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"shared_context" text DEFAULT '' NOT NULL,
	"monthly_answer_cap" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ask_settings_instructions_length" CHECK (char_length("instructions") <= 4000),
	CONSTRAINT "ask_settings_shared_context_length" CHECK (char_length("shared_context") <= 8000),
	CONSTRAINT "ask_settings_monthly_answer_cap" CHECK ("monthly_answer_cap" between 1 and 50)
);

--> statement-breakpoint
CREATE TABLE "ask_usage" (
	"user_id" text,
	"period" text,
	"answers" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ask_usage_pkey" PRIMARY KEY("user_id","period"),
	CONSTRAINT "ask_usage_answers" CHECK ("answers" >= 0)
);

--> statement-breakpoint
CREATE INDEX "ask_questions_user_created_idx" ON "ask_questions" ("user_id","created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "ask_questions_created_idx" ON "ask_questions" ("created_at");
--> statement-breakpoint
CREATE INDEX "ask_questions_asker_idx" ON "ask_questions" ("asker_id");
