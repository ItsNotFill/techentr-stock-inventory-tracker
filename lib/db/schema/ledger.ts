import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgPolicy, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { ingredients } from "./catalogue";
import { qty, timestamptz } from "./columns";
import { movementType, wasteReason } from "./enums";
import { ANY_MEMBER, hasRole, isMember, MANAGERS } from "./policies";
import { appUser } from "./roles";
import { locations } from "./tenancy";

/**
 * The ledger. Every stock change is one row here and stock is SUM(qty_delta);
 * there is no stock column anywhere. The table is append-only:
 *   - the app role may only SELECT and INSERT (no policy and no grant for more);
 *   - triggers refuse UPDATE and TRUNCATE always, and DELETE unless it comes
 *     from undo_sales_import() (see the hand-written migrations).
 * All inserts go through lib/ledger.
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id").notNull(),
    /** Positive adds stock, negative removes it. */
    qtyDelta: qty("qty_delta").notNull(),
    type: movementType("type").notNull(),
    /** `sale_lines`, `delivery_lines`, `count_lines`, or null. */
    refTable: text("ref_table"),
    /** No foreign key, because it points at different tables. lib/ledger checks the location. */
    refId: uuid("ref_id"),
    wasteReason: wasteReason("waste_reason"),
    note: text("note"),
    /** When it happened. */
    occurredAt: timestamptz("occurred_at").notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    /** When it was recorded. */
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "stock_movements_ingredient_fk",
      columns: [t.ingredientId, t.locationId],
      foreignColumns: [ingredients.id, ingredients.locationId],
    }).onDelete("restrict"),
    index("stock_movements_ingredient_id_occurred_at_idx").on(t.ingredientId, t.occurredAt),
    index("stock_movements_location_id_type_occurred_at_idx").on(t.locationId, t.type, t.occurredAt),
    index("stock_movements_ref_idx").on(t.refTable, t.refId),
    check("stock_movements_qty_not_zero", sql`${t.qtyDelta} <> 0`),
    check("stock_movements_waste_has_reason", sql`(${t.type} = 'waste') = (${t.wasteReason} is not null)`),
    check("stock_movements_ref_is_complete", sql`(${t.refTable} is null) = (${t.refId} is null)`),
    pgPolicy("stock_movements_select_member", { for: "select", to: appUser, using: isMember }),
    // Sales and count adjustments: owner and manager. Deliveries and waste: any member.
    pgPolicy("stock_movements_insert_by_type", {
      for: "insert",
      to: appUser,
      withCheck: sql`(type in ('sale', 'count_adjust') and ${hasRole(MANAGERS)}) or (type in ('delivery', 'waste') and ${hasRole(ANY_MEMBER)})`,
    }),
  ],
);
