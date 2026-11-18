import { toDecimal, type Quantity } from "@/lib/units";

/**
 * Stock rules that do not need the database, so screens can use them too.
 *
 * An ingredient is low when its theoretical stock is at or below its reorder
 * point (DECISIONS.md 86). Without a reorder point it is never low.
 */
export function isLowStock(stock: Quantity, reorderPoint: Quantity | null): boolean {
  return reorderPoint !== null && toDecimal(stock).lte(toDecimal(reorderPoint));
}

/** How much brings stock back up to the par level; null without a par level or when nothing is needed. */
export function quantityToPar(stock: Quantity, parLevel: Quantity | null): string | null {
  if (parLevel === null) return null;
  const missing = toDecimal(parLevel).minus(toDecimal(stock));
  return missing.gt(0) ? missing.toFixed(3) : null;
}
