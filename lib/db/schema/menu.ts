import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { ingredients } from "./catalogue";
import { createdAt, money, qty, timestamptz, updatedAt } from "./columns";
import { baseUnit, menuItemKind, recipeLineSource } from "./enums";
import { tenantPolicies } from "./policies";
import { locations } from "./tenancy";

/**
 * Items as the POS names them, modifiers included ("extra cheese" is an item
 * with its own recipe). An item is in one of three states:
 *   mapped    it has a confirmed recipe, so its sales deplete stock
 *   ignored   it uses no stock (service charge, gift card)
 *   unmapped  neither: it waits in the unmapped queue
 */
export const menuItems = pgTable(
  "menu_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    /** The POS's own id, when the export has one. */
    posItemId: text("pos_item_id"),
    /** The name exactly as the POS prints it. */
    posName: text("pos_name").notNull(),
    displayName: text("display_name").notNull(),
    kind: menuItemKind("kind").notNull().default("item"),
    category: text("category"),
    /** Read by AI when visible. Not used in stock maths. */
    price: money("price"),
    /** True only when the item has a confirmed recipe. */
    isMapped: boolean("is_mapped").notNull().default(false),
    isIgnored: boolean("is_ignored").notNull().default(false),
    /** Set when the item came from a menu screenshot. The foreign key is added with `ai_extractions`. */
    aiExtractionId: uuid("ai_extraction_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("menu_items_id_location_id_key").on(t.id, t.locationId),
    // Sales rows match on the POS id first, then on the normalised name.
    uniqueIndex("menu_items_location_id_pos_item_id_key")
      .on(t.locationId, t.posItemId)
      .where(sql`${t.posItemId} is not null`),
    uniqueIndex("menu_items_location_id_lower_pos_name_key")
      .on(t.locationId, sql`lower(${t.posName})`)
      .where(sql`${t.posItemId} is null`),
    index("menu_items_unmapped_idx")
      .on(t.locationId)
      .where(sql`not ${t.isMapped} and not ${t.isIgnored}`),
    check("menu_items_price_not_negative", sql`${t.price} is null or ${t.price} >= 0`),
    check("menu_items_mapped_or_ignored", sql`not (${t.isMapped} and ${t.isIgnored})`),
    ...tenantPolicies("menu_items"),
  ],
);

/** Bill of materials: how much of each ingredient one sale of the item uses. */
export const recipeLines = pgTable(
  "recipe_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    menuItemId: uuid("menu_item_id").notNull(),
    /** Null only on an AI draft whose ingredient does not exist yet. */
    ingredientId: uuid("ingredient_id"),
    /** What the AI called the ingredient. */
    draftIngredientName: text("draft_ingredient_name"),
    /** The unit the AI proposed. */
    draftBaseUnit: baseUnit("draft_base_unit"),
    /** Amount used by one sale of the item, in the ingredient's base unit. */
    qtyBaseUnit: qty("qty_base_unit").notNull(),
    /** Who proposed the line. */
    source: recipeLineSource("source").notNull().default("manual"),
    /** Null means draft. Only confirmed lines deplete stock. Manual lines are confirmed on save. */
    confirmedAt: timestamptz("confirmed_at"),
    confirmedBy: uuid("confirmed_by").references(() => authUsers.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "recipe_lines_menu_item_fk",
      columns: [t.menuItemId, t.locationId],
      foreignColumns: [menuItems.id, menuItems.locationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "recipe_lines_ingredient_fk",
      columns: [t.ingredientId, t.locationId],
      foreignColumns: [ingredients.id, ingredients.locationId],
    }).onDelete("restrict"),
    unique("recipe_lines_menu_item_id_ingredient_id_key").on(t.menuItemId, t.ingredientId),
    index("recipe_lines_ingredient_id_idx").on(t.ingredientId),
    check("recipe_lines_qty_positive", sql`${t.qtyBaseUnit} > 0`),
    check("recipe_lines_confirmed_has_ingredient", sql`${t.confirmedAt} is null or ${t.ingredientId} is not null`),
    ...tenantPolicies("recipe_lines"),
  ],
);

export type MenuItem = typeof menuItems.$inferSelect;
export type RecipeLine = typeof recipeLines.$inferSelect;
