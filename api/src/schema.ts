import { defineRelations } from "drizzle-orm";
import { boolean, index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const Todos = pgTable(
  "todos",
  {
    id: serial("id").primaryKey(),
    // Better Auth's `user.id`. Better Auth owns (and migrates) its own tables,
    // so there's no foreign key: Drizzle's migrations run before Better Auth's.
    userId: text("user_id").notNull(),
    text: text("text").notNull(),
    done: boolean("done").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("todos_user_id_idx").on(table.userId)],
);
export type TodoRow = typeof Todos.$inferSelect;

export const relations = defineRelations({ Todos }, () => ({}));
