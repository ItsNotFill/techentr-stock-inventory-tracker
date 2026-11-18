import type { EntryOption } from "@/lib/ingredients";
import { DISPLAY_UNITS, formatQty, packsToBase, parseQuantityInput, toBaseUnits } from "@/lib/units";
import { PACK_UNIT_PREFIX } from "@/lib/units/entry";

/** One line of a phone entry form (delivery, waste): what was typed. */
export type EntryValue = { ingredientId: string; amount: string; unit: string };

/** The unit a line starts in once an ingredient is picked: its default pack, else its first display unit. */
export function defaultUnit(ingredient: EntryOption): string {
  const pack = ingredient.packSizes.find((candidate) => candidate.isDefault);
  return pack ? `${PACK_UNIT_PREFIX}${pack.id}` : DISPLAY_UNITS[ingredient.baseUnit][0].unit;
}

/** What the typed amount is in base units ("5,000 g"), or null while it is not a number or needs no conversion. */
export function equivalent(ingredient: EntryOption, amount: string, unit: string): string | null {
  const parsed = parseQuantityInput(amount);
  if (!parsed) return null;
  if (unit.startsWith(PACK_UNIT_PREFIX)) {
    const pack = ingredient.packSizes.find((candidate) => `${PACK_UNIT_PREFIX}${candidate.id}` === unit);
    if (!pack) return null;
    return formatQty(packsToBase(parsed, pack.qtyInBaseUnit), ingredient.baseUnit);
  }
  const display = DISPLAY_UNITS[ingredient.baseUnit].find((entry) => entry.unit === unit);
  if (!display || display.factor === "1") return null;
  return formatQty(toBaseUnits(parsed, unit, ingredient.baseUnit), ingredient.baseUnit);
}

/** Ingredients grouped by storage area (areas by name, "Other" last), each group sorted by name. */
export function groupByArea(options: EntryOption[]): [string, EntryOption[]][] {
  const map = new Map<string, EntryOption[]>();
  for (const option of options) {
    const area = option.storageArea?.trim() || "Other";
    const list = map.get(area) ?? [];
    list.push(option);
    map.set(area, list);
  }
  return [...map.entries()]
    .map(([area, items]): [string, EntryOption[]] => [area, [...items].sort((a, b) => a.name.localeCompare(b.name))])
    .sort(([a], [b]) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
}
