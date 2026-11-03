import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Read-only views of Better Auth's own tables, for joins (profiles, people
// search, connection lists). Better Auth creates and migrates them, so they
// live here and not in `../schema.ts`: drizzle-kit only reads that file and
// would otherwise try to create them. Never write to these from a service;
// account deletion goes through Better Auth (`../api.ts`).

/** Better Auth's `user` table; its columns are camelCase. `username` is lowercased. */
export const AuthUsers = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  image: text("image"),
  /** `null` until the user finishes `/onboarding`. */
  username: text("username"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
});
