import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { ingredients, packSizes, stockMovements, type BaseUnit, type WasteReason } from "@/lib/db/schema";
import { appendMovements, enteredTimeProblem } from "@/lib/ledger";
import { formatNumber, parseQuantityInput, toDbQty, toDecimal } from "@/lib/units";
import { EntryError, resolveEntry } from "@/lib/units/entry";
import { MAX_DAYS_BACK } from "@/lib/validation/stock-entry";

/**
 * Waste: stock thrown away (expired, dropped, burnt). One negative `waste`
 * movement with a reason, through lib/ledger; it points at no other row
 * (SCHEMA.md, "Ledger rules"). Anyone on the team logs waste. A retried submit
 * with the same `clientId` writes nothing (DECISIONS.md 85).
 */

export class WasteError extends Error {
  constructor(
    message: string,
    /** The form field the message belongs to. */
    readonly field?: string,
  ) {
    super(message);
    this.name = "WasteError";
  }
}

export type NewWaste = {
  clientId: string;
  ingredientId: string;
  /** As typed: "1,5". */
  amount: string;
  /** A display unit of the ingredient, or "pack:<pack size id>". */
  unit: string;
  reason: WasteReason;
  note: string | null;
  occurredAt: Date;
};

export type LoggedWaste = {
  movementId: string;
  /** Negative, in base units. */
  qtyDelta: string;
  baseUnit: BaseUnit;
  ingredientName: string;
  alreadyLogged: boolean;
};

export async function logWaste(tx: Tx, locationId: string, userId: string, waste: NewWaste): Promise<LoggedWaste> {
  const [ingredient] = await tx
    .select({ id: ingredients.id, name: ingredients.name, baseUnit: ingredients.baseUnit, isActive: ingredients.isActive })
    .from(ingredients)
    .where(and(eq(ingredients.id, waste.ingredientId), eq(ingredients.locationId, locationId)));
  if (!ingredient) throw new WasteError("This ingredient no longer exists.", "ingredientId");

  const [earlier] = await tx
    .select({ id: stockMovements.id, qtyDelta: stockMovements.qtyDelta, createdBy: stockMovements.createdBy, type: stockMovements.type })
    .from(stockMovements)
    .where(and(eq(stockMovements.locationId, locationId), eq(stockMovements.clientId, waste.clientId)));
  if (earlier) {
    if (earlier.type !== "waste" || earlier.createdBy !== userId) {
      throw new WasteError("This waste could not be saved. Reload the page and try again.");
    }
    return {
      movementId: earlier.id,
      qtyDelta: earlier.qtyDelta,
      baseUnit: ingredient.baseUnit,
      ingredientName: ingredient.name,
      alreadyLogged: true,
    };
  }

  // Checked after the retry lookup, so a retried submit always gets its first result.
  const timeProblem = enteredTimeProblem(waste.occurredAt, MAX_DAYS_BACK);
  if (timeProblem) throw new WasteError(timeProblem, "occurredAt");
  if (!ingredient.isActive) {
    throw new WasteError(`${ingredient.name} is archived. Restore it before logging waste.`, "ingredientId");
  }
  const amount = parseQuantityInput(waste.amount);
  if (!amount) throw new WasteError(`"${waste.amount}" is not a number.`, "amount");
  const packs = await tx
    .select({ id: packSizes.id, ingredientId: packSizes.ingredientId, label: packSizes.label, qtyInBaseUnit: packSizes.qtyInBaseUnit })
    .from(packSizes)
    .where(and(eq(packSizes.locationId, locationId), eq(packSizes.ingredientId, ingredient.id)));
  let resolved;
  try {
    resolved = resolveEntry(ingredient, packs, amount, waste.unit);
  } catch (error) {
    if (error instanceof EntryError) throw new WasteError(error.message, "unit");
    throw error;
  }
  if (!toDecimal(resolved.qtyBase).gt(0)) throw new WasteError("Enter more than zero.", "amount");

  const pack = resolved.packSizeId ? packs.find((candidate) => candidate.id === resolved.packSizeId) : undefined;
  const packNote = pack && resolved.packCount ? `${formatNumber(resolved.packCount)} × ${pack.label}` : null;
  const note = [packNote, waste.note].filter(Boolean).join(" · ") || null;
  const qtyDelta = toDbQty(toDecimal(resolved.qtyBase).negated());

  const [movementId] = await appendMovements(tx, locationId, [
    {
      ingredientId: ingredient.id,
      qtyDelta,
      type: "waste",
      wasteReason: waste.reason,
      note,
      occurredAt: waste.occurredAt,
      createdBy: userId,
      clientId: waste.clientId,
    },
  ]);
  return { movementId, qtyDelta, baseUnit: ingredient.baseUnit, ingredientName: ingredient.name, alreadyLogged: false };
}

export type WasteSummary = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  baseUnit: BaseUnit;
  /** Negative, in base units. */
  qtyDelta: string;
  reason: WasteReason;
  note: string | null;
  occurredAt: Date;
  createdBy: string | null;
  /** Known to owners and managers; null for staff. */
  createdByEmail: string | null;
};

/** Waste logged in the restaurant, newest first. */
export async function listRecentWaste(tx: Tx, locationId: string, limit = 20): Promise<WasteSummary[]> {
  const rows = await tx.execute<{
    id: string;
    ingredient_id: string;
    ingredient_name: string;
    base_unit: BaseUnit;
    qty_delta: string;
    waste_reason: WasteReason;
    note: string | null;
    occurred_at: string;
    created_by: string | null;
    created_by_email: string | null;
  }>(sql`
    select sm.id, sm.ingredient_id, i.name as ingredient_name, i.base_unit, sm.qty_delta::text as qty_delta,
           sm.waste_reason, sm.note, sm.occurred_at, sm.created_by, m.email as created_by_email
    from public.stock_movements sm
    join public.ingredients i on i.id = sm.ingredient_id and i.location_id = sm.location_id
    left join public.list_location_members(${locationId}::uuid) m on m.user_id = sm.created_by
    where sm.location_id = ${locationId}::uuid and sm.type = 'waste'
    order by sm.occurred_at desc, sm.created_at desc
    limit ${limit}
  `);
  return rows.map((row) => ({
    id: row.id,
    ingredientId: row.ingredient_id,
    ingredientName: row.ingredient_name,
    baseUnit: row.base_unit,
    qtyDelta: row.qty_delta,
    reason: row.waste_reason,
    note: row.note,
    occurredAt: new Date(row.occurred_at),
    createdBy: row.created_by,
    createdByEmail: row.created_by_email,
  }));
}
