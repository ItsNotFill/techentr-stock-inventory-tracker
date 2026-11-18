import type Decimal from "decimal.js";
import type { BaseUnit } from "@/lib/db/schema/enums";
import { DISPLAY_UNITS, packsToBase, toBaseUnits, toDbQty, toDecimal } from "./index";

/**
 * What a person types for one ingredient on the phone screens (count,
 * delivery, waste): an amount and either a display unit of the ingredient
 * (g, kg, ml, cl, l, unit) or a pack, written "pack:<pack size id>".
 */

export const PACK_UNIT_PREFIX = "pack:";

/** The largest quantity numeric(14, 3) can hold, with room to spare. */
export const MAX_QTY = "99999999999";

export type EntryIngredient = { id: string; baseUnit: BaseUnit };
export type EntryPack = { id: string; ingredientId: string; label?: string; qtyInBaseUnit: string };

export type ResolvedEntry = {
  /** In base units, rounded for storage. */
  qtyBase: string;
  /** The pack it was typed in, if any. */
  packSizeId: string | null;
  /** How many packs, as typed (rounded for storage); null when typed in a unit. */
  packCount: string | null;
};

/** A message for the person who typed the entry. */
export class EntryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntryError";
  }
}

/**
 * Converts one entry to base units: 2.5 kg -> 2500 g, 3 x "Bag 1 kg" -> 3000 g.
 * The sign is left to the caller (a count may be zero, a delivery may not).
 * Throws an EntryError when the pack or unit does not belong to the
 * ingredient, or the result is too large to store.
 */
export function resolveEntry(ingredient: EntryIngredient, packs: readonly EntryPack[], amount: Decimal, unit: string): ResolvedEntry {
  let resolved: ResolvedEntry;
  if (unit.startsWith(PACK_UNIT_PREFIX)) {
    const packId = unit.slice(PACK_UNIT_PREFIX.length);
    const pack = packs.find((candidate) => candidate.id === packId);
    if (!pack || pack.ingredientId !== ingredient.id) throw new EntryError("This pack size no longer exists.");
    resolved = { qtyBase: toDbQty(packsToBase(amount, pack.qtyInBaseUnit)), packSizeId: pack.id, packCount: toDbQty(amount) };
  } else {
    if (!DISPLAY_UNITS[ingredient.baseUnit].some((entry) => entry.unit === unit)) {
      throw new EntryError("This unit does not match the ingredient.");
    }
    resolved = { qtyBase: toDbQty(toBaseUnits(amount, unit, ingredient.baseUnit)), packSizeId: null, packCount: null };
  }
  if (toDecimal(resolved.qtyBase).abs().gt(MAX_QTY)) throw new EntryError("That number is too large.");
  return resolved;
}
