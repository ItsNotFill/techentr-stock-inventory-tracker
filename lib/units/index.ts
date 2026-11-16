import Decimal from "decimal.js";
import type { BaseUnit } from "@/lib/db/schema/enums";

/**
 * Unit and pack conversion. Quantities are stored in base units (g, ml, unit)
 * as numeric(14, 3); packs and larger units exist on screen only.
 *
 * Everything here works on decimal.js values and strings. Never pass a JS
 * number that came out of arithmetic: 0.1 + 0.2 is not 0.3.
 */

export type { BaseUnit } from "@/lib/db/schema/enums";
export type Quantity = Decimal | string;

/** Decimal places the database keeps. */
export const QTY_SCALE = 3;
export const UNIT_COST_SCALE = 6;
export const MONEY_SCALE = 2;

/** Units a person may type or read, with how many base units one of them is. */
export const DISPLAY_UNITS = {
  g: [
    { unit: "g", factor: "1" },
    { unit: "kg", factor: "1000" },
  ],
  ml: [
    { unit: "ml", factor: "1" },
    { unit: "cl", factor: "10" },
    { unit: "l", factor: "1000" },
  ],
  unit: [{ unit: "unit", factor: "1" }],
} as const satisfies Record<BaseUnit, readonly { unit: string; factor: string }[]>;

export type DisplayUnit = (typeof DISPLAY_UNITS)[BaseUnit][number]["unit"];

/** Parses a numeric string from the database or a Decimal. Throws on anything that is not a finite number. */
export function toDecimal(value: Quantity): Decimal {
  const decimal = new Decimal(value);
  if (!decimal.isFinite()) {
    throw new Error(`Not a finite number: ${String(value)}`);
  }
  return decimal;
}

/**
 * Parses what a person typed: "1.5", "1,5", " 12 ", "2 600". Returns null when
 * it is not a number. A comma is read as the decimal separator.
 */
export function parseQuantityInput(input: string): Decimal | null {
  const cleaned = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  return new Decimal(cleaned);
}

function factorFor(baseUnit: BaseUnit, displayUnit: string): Decimal {
  const match = DISPLAY_UNITS[baseUnit].find((entry) => entry.unit === displayUnit);
  if (!match) {
    throw new Error(`Cannot convert ${displayUnit} to ${baseUnit}`);
  }
  return new Decimal(match.factor);
}

/** 2.6 kg -> 2600 (g). */
export function toBaseUnits(amount: Quantity, displayUnit: string, baseUnit: BaseUnit): Decimal {
  return toDecimal(amount).times(factorFor(baseUnit, displayUnit));
}

/** 2600 (g) -> 2.6 (kg). */
export function fromBaseUnits(qtyBase: Quantity, displayUnit: string, baseUnit: BaseUnit): Decimal {
  return toDecimal(qtyBase).dividedBy(factorFor(baseUnit, displayUnit));
}

/** 2 cases of 12,000 ml -> 24,000 ml. */
export function packsToBase(packCount: Quantity, qtyInBaseUnit: Quantity): Decimal {
  return toDecimal(packCount).times(toDecimal(qtyInBaseUnit));
}

/** 24,000 ml in cases of 12,000 ml -> 2. May be fractional. */
export function baseToPacks(qtyBase: Quantity, qtyInBaseUnit: Quantity): Decimal {
  const packSize = toDecimal(qtyInBaseUnit);
  if (packSize.lte(0)) {
    throw new Error("A pack size must be greater than zero");
  }
  return toDecimal(qtyBase).dividedBy(packSize);
}

/** Cost per base unit from a price for an amount: EUR 8 for 1000 g -> 0.008 per g. */
export function costPerBaseUnit(price: Quantity, qtyBase: Quantity): Decimal {
  const quantity = toDecimal(qtyBase);
  if (quantity.lte(0)) {
    throw new Error("The quantity must be greater than zero");
  }
  return toDecimal(price).dividedBy(quantity);
}

/** Value in euros of a quantity: -500 g at 0.008 per g -> -4. */
export function valueOf(qtyBase: Quantity, unitCost: Quantity): Decimal {
  return toDecimal(qtyBase).times(toDecimal(unitCost));
}

// Database strings. Rounding is half-up, away from zero for negatives.

function toFixedScale(value: Quantity, scale: number): string {
  const rounded = toDecimal(value).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
  // Never "-0.00": a negative amount that rounds to nothing is simply zero.
  return (rounded.isZero() ? new Decimal(0) : rounded).toFixed(scale);
}

/** numeric(14, 3) string for a quantity. */
export function toDbQty(value: Quantity): string {
  return toFixedScale(value, QTY_SCALE);
}

/** numeric(12, 6) string for a cost per base unit. */
export function toDbUnitCost(value: Quantity): string {
  return toFixedScale(value, UNIT_COST_SCALE);
}

/** numeric(12, 2) string for an amount of money. */
export function toDbMoney(value: Quantity): string {
  return toFixedScale(value, MONEY_SCALE);
}

// Formatting for the screen. Digits are grouped by hand so that no JS number
// (and no float) is involved.

function groupThousands(fixed: string): string {
  const negative = fixed.startsWith("-");
  const [whole, fraction] = (negative ? fixed.slice(1) : fixed).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "−" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
}

/** "2,600" from "2600.000": at most three decimals, trailing zeros dropped. */
export function formatNumber(value: Quantity, maxDecimals = QTY_SCALE): string {
  const rounded = toDecimal(value).toDecimalPlaces(maxDecimals, Decimal.ROUND_HALF_UP);
  return groupThousands(rounded.toFixed());
}

const UNIT_LABELS: Record<BaseUnit, { one: string; many: string }> = {
  g: { one: "g", many: "g" },
  ml: { one: "ml", many: "ml" },
  unit: { one: "unit", many: "units" },
};

/** "2,600 g", "750 ml", "1 unit", "12 units". Always in the base unit, as stored. */
export function formatQty(qtyBase: Quantity, baseUnit: BaseUnit): string {
  const quantity = toDecimal(qtyBase);
  const label = quantity.abs().eq(1) ? UNIT_LABELS[baseUnit].one : UNIT_LABELS[baseUnit].many;
  return `${formatNumber(quantity)} ${label}`;
}

/** "€4.00", "−€4.00". */
export function formatMoney(amount: Quantity): string {
  const rounded = toDecimal(amount).toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP);
  const digits = groupThousands(rounded.abs().toFixed(MONEY_SCALE));
  return `${rounded.isNegative() && !rounded.isZero() ? "−" : ""}€${digits}`;
}

/**
 * Cost shown per a readable amount instead of per base unit:
 * 0.008 per g -> "€8.00 per kg"; 0.0125 per ml -> "€12.50 per l"; 0.35 per unit -> "€0.35 per unit".
 */
export function formatUnitCost(unitCost: Quantity, baseUnit: BaseUnit): string {
  const larger = { g: { unit: "kg", factor: 1000 }, ml: { unit: "l", factor: 1000 }, unit: { unit: "unit", factor: 1 } }[
    baseUnit
  ];
  return `${formatMoney(toDecimal(unitCost).times(larger.factor))} per ${larger.unit}`;
}
