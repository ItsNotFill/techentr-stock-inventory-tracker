import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Stage 0 test table: proves that migrations reach the database.
 * RLS is on with no policies, so only the admin connection can read it.
 */
export const setupCheck = pgTable("setup_check", {
  id: uuid("id").primaryKey().defaultRandom(),
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
