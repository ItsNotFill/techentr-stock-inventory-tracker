import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, integer, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { createdAt, qty, timestamptz, updatedAt } from "./columns";
import { importSource, importStatus } from "./enums";
import { menuItems } from "./menu";
import { tenantPolicies } from "./policies";
import { locations } from "./tenancy";

/**
 * Which CSV column is which, remembered per POS. The shape is defined and
 * validated by the Zod schema in lib/validation/imports.ts.
 */
export type StoredColumnMap = Record<string, unknown>;

export const posImportMappings = pgTable(
  "pos_import_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    posProvider: text("pos_provider").notNull(),
    columnMap: jsonb("column_map").$type<StoredColumnMap>().notNull(),
    updatedBy: uuid("updated_by").references(() => authUsers.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("pos_import_mappings_location_id_pos_provider_key").on(t.locationId, t.posProvider),
    ...tenantPolicies("pos_import_mappings"),
  ],
);

/** One record per upload, for audit and undo. The row stays when an import is undone. */
export const salesImports = pgTable(
  "sales_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    source: importSource("source").notNull(),
    /** CSV imports are created confirmed (the preview comes first). Photo imports start as drafts. */
    status: importStatus("status").notNull(),
    fileName: text("file_name"),
    /** Storage path of the end-of-day report photo. */
    photoPath: text("photo_path"),
    /** The raw AI reading. The foreign key is added with `ai_extractions`. */
    aiExtractionId: uuid("ai_extraction_id"),
    /** The trading day a photo report covers. */
    businessDate: date("business_date"),
    importedBy: uuid("imported_by")
      .notNull()
      .references(() => authUsers.id),
    /** Sale lines written. */
    rowCount: integer("row_count").notNull().default(0),
    /** Orders skipped because they were already imported. */
    skippedCount: integer("skipped_count").notNull().default(0),
    /** Lines waiting in the unmapped queue at import time. */
    unmappedCount: integer("unmapped_count").notNull().default(0),
    createdAt: createdAt(),
    confirmedBy: uuid("confirmed_by").references(() => authUsers.id, { onDelete: "set null" }),
    confirmedAt: timestamptz("confirmed_at"),
    undoneBy: uuid("undone_by").references(() => authUsers.id, { onDelete: "set null" }),
    undoneAt: timestamptz("undone_at"),
  },
  (t) => [
    unique("sales_imports_id_location_id_key").on(t.id, t.locationId),
    index("sales_imports_location_id_created_at_idx").on(t.locationId, t.createdAt),
    check(
      "sales_imports_photo_has_path_and_date",
      sql`${t.source} <> 'photo' or (${t.photoPath} is not null and ${t.businessDate} is not null)`,
    ),
    ...tenantPolicies("sales_imports"),
  ],
);

/** One POS order. */
export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    importId: uuid("import_id").notNull(),
    /** Photo imports use `eod:<business_date>`. */
    posOrderId: text("pos_order_id").notNull(),
    soldAt: timestamptz("sold_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "sales_import_fk",
      columns: [t.importId, t.locationId],
      foreignColumns: [salesImports.id, salesImports.locationId],
    }).onDelete("cascade"),
    // The idempotency rule: the same order is never imported twice.
    unique("sales_location_id_pos_order_id_key").on(t.locationId, t.posOrderId),
    unique("sales_id_location_id_key").on(t.id, t.locationId),
    index("sales_location_id_sold_at_idx").on(t.locationId, t.soldAt),
    index("sales_import_id_idx").on(t.importId),
    ...tenantPolicies("sales"),
  ],
);

/** Items within an order. A negative quantity is a refund. */
export const saleLines = pgTable(
  "sale_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    saleId: uuid("sale_id").notNull(),
    menuItemId: uuid("menu_item_id").notNull(),
    qty: qty("qty").notNull(),
    /** Null until its movements are written. */
    depletedAt: timestamptz("depleted_at"),
  },
  (t) => [
    foreignKey({
      name: "sale_lines_sale_fk",
      columns: [t.saleId, t.locationId],
      foreignColumns: [sales.id, sales.locationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "sale_lines_menu_item_fk",
      columns: [t.menuItemId, t.locationId],
      foreignColumns: [menuItems.id, menuItems.locationId],
    }).onDelete("restrict"),
    index("sale_lines_sale_id_idx").on(t.saleId),
    // The back-fill queue: lines of an item that had no recipe when they were imported.
    index("sale_lines_undepleted_idx")
      .on(t.menuItemId)
      .where(sql`${t.depletedAt} is null`),
    check("sale_lines_qty_not_zero", sql`${t.qty} <> 0`),
    ...tenantPolicies("sale_lines"),
  ],
);

export type SalesImport = typeof salesImports.$inferSelect;
