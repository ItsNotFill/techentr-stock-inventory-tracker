import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgPolicy, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { ingredients, packSizes, suppliers } from "./catalogue";
import { createdAt, qty, timestamptz, updatedAt } from "./columns";
import { deliveries } from "./deliveries";
import { purchaseOrderStatus } from "./enums";
import { hasRole, isMember, MANAGERS } from "./policies";
import { appUser } from "./roles";
import { locations } from "./tenancy";

/**
 * Purchase orders (stage 7, DECISIONS.md 97): draft -> sent -> received, or
 * cancelled. Owners and managers write. Receiving logs a delivery
 * (lib/deliveries) and links it here.
 */
export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id").notNull(),
    status: purchaseOrderStatus("status").notNull().default("draft"),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => authUsers.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    sentAt: timestamptz("sent_at"),
    sentBy: uuid("sent_by").references(() => authUsers.id, { onDelete: "set null" }),
    receivedAt: timestamptz("received_at"),
    receivedBy: uuid("received_by").references(() => authUsers.id, { onDelete: "set null" }),
    /** The delivery logged when it was received. */
    deliveryId: uuid("delivery_id"),
    cancelledAt: timestamptz("cancelled_at"),
  },
  (t) => [
    foreignKey({
      name: "purchase_orders_supplier_fk",
      columns: [t.supplierId, t.locationId],
      foreignColumns: [suppliers.id, suppliers.locationId],
    }).onDelete("restrict"),
    foreignKey({
      name: "purchase_orders_delivery_fk",
      columns: [t.deliveryId, t.locationId],
      foreignColumns: [deliveries.id, deliveries.locationId],
    }).onDelete("restrict"),
    unique("purchase_orders_id_location_id_key").on(t.id, t.locationId),
    index("purchase_orders_location_id_status_idx").on(t.locationId, t.status),
    index("purchase_orders_supplier_id_idx").on(t.supplierId),
    check("purchase_orders_sent_has_time", sql`${t.status} in ('draft', 'cancelled') or ${t.sentAt} is not null`),
    check("purchase_orders_received_has_delivery", sql`${t.status} <> 'received' or (${t.receivedAt} is not null and ${t.deliveryId} is not null)`),
    pgPolicy("purchase_orders_select_member", { for: "select", to: appUser, using: isMember }),
    pgPolicy("purchase_orders_insert_manager", { for: "insert", to: appUser, withCheck: sql`${hasRole(MANAGERS)} and ${t.status} = 'draft'` }),
    pgPolicy("purchase_orders_update_manager", { for: "update", to: appUser, using: hasRole(MANAGERS), withCheck: hasRole(MANAGERS) }),
    pgPolicy("purchase_orders_delete_draft", { for: "delete", to: appUser, using: sql`${hasRole(MANAGERS)} and ${t.status} = 'draft'` }),
  ],
);

/** One ingredient on a purchase order, in packs or in units. */
export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    purchaseOrderId: uuid("purchase_order_id").notNull(),
    ingredientId: uuid("ingredient_id").notNull(),
    packSizeId: uuid("pack_size_id"),
    /** How many packs, when ordered in packs. */
    packCount: qty("pack_count"),
    /** In the ingredient's base unit. */
    qtyBaseUnit: qty("qty_base_unit").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => {
    // Lines change only while their order is a draft.
    const draftOrder = sql.raw(
      `exists (select 1 from public.purchase_orders o where o.id = "purchase_order_lines"."purchase_order_id" and o.location_id = "purchase_order_lines"."location_id" and o.status = 'draft')`,
    );
    const canWrite = sql`${hasRole(MANAGERS)} and ${draftOrder}`;
    return [
      foreignKey({
        name: "purchase_order_lines_order_fk",
        columns: [t.purchaseOrderId, t.locationId],
        foreignColumns: [purchaseOrders.id, purchaseOrders.locationId],
      }).onDelete("cascade"),
      foreignKey({
        name: "purchase_order_lines_ingredient_fk",
        columns: [t.ingredientId, t.locationId],
        foreignColumns: [ingredients.id, ingredients.locationId],
      }).onDelete("restrict"),
      // The migration writes this as ON DELETE SET NULL ("pack_size_id"), as for delivery lines.
      foreignKey({
        name: "purchase_order_lines_pack_size_fk",
        columns: [t.packSizeId, t.locationId],
        foreignColumns: [packSizes.id, packSizes.locationId],
      }).onDelete("set null"),
      unique("purchase_order_lines_order_ingredient_key").on(t.purchaseOrderId, t.ingredientId),
      index("purchase_order_lines_ingredient_id_idx").on(t.ingredientId),
      check("purchase_order_lines_qty_positive", sql`${t.qtyBaseUnit} > 0`),
      check("purchase_order_lines_pack_count_positive", sql`${t.packCount} is null or ${t.packCount} > 0`),
      pgPolicy("purchase_order_lines_select_member", { for: "select", to: appUser, using: isMember }),
      pgPolicy("purchase_order_lines_insert_draft", { for: "insert", to: appUser, withCheck: canWrite }),
      pgPolicy("purchase_order_lines_update_draft", { for: "update", to: appUser, using: canWrite, withCheck: canWrite }),
      pgPolicy("purchase_order_lines_delete_draft", { for: "delete", to: appUser, using: canWrite }),
    ];
  },
);

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderLine = typeof purchaseOrderLines.$inferSelect;
