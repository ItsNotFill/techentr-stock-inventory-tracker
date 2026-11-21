import { sql } from "drizzle-orm";
import { check, index, integer, pgPolicy, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt } from "./columns";
import { emailKind } from "./enums";
import { isMember } from "./policies";
import { appUser } from "./roles";
import { locations } from "./tenancy";

/**
 * Every run of a scheduled e-mail for a location (DECISIONS.md 99): sent,
 * skipped (no key, nobody to send to, nothing new) or failed. Unique per
 * location, kind and period, so a cron job that runs twice sends once.
 * Written only by the cron jobs (admin connection); members read it, so
 * Settings can say when the last one went out.
 */
export const emailLog = pgTable(
  "email_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    kind: emailKind("kind").notNull(),
    /** "2026-W47" for the weekly summary, "2026-11-20" for a low-stock alert. */
    period: text("period").notNull(),
    status: text("status").notNull(),
    recipientCount: integer("recipient_count").notNull().default(0),
    /** Low-stock alert: which ingredients were low, so the next alert goes only when that changes. */
    signature: text("signature"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("email_log_location_kind_period_key").on(t.locationId, t.kind, t.period),
    index("email_log_location_id_kind_created_at_idx").on(t.locationId, t.kind, t.createdAt),
    check("email_log_status", sql`${t.status} in ('sent', 'skipped', 'failed')`),
    pgPolicy("email_log_select_member", { for: "select", to: appUser, using: isMember }),
  ],
);

export type EmailLogEntry = typeof emailLog.$inferSelect;
