ALTER TABLE "user_settings" ADD COLUMN "color" text DEFAULT (array['red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'violet', 'pink'])[floor(random() * 9)::int + 1] NOT NULL;
