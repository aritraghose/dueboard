-- The timeline is now called "live" (planning.md, Decision log, 2026-11-02).
ALTER TABLE "user_settings" RENAME COLUMN "default_share_to_timeline" TO "default_share_to_live";
