import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { countLines, deliveryLines, saleLines, stockMovements } from "@/lib/db/schema";
import { checkMovement, LedgerError, type MovementRefTable, type NewMovement } from "./movements";

export { checkMovement, depletionDelta, enteredTimeProblem, LedgerError, roundQty, sumDeltas } from "./movements";
export type { MovementRefTable, NewMovement } from "./movements";

/**
 * The ledger. This module is the ONLY code that inserts into stock_movements.
 * Stock is never stored: it is always the sum of the movements.
 *
 *   stock now        = SUM(qty_delta)
 *   stock at time T  = SUM(qty_delta) WHERE occurred_at <= T
 *
 * Every function takes a transaction from `withUser`, so RLS decides who may
 * append what (sales and count adjustments: owner or manager; deliveries and
 * waste: any member).
 */

const INSERT_CHUNK = 500;

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

/**
 * `ref_id` has no foreign key, because it points at different tables. So the
 * ledger checks here that every referenced row exists in the same location.
 */
async function assertRefsBelongToLocation(tx: Tx, locationId: string, movements: NewMovement[]) {
  const idsByTable = new Map<MovementRefTable, Set<string>>();
  for (const movement of movements) {
    if (!movement.refTable || !movement.refId) continue;
    const ids = idsByTable.get(movement.refTable) ?? new Set<string>();
    ids.add(movement.refId);
    idsByTable.set(movement.refTable, ids);
  }

  const tables = { sale_lines: saleLines, count_lines: countLines, delivery_lines: deliveryLines } as const;
  for (const [table, ids] of idsByTable) {
    const target = tables[table];
    let found = 0;
    for (const batch of chunks([...ids], INSERT_CHUNK)) {
      const [row] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(target)
        .where(and(eq(target.locationId, locationId), inArray(target.id, batch)));
      found += row.count;
    }
    if (found !== ids.size) {
      throw new LedgerError("A stock movement points at a row that is not in this restaurant.");
    }
  }
}

/**
 * Appends movements to the ledger. Returns the ids of the new rows.
 *
 * Then applies the late-movement rule (SCHEMA.md, "Ledger rules"): a movement
 * dated at or before an approved count of the same ingredient gets an
 * offsetting count adjustment on that count, so stock after the count stays
 * what was counted. The database function does it, because the person
 * recording a late delivery may be staff (migration 0011).
 */
export async function appendMovements(tx: Tx, locationId: string, movements: NewMovement[]): Promise<string[]> {
  if (movements.length === 0) return [];
  const checked = movements.map(checkMovement);
  await assertRefsBelongToLocation(tx, locationId, checked);

  const ids: string[] = [];
  for (const batch of chunks(checked, INSERT_CHUNK)) {
    const inserted = await tx
      .insert(stockMovements)
      .values(
        batch.map((movement) => ({
          locationId,
          ingredientId: movement.ingredientId,
          qtyDelta: movement.qtyDelta,
          type: movement.type,
          refTable: movement.refTable ?? null,
          refId: movement.refId ?? null,
          wasteReason: movement.wasteReason ?? null,
          note: movement.note ?? null,
          occurredAt: movement.occurredAt,
          createdBy: movement.createdBy,
        })),
      )
      .returning({ id: stockMovements.id });
    ids.push(...inserted.map((row) => row.id));
  }
  for (const batch of chunks(ids, INSERT_CHUNK)) {
    const list = sql.join(
      batch.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    await tx.execute(sql`select public.apply_late_corrections(array[${list}])`);
  }
  return ids;
}

export type StockByIngredient = Map<string, string>;

/** Stock of an ingredient from a stock map; ingredients without movements have none. */
export function stockOf(stock: StockByIngredient, ingredientId: string): string {
  return stock.get(ingredientId) ?? "0.000";
}

async function sumStock(tx: Tx, locationId: string, at: Date | null, ingredientIds?: string[]): Promise<StockByIngredient> {
  if (ingredientIds && ingredientIds.length === 0) return new Map();
  // The sum is done by Postgres on numeric values, so it is exact.
  const rows = await tx
    .select({
      ingredientId: stockMovements.ingredientId,
      stock: sql<string>`sum(${stockMovements.qtyDelta})::numeric(14, 3)::text`,
    })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.locationId, locationId),
        at ? lte(stockMovements.occurredAt, at) : undefined,
        ingredientIds ? inArray(stockMovements.ingredientId, ingredientIds) : undefined,
      ),
    )
    .groupBy(stockMovements.ingredientId);
  return new Map(rows.map((row) => [row.ingredientId, row.stock]));
}

/** Theoretical stock now, per ingredient, in base units. */
export function stockNow(tx: Tx, locationId: string, ingredientIds?: string[]): Promise<StockByIngredient> {
  return sumStock(tx, locationId, null, ingredientIds);
}

/** Theoretical stock as it was at a moment: movements that happened at or before `at`. */
export function stockAt(tx: Tx, locationId: string, at: Date, ingredientIds?: string[]): Promise<StockByIngredient> {
  return sumStock(tx, locationId, at, ingredientIds);
}

/** True when the ingredient has any movement. Its base unit is then fixed. */
export async function hasMovements(tx: Tx, locationId: string, ingredientId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: stockMovements.id })
    .from(stockMovements)
    .where(and(eq(stockMovements.locationId, locationId), eq(stockMovements.ingredientId, ingredientId)))
    .limit(1);
  return Boolean(row);
}
