import { and, asc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { ingredients, packSizes, recipeLines, type Ingredient, type PackSize } from "@/lib/db/schema";
import { hasMovements } from "@/lib/ledger";
import { costPerBaseUnit, toBaseUnits, toDbQty, toDbUnitCost, DISPLAY_UNITS } from "@/lib/units";
import { quantityToPar } from "./stock";
import type { IngredientFormValues, PackSizeFormValues } from "@/lib/validation/ingredients";

/**
 * Ingredient and pack-size data access. Every function takes a transaction
 * from `withUser`, so RLS applies, and filters by location as well.
 */

export type IngredientWithPacks = Ingredient & { packSizes: PackSize[] };

export class IngredientError extends Error {
  constructor(
    message: string,
    /** The form field the message belongs to, if any. */
    readonly field?: string,
  ) {
    super(message);
    this.name = "IngredientError";
  }
}

export async function listIngredients(
  tx: Tx,
  locationId: string,
  options: { includeArchived?: boolean } = {},
): Promise<IngredientWithPacks[]> {
  const rows = await tx
    .select()
    .from(ingredients)
    .where(
      options.includeArchived
        ? eq(ingredients.locationId, locationId)
        : and(eq(ingredients.locationId, locationId), eq(ingredients.isActive, true)),
    )
    .orderBy(asc(sql`lower(${ingredients.name})`));
  const packs = await tx
    .select()
    .from(packSizes)
    .where(eq(packSizes.locationId, locationId))
    .orderBy(asc(packSizes.qtyInBaseUnit));

  const packsByIngredient = new Map<string, PackSize[]>();
  for (const pack of packs) {
    const list = packsByIngredient.get(pack.ingredientId) ?? [];
    list.push(pack);
    packsByIngredient.set(pack.ingredientId, list);
  }
  return rows.map((row) => ({ ...row, packSizes: packsByIngredient.get(row.id) ?? [] }));
}

/** An ingredient as the phone screens (delivery, waste) offer it: no costs, which staff do not see. */
export type EntryOption = {
  id: string;
  name: string;
  baseUnit: Ingredient["baseUnit"];
  storageArea: string | null;
  packSizes: { id: string; label: string; qtyInBaseUnit: string; isDefault: boolean }[];
};

/** Active ingredients by name, with their pack sizes (smallest first). */
export async function listEntryOptions(tx: Tx, locationId: string): Promise<EntryOption[]> {
  const rows = await listIngredients(tx, locationId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    baseUnit: row.baseUnit,
    storageArea: row.storageArea,
    packSizes: row.packSizes.map((pack) => ({
      id: pack.id,
      label: pack.label,
      qtyInBaseUnit: pack.qtyInBaseUnit,
      isDefault: pack.isDefault,
    })),
  }));
}

export type LowStockItem = {
  id: string;
  name: string;
  baseUnit: Ingredient["baseUnit"];
  storageArea: string | null;
  /** Theoretical stock now, in base units. */
  stock: string;
  reorderPoint: string;
  parLevel: string | null;
  /** Par level minus stock, when a par level is set and stock is under it. */
  toPar: string | null;
};

/**
 * The low-stock list: active ingredients whose theoretical stock is at or
 * below their reorder point (`isLowStock`, DECISIONS.md 86). The emptiest
 * first, measured against the reorder point, so grams and bottles compare.
 */
export async function listLowStock(tx: Tx, locationId: string): Promise<LowStockItem[]> {
  const rows = await tx.execute<{
    id: string;
    name: string;
    base_unit: Ingredient["baseUnit"];
    storage_area: string | null;
    stock: string;
    reorder_point: string;
    par_level: string | null;
  }>(sql`
    with stock as (
      select i.id, i.name, i.base_unit, i.storage_area, i.reorder_point, i.par_level,
             coalesce(sum(sm.qty_delta), 0)::numeric(14, 3) as stock
      from public.ingredients i
      left join public.stock_movements sm on sm.ingredient_id = i.id and sm.location_id = i.location_id
      where i.location_id = ${locationId}::uuid and i.is_active and i.reorder_point is not null
      group by i.id
    )
    select id, name, base_unit, storage_area, stock::text as stock, reorder_point::text as reorder_point,
           par_level::text as par_level
    from stock
    where stock <= reorder_point
    order by case when reorder_point = 0 then stock else stock / reorder_point end, lower(name)
  `);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    baseUnit: row.base_unit,
    storageArea: row.storage_area,
    stock: row.stock,
    reorderPoint: row.reorder_point,
    parLevel: row.par_level,
    toPar: quantityToPar(row.stock, row.par_level),
  }));
}

export async function getIngredient(tx: Tx, locationId: string, id: string): Promise<IngredientWithPacks | null> {
  const [row] = await tx
    .select()
    .from(ingredients)
    .where(and(eq(ingredients.id, id), eq(ingredients.locationId, locationId)));
  if (!row) return null;
  const packs = await tx
    .select()
    .from(packSizes)
    .where(and(eq(packSizes.ingredientId, id), eq(packSizes.locationId, locationId)))
    .orderBy(asc(packSizes.qtyInBaseUnit));
  return { ...row, packSizes: packs };
}

/** Form values (readable units) to database columns (base units). */
function toColumns(values: IngredientFormValues) {
  const costFactor = DISPLAY_UNITS[values.baseUnit].find((entry) => entry.unit === values.costUnit)!.factor;
  const toLevel = (amount: string | null) =>
    amount === null ? null : toDbQty(toBaseUnits(amount, values.levelUnit, values.baseUnit));
  return {
    name: values.name,
    baseUnit: values.baseUnit,
    costPerBaseUnit: toDbUnitCost(costPerBaseUnit(values.costAmount, costFactor)),
    reorderPoint: toLevel(values.reorderPoint),
    parLevel: toLevel(values.parLevel),
    category: values.category,
    storageArea: values.storageArea,
  };
}

async function assertNameIsFree(tx: Tx, locationId: string, name: string, exceptId?: string) {
  const [clash] = await tx
    .select({ id: ingredients.id, isActive: ingredients.isActive })
    .from(ingredients)
    .where(and(eq(ingredients.locationId, locationId), sql`lower(${ingredients.name}) = lower(${name})`));
  if (clash && clash.id !== exceptId) {
    throw new IngredientError(
      clash.isActive
        ? "There is already an ingredient with this name."
        : "An archived ingredient has this name. Restore it instead, or choose another name.",
      "name",
    );
  }
}

export async function createIngredient(tx: Tx, locationId: string, values: IngredientFormValues): Promise<string> {
  await assertNameIsFree(tx, locationId, values.name);
  const [created] = await tx
    .insert(ingredients)
    .values({ locationId, ...toColumns(values) })
    .returning({ id: ingredients.id });
  return created.id;
}

/**
 * An ingredient's base unit is fixed once something is measured in it:
 * a pack size, a recipe line or a stock movement. Changing g to ml would
 * silently change what all of those numbers mean.
 */
export async function baseUnitLocked(tx: Tx, locationId: string, ingredientId: string): Promise<boolean> {
  const [pack] = await tx
    .select({ id: packSizes.id })
    .from(packSizes)
    .where(and(eq(packSizes.ingredientId, ingredientId), eq(packSizes.locationId, locationId)))
    .limit(1);
  if (pack) return true;
  const [line] = await tx
    .select({ id: recipeLines.id })
    .from(recipeLines)
    .where(and(eq(recipeLines.ingredientId, ingredientId), eq(recipeLines.locationId, locationId)))
    .limit(1);
  if (line) return true;
  return hasMovements(tx, locationId, ingredientId);
}

export async function updateIngredient(
  tx: Tx,
  locationId: string,
  id: string,
  values: IngredientFormValues,
): Promise<void> {
  const current = await getIngredient(tx, locationId, id);
  if (!current) throw new IngredientError("This ingredient no longer exists.");
  if (current.baseUnit !== values.baseUnit && (await baseUnitLocked(tx, locationId, id))) {
    throw new IngredientError(
      "The unit cannot change once the ingredient has pack sizes, recipes or stock movements.",
      "baseUnit",
    );
  }
  await assertNameIsFree(tx, locationId, values.name, id);
  await tx
    .update(ingredients)
    .set(toColumns(values))
    .where(and(eq(ingredients.id, id), eq(ingredients.locationId, locationId)));
}

/** Archive or restore. Ingredients are never deleted, because movements reference them. */
export async function setIngredientActive(tx: Tx, locationId: string, id: string, isActive: boolean): Promise<void> {
  const updated = await tx
    .update(ingredients)
    .set({ isActive })
    .where(and(eq(ingredients.id, id), eq(ingredients.locationId, locationId)))
    .returning({ id: ingredients.id });
  if (updated.length === 0) throw new IngredientError("This ingredient no longer exists.");
}

async function packColumns(tx: Tx, locationId: string, ingredientId: string, values: PackSizeFormValues) {
  const ingredient = await getIngredient(tx, locationId, ingredientId);
  if (!ingredient) throw new IngredientError("This ingredient no longer exists.");
  if (!DISPLAY_UNITS[ingredient.baseUnit].some((entry) => entry.unit === values.unit)) {
    throw new IngredientError("This unit does not match the ingredient's unit.", "unit");
  }
  const clash = ingredient.packSizes.find((pack) => pack.label.toLowerCase() === values.label.toLowerCase());
  return {
    ingredient,
    clash,
    columns: {
      label: values.label,
      qtyInBaseUnit: toDbQty(toBaseUnits(values.amount, values.unit, ingredient.baseUnit)),
      isDefault: values.isDefault,
    },
  };
}

/** Only one pack size per ingredient can be the default. */
async function clearDefault(tx: Tx, locationId: string, ingredientId: string) {
  await tx
    .update(packSizes)
    .set({ isDefault: false })
    .where(
      and(eq(packSizes.ingredientId, ingredientId), eq(packSizes.locationId, locationId), eq(packSizes.isDefault, true)),
    );
}

export async function addPackSize(
  tx: Tx,
  locationId: string,
  ingredientId: string,
  values: PackSizeFormValues,
): Promise<string> {
  const { ingredient, clash, columns } = await packColumns(tx, locationId, ingredientId, values);
  if (clash) throw new IngredientError("This ingredient already has a pack size with this label.", "label");
  // The first pack size is the default one.
  const isDefault = columns.isDefault || ingredient.packSizes.length === 0;
  if (isDefault) await clearDefault(tx, locationId, ingredientId);
  const [created] = await tx
    .insert(packSizes)
    .values({ locationId, ingredientId, ...columns, isDefault })
    .returning({ id: packSizes.id });
  return created.id;
}

export async function updatePackSize(
  tx: Tx,
  locationId: string,
  ingredientId: string,
  packSizeId: string,
  values: PackSizeFormValues,
): Promise<void> {
  const { clash, columns } = await packColumns(tx, locationId, ingredientId, values);
  if (clash && clash.id !== packSizeId) {
    throw new IngredientError("This ingredient already has a pack size with this label.", "label");
  }
  if (columns.isDefault) await clearDefault(tx, locationId, ingredientId);
  const updated = await tx
    .update(packSizes)
    .set(columns)
    .where(
      and(eq(packSizes.id, packSizeId), eq(packSizes.ingredientId, ingredientId), eq(packSizes.locationId, locationId)),
    )
    .returning({ id: packSizes.id });
  if (updated.length === 0) throw new IngredientError("This pack size no longer exists.");
}

export async function deletePackSize(tx: Tx, locationId: string, packSizeId: string): Promise<void> {
  await tx.delete(packSizes).where(and(eq(packSizes.id, packSizeId), eq(packSizes.locationId, locationId)));
}
