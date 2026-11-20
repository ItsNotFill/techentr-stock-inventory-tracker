import type { EntryValue } from "@/components/stock-entry/entry";
import { DISPLAY_UNITS, formatNumber, formatQty, toDecimal, type BaseUnit } from "@/lib/units";
import { PACK_UNIT_PREFIX } from "@/lib/units/entry";

export type OrderLineLike = {
  ingredientId: string;
  baseUnit: BaseUnit;
  packSizeId: string | null;
  packLabel: string | null;
  packCount: string | null;
  qtyBaseUnit: string;
};

/** A saved line as the entry form shows it: in packs when it was ordered in packs, else in the base unit. */
export function lineToEntry(line: OrderLineLike): EntryValue {
  if (line.packSizeId && line.packCount) {
    return { ingredientId: line.ingredientId, amount: toDecimal(line.packCount).toFixed(), unit: `${PACK_UNIT_PREFIX}${line.packSizeId}` };
  }
  const base = DISPLAY_UNITS[line.baseUnit].find((entry) => entry.factor === "1") ?? DISPLAY_UNITS[line.baseUnit][0];
  return { ingredientId: line.ingredientId, amount: toDecimal(line.qtyBaseUnit).toFixed(), unit: base.unit };
}

/** "7 × Bag 1 kg (7,000 g)" for a pack line, else "250 g". */
export function quantityText(line: Pick<OrderLineLike, "baseUnit" | "packLabel" | "packCount" | "qtyBaseUnit">): string {
  const stored = formatQty(line.qtyBaseUnit, line.baseUnit);
  return line.packCount && line.packLabel ? `${formatNumber(line.packCount)} × ${line.packLabel} (${stored})` : stored;
}
