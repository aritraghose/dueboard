import { defineRelations } from "drizzle-orm";

// The app's Drizzle tables. Empty for now: define each table here with
// `pgTable(...)` and add it to `defineRelations` below. Better Auth owns (and
// migrates) its own tables, so they aren't declared here; reference its
// `user.id` as a plain text column, without a foreign key, because Drizzle's
// migrations run before Better Auth's.

export const relations = defineRelations({}, () => ({}));
