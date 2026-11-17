import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, pgPolicy, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { ingredients } from "./catalogue";
import { createdAt, qty, timestamptz, unitCost, updatedAt } from "./columns";
import { countStatus } from "./enums";
import { ANY_MEMBER, hasRole, isMember, MANAGERS } from "./policies";
import { appUser } from "./roles";
import { locations } from "./tenancy";

/**
 * A physical stock count. Staff count and submit; a manager or owner approves
 * (or rejects). Only approval changes the ledger (DECISIONS.md 8, 9).
 *
 * Who may write (SCHEMA.md): any member creates and edits their own draft;
 * owners and managers approve or reject. A trigger makes approved counts
 * read-only, except the late-movement correction (see migration 0011).
 */
export const countSessions = pgTable(
  "count_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    /** Generated on the phone: a count saved offline and synced twice stays one session. */
    clientId: uuid("client_id").notNull().unique(),
    status: countStatus("status").notNull().default("draft"),
    countedBy: uuid("counted_by")
      .notNull()
      .references(() => authUsers.id),
    startedAt: timestamptz("started_at").notNull().defaultNow(),
    /** The count time: stock is compared as of this moment. */
    submittedAt: timestamptz("submitted_at"),
    /** Also used for a rejection. */
    approvedBy: uuid("approved_by").references(() => authUsers.id, { onDelete: "set null" }),
    approvedAt: timestamptz("approved_at"),
    reviewNote: text("review_note"),
    createdAt: createdAt(),
  },
  (t) => {
    const own = sql`${t.countedBy} = public.current_user_id()`;
    return [
      unique("count_sessions_id_location_id_key").on(t.id, t.locationId),
      index("count_sessions_location_id_status_idx").on(t.locationId, t.status),
      index("count_sessions_location_id_submitted_at_idx").on(t.locationId, t.submittedAt),
      check("count_sessions_submitted_has_time", sql`${t.status} = 'draft' or ${t.submittedAt} is not null`),
      check("count_sessions_reviewed_has_reviewer", sql`${t.status} not in ('approved', 'rejected') or ${t.approvedAt} is not null`),
      pgPolicy("count_sessions_select_member", { for: "select", to: appUser, using: isMember }),
      pgPolicy("count_sessions_insert_own", {
        for: "insert",
        to: appUser,
        withCheck: sql`${hasRole(ANY_MEMBER)} and ${own} and ${t.status} in ('draft', 'submitted') and ${t.approvedBy} is null`,
      }),
      // Anyone may edit and submit their own draft...
      pgPolicy("count_sessions_update_own_draft", {
        for: "update",
        to: appUser,
        using: sql`${hasRole(ANY_MEMBER)} and ${own} and ${t.status} = 'draft'`,
        withCheck: sql`${own} and ${t.status} in ('draft', 'submitted') and ${t.approvedBy} is null`,
      }),
      // ...owners and managers may approve or reject.
      pgPolicy("count_sessions_update_manager", {
        for: "update",
        to: appUser,
        using: hasRole(MANAGERS),
        withCheck: hasRole(MANAGERS),
      }),
      pgPolicy("count_sessions_delete_draft", {
        for: "delete",
        to: appUser,
        using: sql`${t.status} = 'draft' and ((${hasRole(ANY_MEMBER)} and ${own}) or ${hasRole(MANAGERS)})`,
      }),
    ];
  },
);

/** One counted ingredient, with the theoretical stock it is compared with. */
export const countLines = pgTable(
  "count_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").notNull(),
    ingredientId: uuid("ingredient_id").notNull(),
    countedQty: qty("counted_qty").notNull(),
    /** Ledger stock as of submitted_at: provisional at submit, fixed at approval. */
    theoreticalQty: qty("theoretical_qty"),
    /** Sum of movements dated before this count but recorded after its approval. */
    lateAdjustQty: qty("late_adjust_qty").notNull().default("0"),
    /** The ingredient's cost when the count was approved. */
    unitCost: unitCost("unit_cost"),
    /** First count of this ingredient: left out of unexplained-usage totals. */
    isOpening: boolean("is_opening").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => {
    const sessionIs = (condition: string) =>
      sql.raw(
        `exists (select 1 from public.count_sessions s where s.id = "count_lines"."session_id" and s.location_id = "count_lines"."location_id" and ${condition})`,
      );
    const ownDraft = sessionIs(`s.status = 'draft' and s.counted_by = public.current_user_id()`);
    const notApproved = sessionIs(`s.status <> 'approved'`);
    const canWrite = sql`(${hasRole(ANY_MEMBER)} and ${ownDraft}) or ${hasRole(MANAGERS)}`;
    return [
      foreignKey({
        name: "count_lines_session_fk",
        columns: [t.sessionId, t.locationId],
        foreignColumns: [countSessions.id, countSessions.locationId],
      }).onDelete("cascade"),
      foreignKey({
        name: "count_lines_ingredient_fk",
        columns: [t.ingredientId, t.locationId],
        foreignColumns: [ingredients.id, ingredients.locationId],
      }).onDelete("restrict"),
      unique("count_lines_id_location_id_key").on(t.id, t.locationId),
      unique("count_lines_session_id_ingredient_id_key").on(t.sessionId, t.ingredientId),
      index("count_lines_ingredient_id_idx").on(t.ingredientId),
      check("count_lines_counted_not_negative", sql`${t.countedQty} >= 0`),
      pgPolicy("count_lines_select_member", { for: "select", to: appUser, using: isMember }),
      pgPolicy("count_lines_insert", { for: "insert", to: appUser, withCheck: canWrite }),
      pgPolicy("count_lines_update", { for: "update", to: appUser, using: canWrite, withCheck: canWrite }),
      pgPolicy("count_lines_delete", {
        for: "delete",
        to: appUser,
        using: sql`(${hasRole(ANY_MEMBER)} and ${ownDraft}) or (${hasRole(MANAGERS)} and ${notApproved})`,
      }),
    ];
  },
);

export type CountSession = typeof countSessions.$inferSelect;
export type CountLine = typeof countLines.$inferSelect;
