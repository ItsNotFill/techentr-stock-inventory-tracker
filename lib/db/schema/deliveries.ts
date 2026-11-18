import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, pgPolicy, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { ingredients, packSizes } from "./catalogue";
import { createdAt, money, qty, timestamptz, unitCost } from "./columns";
import { deliverySource, deliveryStatus } from "./enums";
import { ANY_MEMBER, hasRole, isMember, MANAGERS } from "./policies";
import { appUser } from "./roles";
import { locations } from "./tenancy";

/**
 * A delivery from a supplier. Each confirmed line writes one `delivery`
 * movement (lib/deliveries, through lib/ledger).
 *
 * A delivery is written as a draft, gets its lines, and is then confirmed, in
 * one transaction for a manual delivery. Invoice photos (later, with the AI
 * tasks) stay drafts until a manager or owner confirms them.
 *
 * Who may write (SCHEMA.md): any member creates and confirms a manual
 * delivery; confirming an invoice photo is for owners and managers. Lines can
 * only change while their delivery is a draft. A trigger keeps confirmed
 * deliveries and their lines as they are (migration 0013).
 */
export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    /**
     * Generated on the phone, so a retried "Log delivery" stays one delivery
     * (DECISIONS.md 83). Server-made drafts get a random one.
     */
    clientId: uuid("client_id").notNull().defaultRandom(),
    source: deliverySource("source").notNull(),
    /** Manual deliveries end up confirmed in the transaction that creates them. Invoice photos start as drafts. */
    status: deliveryStatus("status").notNull(),
    supplierName: text("supplier_name"),
    invoiceNumber: text("invoice_number"),
    /** When the goods arrived: the movements are dated at this moment. */
    deliveredAt: timestamptz("delivered_at").notNull().defaultNow(),
    /** Storage path of the invoice photo. */
    photoPath: text("photo_path"),
    /** The raw AI reading. The foreign key is added with `ai_extractions`. */
    aiExtractionId: uuid("ai_extraction_id"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => authUsers.id),
    createdAt: createdAt(),
    confirmedBy: uuid("confirmed_by").references(() => authUsers.id, { onDelete: "set null" }),
    confirmedAt: timestamptz("confirmed_at"),
  },
  (t) => {
    const own = sql`${t.createdBy} = public.current_user_id()`;
    return [
      unique("deliveries_id_location_id_key").on(t.id, t.locationId),
      unique("deliveries_location_id_client_id_key").on(t.locationId, t.clientId),
      index("deliveries_location_id_delivered_at_idx").on(t.locationId, t.deliveredAt),
      // Not unique: used to warn about an invoice entered twice.
      index("deliveries_location_id_supplier_invoice_idx").on(t.locationId, t.supplierName, t.invoiceNumber),
      check("deliveries_invoice_has_photo", sql`${t.source} <> 'invoice_photo' or ${t.photoPath} is not null`),
      check("deliveries_confirmed_has_time", sql`${t.status} <> 'confirmed' or ${t.confirmedAt} is not null`),
      pgPolicy("deliveries_select_member", { for: "select", to: appUser, using: isMember }),
      // Anyone on the team starts a delivery, as a draft, in their own name.
      pgPolicy("deliveries_insert_own_draft", {
        for: "insert",
        to: appUser,
        withCheck: sql`${hasRole(ANY_MEMBER)} and ${own} and ${t.status} = 'draft' and ${t.confirmedBy} is null and ${t.confirmedAt} is null`,
      }),
      // Anyone edits, discards or (when manual) confirms their own draft...
      pgPolicy("deliveries_update_own_draft", {
        for: "update",
        to: appUser,
        using: sql`${hasRole(ANY_MEMBER)} and ${own} and ${t.status} = 'draft'`,
        withCheck: sql`${own} and (${t.status} in ('draft', 'discarded') or (${t.status} = 'confirmed' and ${t.source} = 'manual' and ${t.confirmedBy} = public.current_user_id()))`,
      }),
      // ...owners and managers handle any draft, invoice photos included.
      pgPolicy("deliveries_update_manager", {
        for: "update",
        to: appUser,
        using: sql`${hasRole(MANAGERS)} and ${t.status} = 'draft'`,
        withCheck: hasRole(MANAGERS),
      }),
      pgPolicy("deliveries_delete_unconfirmed", {
        for: "delete",
        to: appUser,
        using: sql`${t.status} in ('draft', 'discarded') and ((${hasRole(ANY_MEMBER)} and ${own}) or ${hasRole(MANAGERS)})`,
      }),
    ];
  },
);

/** One delivered item. On confirmation it writes one `delivery` movement of `qty_base_unit`. */
export const deliveryLines = pgTable(
  "delivery_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    deliveryId: uuid("delivery_id").notNull(),
    /** Null only while a draft invoice line is unmatched. */
    ingredientId: uuid("ingredient_id"),
    packSizeId: uuid("pack_size_id"),
    /** How many packs, e.g. 2 cases. */
    packCount: qty("pack_count"),
    /** Required and > 0 at confirmation (trigger in migration 0013). */
    qtyBaseUnit: qty("qty_base_unit"),
    /** From the invoice. */
    lineTotal: money("line_total"),
    /** line_total / qty_base_unit: the cost snapshot (DECISIONS.md 21). */
    unitCost: unitCost("unit_cost"),
    /** When true, confirming sets the ingredient's cost_per_base_unit. */
    updateCost: boolean("update_cost").notNull().default(false),
    /** The line as read from the invoice. */
    rawText: text("raw_text"),
    createdAt: createdAt(),
  },
  (t) => {
    const draftWritable = sql.raw(
      `exists (select 1 from public.deliveries d where d.id = "delivery_lines"."delivery_id" and d.location_id = "delivery_lines"."location_id" and d.status = 'draft' and (d.created_by = public.current_user_id() or public.has_role(d.location_id, array['owner', 'manager']::public.member_role[])))`,
    );
    const canWrite = sql`${hasRole(ANY_MEMBER)} and ${draftWritable}`;
    return [
      foreignKey({
        name: "delivery_lines_delivery_fk",
        columns: [t.deliveryId, t.locationId],
        foreignColumns: [deliveries.id, deliveries.locationId],
      }).onDelete("cascade"),
      foreignKey({
        name: "delivery_lines_ingredient_fk",
        columns: [t.ingredientId, t.locationId],
        foreignColumns: [ingredients.id, ingredients.locationId],
      }).onDelete("restrict"),
      // The migration writes this as ON DELETE SET NULL ("pack_size_id"): a plain
      // SET NULL on a composite key would also null location_id (SCHEMA.md).
      foreignKey({
        name: "delivery_lines_pack_size_fk",
        columns: [t.packSizeId, t.locationId],
        foreignColumns: [packSizes.id, packSizes.locationId],
      }).onDelete("set null"),
      index("delivery_lines_delivery_id_idx").on(t.deliveryId),
      index("delivery_lines_ingredient_id_idx").on(t.ingredientId),
      check("delivery_lines_pack_count_positive", sql`${t.packCount} is null or ${t.packCount} > 0`),
      check("delivery_lines_qty_positive", sql`${t.qtyBaseUnit} is null or ${t.qtyBaseUnit} > 0`),
      check("delivery_lines_line_total_not_negative", sql`${t.lineTotal} is null or ${t.lineTotal} >= 0`),
      check("delivery_lines_unit_cost_not_negative", sql`${t.unitCost} is null or ${t.unitCost} >= 0`),
      check("delivery_lines_pack_has_ingredient", sql`${t.packSizeId} is null or ${t.ingredientId} is not null`),
      pgPolicy("delivery_lines_select_member", { for: "select", to: appUser, using: isMember }),
      pgPolicy("delivery_lines_insert_draft", { for: "insert", to: appUser, withCheck: canWrite }),
      pgPolicy("delivery_lines_update_draft", { for: "update", to: appUser, using: canWrite, withCheck: canWrite }),
      pgPolicy("delivery_lines_delete_draft", { for: "delete", to: appUser, using: canWrite }),
    ];
  },
);

export type Delivery = typeof deliveries.$inferSelect;
export type DeliveryLine = typeof deliveryLines.$inferSelect;
