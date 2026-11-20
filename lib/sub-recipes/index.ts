import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { ingredients, menuItems, recipeLines, subRecipeLines, subRecipes, type BaseUnit } from "@/lib/db/schema";
import { DISPLAY_UNITS, toBaseUnits, toDbQty, toDecimal } from "@/lib/units";
import type { PrepLineInput, SubRecipeFormValues } from "@/lib/validation/sub-recipes";
import { createsCycle, depthWith, MAX_DEPTH, type PrepGraph } from "./compose";
import { prepCostsPerUnit } from "./costs";
import { loadPrepGraph } from "./graph";

export { MAX_DEPTH } from "./compose";

/**
 * Prep recipes (DECISIONS.md 96): tomato sauce, pizza dough, a house mix.
 * Every function takes a transaction from `withUser`, so RLS applies (owners
 * and managers write), and filters by location as well. Depletion expands
 * them into their ingredients (lib/ledger/depletion.ts); they have no stock.
 */

export class SubRecipeError extends Error {
  constructor(
    message: string,
    /** The form field the message belongs to, e.g. `lines.2.amount`. */
    readonly field?: string,
  ) {
    super(message);
    this.name = "SubRecipeError";
  }
}

export type SubRecipeSummary = {
  id: string;
  name: string;
  baseUnit: BaseUnit;
  /** How much one batch makes, in base units. */
  yieldQty: string;
  category: string | null;
  isActive: boolean;
  lineCount: number;
  /** Euros per base unit at today's ingredient costs; null when it cannot be worked out. */
  costPerUnit: string | null;
  /** Menu items and prep recipes that use it. */
  usedBy: number;
};

export type SubRecipeLineDetail = {
  id: string;
  ingredientId: string | null;
  subRecipeId: string | null;
  name: string;
  baseUnit: BaseUnit;
  isActive: boolean;
  qtyBaseUnit: string;
  /** Euros per base unit of the ingredient or prep recipe used. */
  costPerBaseUnit: string | null;
};

export type SubRecipeDetail = Omit<SubRecipeSummary, "lineCount" | "usedBy"> & {
  lines: SubRecipeLineDetail[];
  /** Names of the menu items and prep recipes that use it. */
  usedBy: { menuItems: { id: string; name: string }[]; prepRecipes: { id: string; name: string }[] };
  /** Its unit is fixed once something uses it. */
  baseUnitLocked: boolean;
};

/** What uses each prep recipe: recipe lines of menu items and lines of other prep recipes. */
async function usage(tx: Tx, locationId: string) {
  const inMenu = await tx
    .select({ subRecipeId: recipeLines.subRecipeId, menuItemId: menuItems.id, name: menuItems.displayName })
    .from(recipeLines)
    .innerJoin(menuItems, eq(menuItems.id, recipeLines.menuItemId))
    .where(and(eq(recipeLines.locationId, locationId), sql`${recipeLines.subRecipeId} is not null`));
  const inPreps = await tx
    .select({ childId: subRecipeLines.childSubRecipeId, prepId: subRecipes.id, name: subRecipes.name })
    .from(subRecipeLines)
    .innerJoin(subRecipes, eq(subRecipes.id, subRecipeLines.subRecipeId))
    .where(and(eq(subRecipeLines.locationId, locationId), sql`${subRecipeLines.childSubRecipeId} is not null`));
  return { inMenu, inPreps };
}

export async function listSubRecipes(tx: Tx, locationId: string, options: { includeArchived?: boolean } = {}): Promise<SubRecipeSummary[]> {
  const rows = await tx
    .select()
    .from(subRecipes)
    .where(options.includeArchived ? eq(subRecipes.locationId, locationId) : and(eq(subRecipes.locationId, locationId), eq(subRecipes.isActive, true)))
    .orderBy(asc(sql`lower(${subRecipes.name})`));
  if (rows.length === 0) return [];
  const graph = await loadPrepGraph(tx, locationId);
  const costs = await prepCostsPerUnit(tx, locationId, rows.map((row) => row.id), graph);
  const { inMenu, inPreps } = await usage(tx, locationId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    baseUnit: row.baseUnit,
    yieldQty: row.yieldQty,
    category: row.category,
    isActive: row.isActive,
    lineCount: graph.get(row.id)?.lines.length ?? 0,
    costPerUnit: costs.get(row.id) ?? null,
    usedBy: new Set(inMenu.filter((use) => use.subRecipeId === row.id).map((use) => use.menuItemId)).size + inPreps.filter((use) => use.childId === row.id).length,
  }));
}

/** Active prep recipes for the recipe editor's picker, with today's cost per unit. */
export async function listPrepOptions(tx: Tx, locationId: string) {
  const rows = await listSubRecipes(tx, locationId);
  return rows.map(({ id, name, baseUnit, costPerUnit, category }) => ({ id, name, baseUnit, costPerUnit, category }));
}

export async function getSubRecipe(tx: Tx, locationId: string, id: string): Promise<SubRecipeDetail | null> {
  const [row] = await tx
    .select()
    .from(subRecipes)
    .where(and(eq(subRecipes.id, id), eq(subRecipes.locationId, locationId)));
  if (!row) return null;
  const lines = await tx
    .select({
      id: subRecipeLines.id,
      ingredientId: subRecipeLines.ingredientId,
      subRecipeId: subRecipeLines.childSubRecipeId,
      qtyBaseUnit: subRecipeLines.qtyBaseUnit,
      ingredientName: ingredients.name,
      ingredientUnit: ingredients.baseUnit,
      ingredientActive: ingredients.isActive,
      ingredientCost: ingredients.costPerBaseUnit,
    })
    .from(subRecipeLines)
    .leftJoin(ingredients, eq(ingredients.id, subRecipeLines.ingredientId))
    .where(and(eq(subRecipeLines.subRecipeId, id), eq(subRecipeLines.locationId, locationId)))
    .orderBy(asc(subRecipeLines.createdAt), asc(subRecipeLines.id));
  const childIds = lines.flatMap((line) => (line.subRecipeId ? [line.subRecipeId] : []));
  const children = childIds.length
    ? await tx
        .select({ id: subRecipes.id, name: subRecipes.name, baseUnit: subRecipes.baseUnit, isActive: subRecipes.isActive })
        .from(subRecipes)
        .where(and(eq(subRecipes.locationId, locationId), inArray(subRecipes.id, childIds)))
    : [];
  const childById = new Map(children.map((child) => [child.id, child]));
  const graph = await loadPrepGraph(tx, locationId);
  const costs = await prepCostsPerUnit(tx, locationId, [id, ...childIds], graph);
  const { inMenu, inPreps } = await usage(tx, locationId);
  const menuUse = [...new Map(inMenu.filter((use) => use.subRecipeId === id).map((use) => [use.menuItemId, { id: use.menuItemId, name: use.name }])).values()];
  const prepUse = inPreps.filter((use) => use.childId === id).map((use) => ({ id: use.prepId, name: use.name }));

  return {
    id: row.id,
    name: row.name,
    baseUnit: row.baseUnit,
    yieldQty: row.yieldQty,
    category: row.category,
    isActive: row.isActive,
    costPerUnit: costs.get(row.id) ?? null,
    usedBy: { menuItems: menuUse, prepRecipes: prepUse },
    baseUnitLocked: menuUse.length > 0 || prepUse.length > 0,
    lines: lines.map((line) => {
      const child = line.subRecipeId ? childById.get(line.subRecipeId) : undefined;
      return {
        id: line.id,
        ingredientId: line.ingredientId,
        subRecipeId: line.subRecipeId,
        name: child?.name ?? line.ingredientName ?? "",
        baseUnit: (child?.baseUnit ?? line.ingredientUnit)!,
        isActive: child?.isActive ?? line.ingredientActive ?? false,
        qtyBaseUnit: line.qtyBaseUnit,
        costPerBaseUnit: child ? (costs.get(child.id) ?? null) : line.ingredientCost,
      };
    }),
  };
}

/**
 * Creates a prep recipe (id null) or saves an existing one, with its whole
 * list of lines (the lines given replace what was there). Refuses a name
 * that is taken, a unit change once something uses it, archived or unknown
 * ingredients, units that do not fit, the same ingredient twice, and prep
 * recipes that would contain themselves or nest deeper than MAX_DEPTH.
 * Returns the id.
 */
export async function saveSubRecipe(
  tx: Tx,
  locationId: string,
  id: string | null,
  values: SubRecipeFormValues,
  lines: PrepLineInput[],
): Promise<string> {
  if (id) {
    const [current] = await tx
      .select({ baseUnit: subRecipes.baseUnit })
      .from(subRecipes)
      .where(and(eq(subRecipes.id, id), eq(subRecipes.locationId, locationId)))
      .for("update");
    if (!current) throw new SubRecipeError("This prep recipe no longer exists.");
    if (current.baseUnit !== values.baseUnit) {
      const { inMenu, inPreps } = await usage(tx, locationId);
      if (inMenu.some((use) => use.subRecipeId === id) || inPreps.some((use) => use.childId === id)) {
        throw new SubRecipeError("The unit cannot change while menu items or other prep recipes use it.", "baseUnit");
      }
    }
  }
  const [clash] = await tx
    .select({ id: subRecipes.id })
    .from(subRecipes)
    .where(and(eq(subRecipes.locationId, locationId), sql`lower(${subRecipes.name}) = lower(${values.name})`, id ? ne(subRecipes.id, id) : undefined));
  if (clash) throw new SubRecipeError("There is already a prep recipe with this name.", "name");

  const yieldQty = toDbQty(toBaseUnits(values.yieldAmount, values.yieldUnit, values.baseUnit));
  if (!toDecimal(yieldQty).gt(0)) throw new SubRecipeError("This amount is too small to store.", "yieldAmount");

  const rows = await checkLines(tx, locationId, id, lines);

  let savedId = id;
  if (savedId) {
    await tx
      .update(subRecipes)
      .set({ name: values.name, baseUnit: values.baseUnit, yieldQty, category: values.category })
      .where(and(eq(subRecipes.id, savedId), eq(subRecipes.locationId, locationId)));
    await tx.delete(subRecipeLines).where(and(eq(subRecipeLines.subRecipeId, savedId), eq(subRecipeLines.locationId, locationId)));
  } else {
    const [created] = await tx
      .insert(subRecipes)
      .values({ locationId, name: values.name, baseUnit: values.baseUnit, yieldQty, category: values.category })
      .returning({ id: subRecipes.id });
    savedId = created.id;
  }
  for (const row of rows) {
    // clock_timestamp(): lines keep the order they were given in.
    await tx.insert(subRecipeLines).values({ ...row, locationId, subRecipeId: savedId, createdAt: sql`clock_timestamp()` });
  }
  return savedId;
}

async function checkLines(tx: Tx, locationId: string, id: string | null, lines: PrepLineInput[]) {
  if (lines.length === 0) throw new SubRecipeError("Add at least one ingredient.", "lines");
  const ingredientIds = lines.flatMap((line) => (line.ingredientId ? [line.ingredientId] : []));
  const childIds = lines.flatMap((line) => (line.subRecipeId ? [line.subRecipeId] : []));
  const knownIngredients = ingredientIds.length
    ? await tx
        .select({ id: ingredients.id, baseUnit: ingredients.baseUnit, isActive: ingredients.isActive })
        .from(ingredients)
        .where(and(eq(ingredients.locationId, locationId), inArray(ingredients.id, ingredientIds)))
    : [];
  const knownPreps = childIds.length
    ? await tx
        .select({ id: subRecipes.id, baseUnit: subRecipes.baseUnit, isActive: subRecipes.isActive })
        .from(subRecipes)
        .where(and(eq(subRecipes.locationId, locationId), inArray(subRecipes.id, childIds)))
    : [];
  const byId = new Map([...knownIngredients, ...knownPreps].map((row) => [row.id, row]));

  if (childIds.length > 0) {
    const graph: PrepGraph = await loadPrepGraph(tx, locationId);
    if (id && childIds.includes(id)) throw new SubRecipeError("A prep recipe cannot contain itself.", `lines.${lines.findIndex((line) => line.subRecipeId === id)}.ingredientId`);
    if (id && createsCycle(graph, id, childIds)) {
      throw new SubRecipeError("This would put the prep recipe inside itself, through another one.", "lines");
    }
    if (depthWith(graph, childIds) > MAX_DEPTH) {
      throw new SubRecipeError(`Prep recipes can be nested at most ${MAX_DEPTH} deep.`, "lines");
    }
  }

  const seen = new Set<string>();
  return lines.map((line, index) => {
    const targetId = line.ingredientId ?? line.subRecipeId!;
    const target = byId.get(targetId);
    const what = line.subRecipeId ? "prep recipe" : "ingredient";
    const field = `lines.${index}.ingredientId`;
    if (!target) throw new SubRecipeError(`This ${what} no longer exists.`, field);
    if (!target.isActive) throw new SubRecipeError(`This ${what} is archived. Restore it or remove the line.`, field);
    if (seen.has(targetId)) throw new SubRecipeError(`This ${what} is already in the prep recipe.`, field);
    seen.add(targetId);
    if (!DISPLAY_UNITS[target.baseUnit].some((entry) => entry.unit === line.unit)) {
      throw new SubRecipeError(`This unit does not match the ${what}'s unit.`, `lines.${index}.unit`);
    }
    const qtyBaseUnit = toDbQty(toBaseUnits(line.amount, line.unit, target.baseUnit));
    if (!toDecimal(qtyBaseUnit).gt(0)) throw new SubRecipeError("This amount is too small to store.", `lines.${index}.amount`);
    return { ingredientId: line.ingredientId, childSubRecipeId: line.subRecipeId, qtyBaseUnit };
  });
}

/** Archive (or restore). Recipes that use it keep working; it can no longer be added to new ones. */
export async function setSubRecipeActive(tx: Tx, locationId: string, id: string, isActive: boolean): Promise<void> {
  const updated = await tx
    .update(subRecipes)
    .set({ isActive })
    .where(and(eq(subRecipes.id, id), eq(subRecipes.locationId, locationId)))
    .returning({ id: subRecipes.id });
  if (updated.length === 0) throw new SubRecipeError("This prep recipe no longer exists.");
}
