import Decimal from "decimal.js";
import { toDbMoney, toDbQty, toDecimal } from "@/lib/units";

/**
 * Unexplained usage (called "variance" in the spec, never in the UI).
 * Pure functions, safe to import anywhere.
 *
 *   unexplained qty   = counted - (theoretical + late adjustments)
 *   unexplained value = unexplained qty x the cost per base unit at approval
 *
 * Negative means stock went missing: more was used than sales, waste and
 * deliveries explain. It always equals the sum of the count adjustments that
 * point at the line (tests/integration/counts.test.ts asserts this).
 */

export type VarianceInput = {
  countedQty: string;
  theoreticalQty: string | null;
  lateAdjustQty: string;
  unitCost: string | null;
};

/** In base units, as a numeric(14, 3) string. Null while there is no theoretical stock yet. */
export function unexplainedQty(line: Pick<VarianceInput, "countedQty" | "theoreticalQty" | "lateAdjustQty">): string | null {
  if (line.theoreticalQty === null) return null;
  return toDbQty(toDecimal(line.countedQty).minus(toDecimal(line.theoreticalQty).plus(toDecimal(line.lateAdjustQty))));
}

/** In euros, rounded to cents. Null without a theoretical stock or a cost. */
export function unexplainedValue(line: VarianceInput): string | null {
  const qty = unexplainedQty(line);
  if (qty === null || line.unitCost === null) return null;
  return toDbMoney(toDecimal(qty).times(toDecimal(line.unitCost)));
}

/** Total in euros over lines, opening counts left out (DECISIONS.md 13). */
export function totalUnexplainedValue(lines: (VarianceInput & { isOpening: boolean })[]): string {
  const total = lines
    .filter((line) => !line.isOpening)
    .reduce((sum, line) => sum.plus(toDecimal(unexplainedValue(line) ?? "0")), new Decimal(0));
  return toDbMoney(total);
}
