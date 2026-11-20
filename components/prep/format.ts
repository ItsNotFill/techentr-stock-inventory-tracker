import { DEFAULT_DISPLAY_UNIT } from "@/components/ingredients/units";
import { formatNumber, formatQty, fromBaseUnits, type BaseUnit } from "@/lib/units";

/** "5 l" from 5000 ml; "12 units" for pieces. Shown in the larger unit people think in. */
export function formatMakes(yieldQty: string, baseUnit: BaseUnit): string {
  if (baseUnit === "unit") return formatQty(yieldQty, baseUnit);
  const unit = DEFAULT_DISPLAY_UNIT[baseUnit];
  return `${formatNumber(fromBaseUnits(yieldQty, unit, baseUnit))} ${unit}`;
}

/** "3 recipes": the menu items and prep recipes that use it. */
export function formatUsedBy(count: number): string {
  if (count === 0) return "–";
  return count === 1 ? "1 recipe" : `${count} recipes`;
}
