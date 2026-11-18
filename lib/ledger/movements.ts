import Decimal from "decimal.js";
import type { MovementType, WasteReason } from "@/lib/db/schema/enums";
import { toDbQty, toDecimal } from "@/lib/units";

/**
 * The shape and the rules of a stock movement, without the database.
 * Kept pure so the maths and the rules can be unit-tested.
 */

/** Tables a movement may point at through `refTable` / `refId`. */
export type MovementRefTable = "sale_lines" | "delivery_lines" | "count_lines";

export type NewMovement = {
  ingredientId: string;
  /** Base units as a decimal string. Positive adds stock, negative removes it. */
  qtyDelta: string;
  type: MovementType;
  refTable?: MovementRefTable | null;
  refId?: string | null;
  wasteReason?: WasteReason | null;
  note?: string | null;
  /** When it happened (the sale's time, the delivery's time, the count's submit time). */
  occurredAt: Date;
  createdBy: string | null;
  /** Made on the phone for a movement logged directly (waste): unique per restaurant. */
  clientId?: string | null;
};

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerError";
  }
}

/** Rounds to the three decimals the ledger stores, half away from zero, as Postgres numeric does. */
export function roundQty(value: Decimal | string): string {
  return toDbQty(value);
}

/**
 * Depletion of one recipe line by one sale line:
 * 30 Margherita x 120 g mozzarella = -3600 g. A refund (negative sale
 * quantity) gives a positive movement, because the item was not used.
 */
export function depletionDelta(saleQty: string, recipeQtyBaseUnit: string): string {
  return roundQty(toDecimal(saleQty).times(toDecimal(recipeQtyBaseUnit)).negated());
}

/** Sum of movements, for tests and small in-memory checks. The app sums in SQL. */
export function sumDeltas(deltas: string[]): string {
  return roundQty(deltas.reduce((sum, delta) => sum.plus(toDecimal(delta)), new Decimal(0)));
}

const REF_TABLE_FOR_TYPE: Partial<Record<MovementType, MovementRefTable>> = {
  sale: "sale_lines",
  delivery: "delivery_lines",
  count_adjust: "count_lines",
};

/**
 * Checks one movement against the ledger's rules and returns it with the
 * quantity rounded for storage. Throws a LedgerError when a rule is broken.
 */
export function checkMovement(movement: NewMovement): NewMovement {
  const qtyDelta = roundQty(movement.qtyDelta);
  if (toDecimal(qtyDelta).isZero()) {
    throw new LedgerError("A stock movement cannot be zero.");
  }
  if (!(movement.occurredAt instanceof Date) || Number.isNaN(movement.occurredAt.getTime())) {
    throw new LedgerError("A stock movement needs a valid time.");
  }
  const hasRef = Boolean(movement.refTable) || Boolean(movement.refId);
  if (hasRef && !(movement.refTable && movement.refId)) {
    throw new LedgerError("A stock movement reference needs both a table and an id.");
  }

  const delta = toDecimal(qtyDelta);
  switch (movement.type) {
    case "sale":
      if (movement.refTable !== REF_TABLE_FOR_TYPE.sale) {
        throw new LedgerError("A sale movement must point at its sale line.");
      }
      break;
    case "delivery":
      if (delta.isNegative()) throw new LedgerError("A delivery adds stock: its quantity must be positive.");
      // A delivery points at its delivery line. Stock written by the seed before stage 5 has none.
      if (movement.refTable && movement.refTable !== REF_TABLE_FOR_TYPE.delivery) {
        throw new LedgerError("A delivery can only point at a delivery line.");
      }
      break;
    case "waste":
      if (!delta.isNegative()) throw new LedgerError("Waste removes stock: its quantity must be negative.");
      if (!movement.wasteReason) throw new LedgerError("Waste needs a reason.");
      if (movement.refTable) throw new LedgerError("A waste movement points at nothing.");
      break;
    case "count_adjust":
      // An adjustment points at its count line. Opening stock written by the seed has no count behind it.
      if (movement.refTable && movement.refTable !== REF_TABLE_FOR_TYPE.count_adjust) {
        throw new LedgerError("A count adjustment can only point at a count line.");
      }
      break;
  }
  if (movement.type !== "waste" && movement.wasteReason) {
    throw new LedgerError("Only waste movements have a waste reason.");
  }
  return { ...movement, qtyDelta };
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Checks a time a person typed for a delivery or waste: not in the future
 * (a minute of clock drift is allowed) and at most `maxDaysBack` days ago, so
 * a mistyped year cannot reach back into old counts. Returns a message for the
 * person, or null when the time is fine.
 */
export function enteredTimeProblem(at: Date, maxDaysBack: number, now: Date = new Date()): string | null {
  if (Number.isNaN(at.getTime())) return "Enter a valid date and time.";
  if (at.getTime() > now.getTime() + MINUTE_MS) return "The time cannot be in the future.";
  if (at.getTime() < now.getTime() - maxDaysBack * DAY_MS) return `The time can be at most ${maxDaysBack} days ago.`;
  return null;
}
