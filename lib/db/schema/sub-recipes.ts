import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { ingredients } from "./catalogue";
import { createdAt, qty, updatedAt } from "./columns";
import { baseUnit } from "./enums";
import { tenantPolicies } from "./policies";
import { locations } from "./tenancy";

/**
 * Prep recipes (sub-recipes, DECISIONS.md 96): something the kitchen makes
 * from ingredients and uses in menu recipes, such as tomato sauce or pizza
 * dough. "Tomato sauce makes 5,000 ml" with its lines. It has no stock of
 * its own: a sale expands it into its ingredients (lib/ledger/depletion.ts).
 * Owners and managers write.
 */
export const subRecipes = pgTable(
  "sub_recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** The unit it is measured in when a recipe uses it. */
    baseUnit: baseUnit("base_unit").notNull(),
    /** How much one batch makes, in `base_unit`. */
    yieldQty: qty("yield_qty").notNull(),
    category: text("category"),
    /** Archive instead of delete, because recipes may use it. */
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("sub_recipes_id_location_id_key").on(t.id, t.locationId),
    uniqueIndex("sub_recipes_location_id_lower_name_key").on(t.locationId, sql`lower(${t.name})`),
    check("sub_recipes_yield_positive", sql`${t.yieldQty} > 0`),
    ...tenantPolicies("sub_recipes"),
  ],
);

/** One line of a prep recipe: an ingredient, or another prep recipe, and how much one batch uses. */
export const subRecipeLines = pgTable(
  "sub_recipe_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    subRecipeId: uuid("sub_recipe_id").notNull(),
    ingredientId: uuid("ingredient_id"),
    /** A prep recipe used inside this one (garlic oil in a sauce). Never itself, never in a cycle (lib/sub-recipes). */
    childSubRecipeId: uuid("child_sub_recipe_id"),
    /** In the base unit of the ingredient or of the child prep recipe. */
    qtyBaseUnit: qty("qty_base_unit").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "sub_recipe_lines_sub_recipe_fk",
      columns: [t.subRecipeId, t.locationId],
      foreignColumns: [subRecipes.id, subRecipes.locationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "sub_recipe_lines_ingredient_fk",
      columns: [t.ingredientId, t.locationId],
      foreignColumns: [ingredients.id, ingredients.locationId],
    }).onDelete("restrict"),
    foreignKey({
      name: "sub_recipe_lines_child_fk",
      columns: [t.childSubRecipeId, t.locationId],
      foreignColumns: [subRecipes.id, subRecipes.locationId],
    }).onDelete("restrict"),
    unique("sub_recipe_lines_sub_recipe_id_ingredient_id_key").on(t.subRecipeId, t.ingredientId),
    unique("sub_recipe_lines_sub_recipe_id_child_key").on(t.subRecipeId, t.childSubRecipeId),
    index("sub_recipe_lines_ingredient_id_idx").on(t.ingredientId),
    index("sub_recipe_lines_child_sub_recipe_id_idx").on(t.childSubRecipeId),
    check("sub_recipe_lines_qty_positive", sql`${t.qtyBaseUnit} > 0`),
    check("sub_recipe_lines_one_target", sql`(${t.ingredientId} is null) <> (${t.childSubRecipeId} is null)`),
    check("sub_recipe_lines_not_itself", sql`${t.childSubRecipeId} is null or ${t.childSubRecipeId} <> ${t.subRecipeId}`),
    ...tenantPolicies("sub_recipe_lines"),
  ],
);

export type SubRecipe = typeof subRecipes.$inferSelect;
export type SubRecipeLine = typeof subRecipeLines.$inferSelect;
