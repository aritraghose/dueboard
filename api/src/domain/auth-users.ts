import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const AuthUsers = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  image: text("image"),
  username: text("username"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
});
