import Decimal from "decimal.js";
import type { BaseUnit, PurchaseOrderStatus } from "@/lib/db/schema/enums";
import { isLowStock } from "@/lib/ingredients/stock";
import { formatNumber, formatQty, toDbQty, toDecimal } from "@/lib/units";

/**
 * How much to order, without the database (DECISIONS.md 97), so the rule can
 * be tested on its own:
 *
 *   only when stock is at or below the reorder point (the low-stock rule);
 *   target  = par level, or twice the reorder point without one;
 *   need    = target - stock - already on open orders;
 *   in whole default packs when there is one, else whole units for things
 *   counted in units, else the exact amount.
 */

export type SuggestInput = {
  baseUnit: BaseUnit;
  /** Theoretical stock now, base units. */
  stock: string;
  reorderPoint: string | null;
  parLevel: string | null;
  /** On draft and sent purchase orders, base units. */
  onOrder: string;
  /** The default pack, if the ingredient has one. */
  pack: { id: string; label: string; qtyInBaseUnit: string } | null;
};

export type Suggestion = {
  /** In base units. */
  qtyBaseUnit: string;
  /** Whole packs when ordered in packs. */
  packCount: string | null;
  packSizeId: string | null;
};

export function suggestQuantity(input: SuggestInput): Suggestion | null {
  if (!isLowStock(input.stock, input.reorderPoint)) return null;
  const target = input.parLevel !== null ? toDecimal(input.parLevel) : toDecimal(input.reorderPoint!).times(2);
  const need = target.minus(toDecimal(input.stock)).minus(toDecimal(input.onOrder));
  if (!need.gt(0)) return null;
  if (input.pack) {
    const packs = need.dividedBy(toDecimal(input.pack.qtyInBaseUnit)).ceil();
    return { qtyBaseUnit: toDbQty(packs.times(toDecimal(input.pack.qtyInBaseUnit))), packCount: toDbQty(packs), packSizeId: input.pack.id };
  }
  const amount = input.baseUnit === "unit" ? need.ceil() : need;
  return { qtyBaseUnit: toDbQty(amount), packCount: null, packSizeId: null };
}

/** The open statuses: what counts as "already on order". */
export const OPEN_ORDER_STATUSES: readonly PurchaseOrderStatus[] = ["draft", "sent"];

export type OrderTextLine = { name: string; baseUnit: BaseUnit; qtyBaseUnit: string; packCount: string | null; packLabel: string | null };

/**
 * The order as text for the supplier (e-mail, chat):
 *   Order from Pizzeria Demo for Caseificio Rossi
 *   - Mozzarella: 5 × Bag 1 kg (5,000 g)
 *   - Basil: 300 g
 */
export function orderText(restaurantName: string, supplierName: string, lines: OrderTextLine[], notes: string | null): string {
  const rows = lines.map((line) => {
    const amount = formatQty(line.qtyBaseUnit, line.baseUnit);
    return line.packCount && line.packLabel
      ? `- ${line.name}: ${formatNumber(line.packCount)} × ${line.packLabel} (${amount})`
      : `- ${line.name}: ${amount}`;
  });
  return [`Order from ${restaurantName} for ${supplierName}`, "", ...rows, ...(notes ? ["", notes] : [])].join("\n");
}

/** Sum of base-unit amounts, for "already on order". */
export function sumQty(values: string[]): string {
  return toDbQty(values.reduce((total, value) => total.plus(toDecimal(value)), new Decimal(0)));
}
