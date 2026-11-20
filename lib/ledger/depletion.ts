import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { menuItems, recipeLines, saleLines, sales } from "@/lib/db/schema";
import Decimal from "decimal.js";
import { composition, type Composition } from "@/lib/sub-recipes/compose";
import { loadPrepGraph } from "@/lib/sub-recipes/graph";
import { toDecimal } from "@/lib/units";
import { appendMovements } from "./index";
import { roundQty, type NewMovement } from "./movements";

/**
 * Depletion: sale lines x confirmed recipe lines -> `sale` movements.
 *
 * For every sale line that has not been depleted yet and whose menu item has
 * a confirmed recipe (and is not ignored), one movement is written per
 * ingredient: qty_delta = -(sale qty x recipe qty), dated at the sale's time.
 * A recipe line that uses a prep recipe (DECISIONS.md 96) is expanded into the
 * prep recipe's ingredients in proportion; an ingredient used both directly
 * and through a prep recipe gets one movement with the total. Rounded once, to
 * three decimals, at the end. The line is then marked with `depleted_at`.
 *
 * Lines of items without a recipe are left alone: they wait, and are depleted
 * by the same function when the item gets its recipe (the back-fill).
 * Recipe changes never touch lines that were already depleted (DECISIONS 18).
 */
export type DepletionScope =
  /** The lines of these sales (a fresh import). */
  | { saleIds: string[] }
  /** Every waiting line of one menu item (back-fill after it got a recipe). */
  | { menuItemId: string };

export type DepletionResult = { linesDepleted: number; movementsWritten: number };

const SALE_ID_CHUNK = 500;

export async function depleteSaleLines(
  tx: Tx,
  locationId: string,
  userId: string | null,
  scope: DepletionScope,
): Promise<DepletionResult> {
  if ("menuItemId" in scope) {
    return depleteWhere(tx, locationId, userId, eq(saleLines.menuItemId, scope.menuItemId));
  }
  const total: DepletionResult = { linesDepleted: 0, movementsWritten: 0 };
  for (let index = 0; index < scope.saleIds.length; index += SALE_ID_CHUNK) {
    const batch = scope.saleIds.slice(index, index + SALE_ID_CHUNK);
    const result = await depleteWhere(tx, locationId, userId, inArray(saleLines.saleId, batch));
    total.linesDepleted += result.linesDepleted;
    total.movementsWritten += result.movementsWritten;
  }
  return total;
}

async function depleteWhere(tx: Tx, locationId: string, userId: string | null, scope: SQL): Promise<DepletionResult> {
  const waiting = and(
    eq(saleLines.locationId, locationId),
    isNull(saleLines.depletedAt),
    eq(menuItems.isMapped, true),
    eq(menuItems.isIgnored, false),
    scope,
  );

  // Lock the waiting lines, so two back-fills at the same moment cannot both deplete them.
  const pending = await tx
    .select({
      saleLineId: saleLines.id,
      saleQty: saleLines.qty,
      soldAt: sales.soldAt,
      ingredientId: recipeLines.ingredientId,
      subRecipeId: recipeLines.subRecipeId,
      recipeQty: recipeLines.qtyBaseUnit,
    })
    .from(saleLines)
    .innerJoin(sales, eq(sales.id, saleLines.saleId))
    .innerJoin(menuItems, eq(menuItems.id, saleLines.menuItemId))
    .innerJoin(recipeLines, and(eq(recipeLines.menuItemId, menuItems.id), sql`${recipeLines.confirmedAt} is not null`))
    .where(waiting)
    .for("update", { of: saleLines });
  if (pending.length === 0) return { linesDepleted: 0, movementsWritten: 0 };

  // Prep recipes are loaded only when a recipe uses one.
  const graph = pending.some((row) => row.subRecipeId) ? await loadPrepGraph(tx, locationId) : null;
  const memo = new Map<string, Composition>();

  // Per sale line: the total used of each ingredient, unrounded.
  const used = new Map<string, { soldAt: Date; perIngredient: Map<string, Decimal> }>();
  for (const row of pending) {
    const line = used.get(row.saleLineId) ?? { soldAt: row.soldAt, perIngredient: new Map<string, Decimal>() };
    used.set(row.saleLineId, line);
    const amount = toDecimal(row.saleQty).times(toDecimal(row.recipeQty));
    const add = (ingredientId: string, qty: Decimal) =>
      line.perIngredient.set(ingredientId, (line.perIngredient.get(ingredientId) ?? new Decimal(0)).plus(qty));
    if (row.ingredientId) add(row.ingredientId, amount);
    else if (row.subRecipeId && graph) {
      for (const [ingredientId, perUnit] of composition(graph, row.subRecipeId, memo)) add(ingredientId, amount.times(perUnit));
    }
  }

  const movements: NewMovement[] = [];
  for (const [saleLineId, line] of used) {
    for (const [ingredientId, total] of line.perIngredient) {
      // Used stock is negative; a refund (negative sale quantity) gives it back.
      const qtyDelta = roundQty(total.negated());
      // A product that rounds to nothing (0.2 of an item using 0.001 g) moves no stock.
      if (toDecimal(qtyDelta).isZero()) continue;
      movements.push({
        ingredientId,
        qtyDelta,
        type: "sale",
        refTable: "sale_lines",
        refId: saleLineId,
        occurredAt: line.soldAt,
        createdBy: userId,
      });
    }
  }
  const lineIds = new Set(used.keys());
  const written = await appendMovements(tx, locationId, movements);

  const ids = [...lineIds];
  for (let index = 0; index < ids.length; index += SALE_ID_CHUNK) {
    await tx
      .update(saleLines)
      .set({ depletedAt: new Date() })
      .where(and(eq(saleLines.locationId, locationId), inArray(saleLines.id, ids.slice(index, index + SALE_ID_CHUNK))));
  }
  return { linesDepleted: ids.length, movementsWritten: written.length };
}
