import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, qty, unitCost, updatedAt } from "./columns";
import { baseUnit } from "./enums";
import { tenantPolicies } from "./policies";
import { locations } from "./tenancy";

/** What is stocked. There is no stock column: stock is the sum of the ledger. */
export const ingredients = pgTable(
  "ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Cannot change once the ingredient has movements (checked in the app). */
    baseUnit: baseUnit("base_unit").notNull(),
    /** Euros per base unit. Updated by confirmed invoices. */
    costPerBaseUnit: unitCost("cost_per_base_unit").notNull().default("0"),
    parLevel: qty("par_level"),
    /** Drives the low-stock list. */
    reorderPoint: qty("reorder_point"),
    category: text("category"),
    /** The count screen groups by it. */
    storageArea: text("storage_area"),
    /** Archive instead of delete, because movements reference the ingredient. */
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("ingredients_id_location_id_key").on(t.id, t.locationId),
    uniqueIndex("ingredients_location_id_lower_name_key").on(t.locationId, sql`lower(${t.name})`),
    index("ingredients_location_id_storage_area_idx").on(t.locationId, t.storageArea),
    check("ingredients_cost_not_negative", sql`${t.costPerBaseUnit} >= 0`),
    check("ingredients_par_level_not_negative", sql`${t.parLevel} is null or ${t.parLevel} >= 0`),
    check("ingredients_reorder_point_not_negative", sql`${t.reorderPoint} is null or ${t.reorderPoint} >= 0`),
    ...tenantPolicies("ingredients"),
  ],
);

/** "Case 12x1 L" = 12,000 ml. Used on delivery and count screens. */
export const packSizes = pgTable(
  "pack_sizes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id").notNull(),
    label: text("label").notNull(),
    qtyInBaseUnit: qty("qty_in_base_unit").notNull(),
    /** Preselected on delivery and count screens. */
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    // Composite key: a pack size can never point at another location's ingredient.
    foreignKey({
      name: "pack_sizes_ingredient_fk",
      columns: [t.ingredientId, t.locationId],
      foreignColumns: [ingredients.id, ingredients.locationId],
    }).onDelete("cascade"),
    unique("pack_sizes_id_location_id_key").on(t.id, t.locationId),
    unique("pack_sizes_ingredient_id_label_key").on(t.ingredientId, t.label),
    uniqueIndex("pack_sizes_one_default_per_ingredient").on(t.ingredientId).where(sql`${t.isDefault}`),
    check("pack_sizes_qty_positive", sql`${t.qtyInBaseUnit} > 0`),
    ...tenantPolicies("pack_sizes"),
  ],
);

export type Ingredient = typeof ingredients.$inferSelect;
export type PackSize = typeof packSizes.$inferSelect;
