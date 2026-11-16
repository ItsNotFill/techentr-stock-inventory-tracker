import { and, asc, eq, inArray, isNull, ne, notInArray, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { ingredients, menuItems, recipeLines, saleLines, sales, type BaseUnit, type MenuItem } from "@/lib/db/schema";
import { depleteSaleLines } from "@/lib/ledger/depletion";
import { DISPLAY_UNITS, toBaseUnits, toDbMoney, toDbQty, toDecimal } from "@/lib/units";
import type { MenuItemFormValues, RecipeLineInput } from "@/lib/validation/menu";

/**
 * Menu items and recipes. Every function takes a transaction from `withUser`,
 * so RLS applies, and filters by location as well.
 *
 * Rules (DECISIONS.md 17, 18, 22):
 * - Only confirmed recipe lines deplete stock. Lines saved by hand are confirmed on save.
 * - `is_mapped` is true exactly when the item has at least one confirmed line.
 * - An ignored item uses no stock and cannot have a recipe at the same time.
 * - A recipe change applies to future sales only.
 */

export class MenuError extends Error {
  constructor(
    message: string,
    /** The form field the message belongs to, if any (`lines.2.amount` for a recipe line). */
    readonly field?: string,
  ) {
    super(message);
    this.name = "MenuError";
  }
}

export type MenuItemSummary = MenuItem & {
  /** Confirmed recipe lines. */
  lineCount: number;
  /** AI draft lines waiting for confirmation. */
  draftLineCount: number;
  /** Euros of ingredients in one sale, from confirmed lines at today's costs. Null without a recipe. */
  recipeCost: string | null;
};

export type RecipeLineDetail = {
  id: string;
  ingredientId: string | null;
  ingredientName: string | null;
  baseUnit: BaseUnit | null;
  costPerBaseUnit: string | null;
  ingredientActive: boolean | null;
  draftIngredientName: string | null;
  draftBaseUnit: BaseUnit | null;
  qtyBaseUnit: string;
  source: "manual" | "ai";
  confirmed: boolean;
};

export type MenuItemDetail = MenuItem & { lines: RecipeLineDetail[] };

export async function listMenuItems(tx: Tx, locationId: string): Promise<MenuItemSummary[]> {
  const items = await tx
    .select()
    .from(menuItems)
    .where(eq(menuItems.locationId, locationId))
    .orderBy(asc(menuItems.kind), asc(sql`lower(${menuItems.category})`), asc(sql`lower(${menuItems.displayName})`));

  // The sums are done in SQL on numeric columns, so they are exact.
  const totals = await tx
    .select({
      menuItemId: recipeLines.menuItemId,
      lineCount: sql<number>`count(*) filter (where ${recipeLines.confirmedAt} is not null)::int`,
      draftLineCount: sql<number>`count(*) filter (where ${recipeLines.confirmedAt} is null)::int`,
      recipeCost: sql<string | null>`(sum(${recipeLines.qtyBaseUnit} * ${ingredients.costPerBaseUnit}) filter (where ${recipeLines.confirmedAt} is not null))::text`,
    })
    .from(recipeLines)
    .leftJoin(ingredients, eq(ingredients.id, recipeLines.ingredientId))
    .where(eq(recipeLines.locationId, locationId))
    .groupBy(recipeLines.menuItemId);
  const totalsByItem = new Map(totals.map((row) => [row.menuItemId, row]));

  return items.map((item) => {
    const total = totalsByItem.get(item.id);
    return {
      ...item,
      lineCount: total?.lineCount ?? 0,
      draftLineCount: total?.draftLineCount ?? 0,
      recipeCost: total?.recipeCost ? toDbMoney(total.recipeCost) : null,
    };
  });
}

export type UnmappedQueueEntry = {
  id: string;
  posName: string;
  displayName: string;
  posItemId: string | null;
  /** Sale lines waiting for this item's recipe. */
  waitingLines: number;
  /** Units sold on those lines (refunds subtract). */
  waitingQty: string;
  /** Most recent sale among the waiting lines, or null when it was never sold. */
  lastSoldAt: Date | null;
};

/**
 * The unmapped queue: items seen in sales (or added by hand) that have no
 * recipe and are not ignored. Items with the most waiting sales come first.
 */
export async function listUnmappedQueue(tx: Tx, locationId: string): Promise<UnmappedQueueEntry[]> {
  const waitingLines = sql<number>`count(${saleLines.id})::int`;
  return tx
    .select({
      id: menuItems.id,
      posName: menuItems.posName,
      displayName: menuItems.displayName,
      posItemId: menuItems.posItemId,
      waitingLines,
      waitingQty: sql<string>`coalesce(sum(${saleLines.qty}), 0)::numeric(14, 3)::text`,
      lastSoldAt: sql<Date | null>`max(${sales.soldAt})`.mapWith((value) => (value ? new Date(value) : null)),
    })
    .from(menuItems)
    .leftJoin(
      saleLines,
      and(eq(saleLines.menuItemId, menuItems.id), eq(saleLines.locationId, locationId), isNull(saleLines.depletedAt)),
    )
    .leftJoin(sales, eq(sales.id, saleLines.saleId))
    .where(and(eq(menuItems.locationId, locationId), eq(menuItems.isMapped, false), eq(menuItems.isIgnored, false)))
    .groupBy(menuItems.id)
    .orderBy(sql`count(${saleLines.id}) desc`, asc(sql`lower(${menuItems.displayName})`));
}

export async function getMenuItem(tx: Tx, locationId: string, id: string): Promise<MenuItemDetail | null> {
  const [item] = await tx
    .select()
    .from(menuItems)
    .where(and(eq(menuItems.id, id), eq(menuItems.locationId, locationId)));
  if (!item) return null;

  const lines = await tx
    .select({
      id: recipeLines.id,
      ingredientId: recipeLines.ingredientId,
      ingredientName: ingredients.name,
      baseUnit: ingredients.baseUnit,
      costPerBaseUnit: ingredients.costPerBaseUnit,
      ingredientActive: ingredients.isActive,
      draftIngredientName: recipeLines.draftIngredientName,
      draftBaseUnit: recipeLines.draftBaseUnit,
      qtyBaseUnit: recipeLines.qtyBaseUnit,
      source: recipeLines.source,
      confirmedAt: recipeLines.confirmedAt,
    })
    .from(recipeLines)
    .leftJoin(ingredients, eq(ingredients.id, recipeLines.ingredientId))
    .where(and(eq(recipeLines.menuItemId, id), eq(recipeLines.locationId, locationId)))
    .orderBy(asc(recipeLines.createdAt), asc(recipeLines.id));

  return {
    ...item,
    lines: lines.map(({ confirmedAt, ...line }) => ({ ...line, confirmed: confirmedAt !== null })),
  };
}

/** Euros of ingredients in one sale of an item, from its confirmed lines. */
export function recipeCost(lines: Pick<RecipeLineDetail, "qtyBaseUnit" | "costPerBaseUnit" | "confirmed">[]): string {
  const total = lines
    .filter((line) => line.confirmed && line.costPerBaseUnit !== null)
    .reduce((sum, line) => sum.plus(toDecimal(line.qtyBaseUnit).times(line.costPerBaseUnit!)), toDecimal("0"));
  return toDbMoney(total);
}

function itemColumns(values: MenuItemFormValues) {
  return {
    posName: values.posName,
    posItemId: values.posItemId,
    displayName: values.displayName ?? values.posName,
    kind: values.kind,
    category: values.category,
    price: values.price === null ? null : toDbMoney(values.price),
  };
}

/** The POS id is unique per location; without one, the POS name is. */
async function assertItemIsUnique(tx: Tx, locationId: string, values: MenuItemFormValues, exceptId?: string) {
  const notSelf = exceptId ? ne(menuItems.id, exceptId) : undefined;
  if (values.posItemId) {
    const [clash] = await tx
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(and(eq(menuItems.locationId, locationId), eq(menuItems.posItemId, values.posItemId), notSelf));
    if (clash) throw new MenuError("Another item already has this POS id.", "posItemId");
    return;
  }
  const [clash] = await tx
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(
      and(
        eq(menuItems.locationId, locationId),
        isNull(menuItems.posItemId),
        sql`lower(${menuItems.posName}) = lower(${values.posName})`,
        notSelf,
      ),
    );
  if (clash) throw new MenuError("There is already an item with this POS name.", "posName");
}

export async function createMenuItem(tx: Tx, locationId: string, values: MenuItemFormValues): Promise<string> {
  await assertItemIsUnique(tx, locationId, values);
  const [created] = await tx
    .insert(menuItems)
    .values({ locationId, ...itemColumns(values) })
    .returning({ id: menuItems.id });
  return created.id;
}

export async function updateMenuItem(
  tx: Tx,
  locationId: string,
  id: string,
  values: MenuItemFormValues,
): Promise<void> {
  await assertItemIsUnique(tx, locationId, values, id);
  const updated = await tx
    .update(menuItems)
    .set(itemColumns(values))
    .where(and(eq(menuItems.id, id), eq(menuItems.locationId, locationId)))
    .returning({ id: menuItems.id });
  if (updated.length === 0) throw new MenuError("This item no longer exists.");
}

/** Ignore an item that uses no stock, or bring it back into the unmapped queue. */
export async function setMenuItemIgnored(tx: Tx, locationId: string, id: string, ignored: boolean): Promise<void> {
  const [item] = await tx
    .select({ isMapped: menuItems.isMapped })
    .from(menuItems)
    .where(and(eq(menuItems.id, id), eq(menuItems.locationId, locationId)))
    .for("update");
  if (!item) throw new MenuError("This item no longer exists.");
  if (ignored && item.isMapped) {
    throw new MenuError("This item has a recipe. Remove the recipe lines first, then ignore it.");
  }
  await tx
    .update(menuItems)
    .set({ isIgnored: ignored })
    .where(and(eq(menuItems.id, id), eq(menuItems.locationId, locationId)));
}

export async function deleteMenuItem(tx: Tx, locationId: string, id: string): Promise<void> {
  const deleted = await tx
    .delete(menuItems)
    .where(and(eq(menuItems.id, id), eq(menuItems.locationId, locationId)))
    .returning({ id: menuItems.id });
  if (deleted.length === 0) throw new MenuError("This item no longer exists.");
}

/**
 * Saves an item's whole recipe: the lines given replace what was there.
 * Every saved line is confirmed. With at least one line the item becomes
 * mapped (and is no longer ignored); with none it goes back to unmapped.
 *
 * Sales of the item that were imported while it had no recipe are depleted
 * now, dated at their own sale time (the back-fill). Sales that were already
 * depleted keep the amounts of the recipe they were sold under.
 */
export async function saveRecipe(
  tx: Tx,
  locationId: string,
  userId: string,
  menuItemId: string,
  lines: RecipeLineInput[],
): Promise<{ isMapped: boolean; backfilledLines: number }> {
  const [item] = await tx
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(and(eq(menuItems.id, menuItemId), eq(menuItems.locationId, locationId)))
    .for("update");
  if (!item) throw new MenuError("This item no longer exists.");

  const ingredientIds = lines.map((line) => line.ingredientId);
  const known = ingredientIds.length
    ? await tx
        .select({ id: ingredients.id, baseUnit: ingredients.baseUnit, isActive: ingredients.isActive })
        .from(ingredients)
        .where(and(eq(ingredients.locationId, locationId), inArray(ingredients.id, ingredientIds)))
    : [];
  const ingredientById = new Map(known.map((row) => [row.id, row]));

  const seen = new Set<string>();
  const rows = lines.map((line, index) => {
    const ingredient = ingredientById.get(line.ingredientId);
    if (!ingredient) throw new MenuError("This ingredient no longer exists.", `lines.${index}.ingredientId`);
    if (!ingredient.isActive) {
      throw new MenuError("This ingredient is archived. Restore it or remove the line.", `lines.${index}.ingredientId`);
    }
    if (seen.has(line.ingredientId)) {
      throw new MenuError("This ingredient is already in the recipe.", `lines.${index}.ingredientId`);
    }
    seen.add(line.ingredientId);
    if (!DISPLAY_UNITS[ingredient.baseUnit].some((entry) => entry.unit === line.unit)) {
      throw new MenuError("This unit does not match the ingredient's unit.", `lines.${index}.unit`);
    }
    const qtyBaseUnit = toDbQty(toBaseUnits(line.amount, line.unit, ingredient.baseUnit));
    if (toDecimal(qtyBaseUnit).lte(0)) {
      throw new MenuError("This amount is too small to store.", `lines.${index}.amount`);
    }
    return { locationId, menuItemId, ingredientId: line.ingredientId, qtyBaseUnit };
  });

  // Drop what is no longer in the recipe, unconfirmed AI drafts included.
  await tx
    .delete(recipeLines)
    .where(
      and(
        eq(recipeLines.menuItemId, menuItemId),
        eq(recipeLines.locationId, locationId),
        ingredientIds.length
          ? sql`(${recipeLines.ingredientId} is null or ${notInArray(recipeLines.ingredientId, ingredientIds)})`
          : undefined,
      ),
    );

  for (const row of rows) {
    await tx
      .insert(recipeLines)
      // clock_timestamp(), not now(): now() is the same for every line saved in one
      // transaction, and the editor shows lines in the order they were added.
      .values({ ...row, source: "manual", confirmedAt: new Date(), confirmedBy: userId, createdAt: sql`clock_timestamp()` })
      .onConflictDoUpdate({
        target: [recipeLines.menuItemId, recipeLines.ingredientId],
        // A line that came from AI keeps its source; it is confirmed now if it was not before.
        set: {
          qtyBaseUnit: row.qtyBaseUnit,
          confirmedAt: sql`coalesce(${recipeLines.confirmedAt}, now())`,
          confirmedBy: sql`coalesce(${recipeLines.confirmedBy}, ${userId}::uuid)`,
          draftIngredientName: null,
          draftBaseUnit: null,
        },
      });
  }

  const isMapped = rows.length > 0;
  await tx
    .update(menuItems)
    .set(isMapped ? { isMapped: true, isIgnored: false } : { isMapped: false })
    .where(and(eq(menuItems.id, menuItemId), eq(menuItems.locationId, locationId)));

  const backfill = isMapped
    ? await depleteSaleLines(tx, locationId, userId, { menuItemId })
    : { linesDepleted: 0, movementsWritten: 0 };
  return { isMapped, backfilledLines: backfill.linesDepleted };
}
