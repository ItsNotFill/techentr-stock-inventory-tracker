import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { deliveries, deliveryLines, ingredients, packSizes, type BaseUnit } from "@/lib/db/schema";
import { appendMovements, enteredTimeProblem, type NewMovement } from "@/lib/ledger";
import { formatNumber, parseQuantityInput, toDecimal } from "@/lib/units";
import { EntryError, resolveEntry } from "@/lib/units/entry";
import { MAX_DAYS_BACK, type StockEntry } from "@/lib/validation/stock-entry";

/**
 * Deliveries. Every function takes a transaction from `withUser`, so RLS
 * applies: anyone on the team logs a manual delivery.
 *
 * A manual delivery is written as a draft, given its lines and confirmed in
 * one transaction; each line then writes one `delivery` movement dated at the
 * delivery time (DECISIONS.md 83). A delivery dated before an approved count
 * is corrected by the ledger's late-movement rule, like any other movement.
 */

export class DeliveryError extends Error {
  constructor(
    message: string,
    /** The form field the message belongs to, e.g. `lines.0.amount`. */
    readonly field?: string,
  ) {
    super(message);
    this.name = "DeliveryError";
  }
}

export type NewDelivery = {
  /** Made by the phone when the form opens. The same id twice is one delivery. */
  clientId: string;
  supplierName: string | null;
  /** When the goods arrived. */
  deliveredAt: Date;
  lines: StockEntry[];
};

export type LoggedDelivery = {
  id: string;
  lineCount: number;
  /** True when this client id was logged before (a retried submit): nothing new was written. */
  alreadyLogged: boolean;
};

type PreparedLine = {
  id: string;
  ingredientId: string;
  packSizeId: string | null;
  packCount: string | null;
  qtyBaseUnit: string;
  note: string | null;
};

/** Turns the typed lines into base-unit lines. Errors name the line: `lines.<index>.amount`. */
async function prepareLines(tx: Tx, locationId: string, lines: StockEntry[]): Promise<PreparedLine[]> {
  const ids = [...new Set(lines.map((line) => line.ingredientId))];
  const known = await tx
    .select({ id: ingredients.id, baseUnit: ingredients.baseUnit, isActive: ingredients.isActive, name: ingredients.name })
    .from(ingredients)
    .where(and(eq(ingredients.locationId, locationId), inArray(ingredients.id, ids)));
  const ingredientById = new Map(known.map((row) => [row.id, row]));
  const packs = await tx
    .select({ id: packSizes.id, ingredientId: packSizes.ingredientId, label: packSizes.label, qtyInBaseUnit: packSizes.qtyInBaseUnit })
    .from(packSizes)
    .where(and(eq(packSizes.locationId, locationId), inArray(packSizes.ingredientId, ids)));

  return lines.map((line, index) => {
    const ingredient = ingredientById.get(line.ingredientId);
    if (!ingredient) throw new DeliveryError("This ingredient no longer exists.", `lines.${index}.ingredientId`);
    if (!ingredient.isActive) {
      throw new DeliveryError(`${ingredient.name} is archived. Restore it before logging a delivery.`, `lines.${index}.ingredientId`);
    }
    const amount = parseQuantityInput(line.amount);
    if (!amount) throw new DeliveryError(`"${line.amount}" is not a number.`, `lines.${index}.amount`);
    let resolved;
    try {
      resolved = resolveEntry(ingredient, packs, amount, line.unit);
    } catch (error) {
      if (error instanceof EntryError) throw new DeliveryError(error.message, `lines.${index}.unit`);
      throw error;
    }
    if (!toDecimal(resolved.qtyBase).gt(0)) {
      throw new DeliveryError("Enter more than zero.", `lines.${index}.amount`);
    }
    const pack = resolved.packSizeId ? packs.find((candidate) => candidate.id === resolved.packSizeId) : undefined;
    return {
      id: randomUUID(),
      ingredientId: ingredient.id,
      packSizeId: resolved.packSizeId,
      packCount: resolved.packCount,
      qtyBaseUnit: resolved.qtyBase,
      note: pack && resolved.packCount ? `${formatNumber(resolved.packCount)} × ${pack.label}` : null,
    };
  });
}

/**
 * Logs a manual delivery and adds its stock: one confirmed delivery, its
 * lines, and one `delivery` movement per line. Calling it again with the same
 * `clientId` (a retried submit) writes nothing and returns the first one.
 */
export async function logDelivery(tx: Tx, locationId: string, userId: string, delivery: NewDelivery): Promise<LoggedDelivery> {
  const timeProblem = enteredTimeProblem(delivery.deliveredAt, MAX_DAYS_BACK);
  if (timeProblem) throw new DeliveryError(timeProblem, "deliveredAt");
  if (delivery.lines.length === 0) throw new DeliveryError("Add at least one item.", "lines");
  const lines = await prepareLines(tx, locationId, delivery.lines);

  const [created] = await tx
    .insert(deliveries)
    .values({
      locationId,
      clientId: delivery.clientId,
      source: "manual",
      status: "draft",
      supplierName: delivery.supplierName,
      deliveredAt: delivery.deliveredAt,
      createdBy: userId,
    })
    // A retry of a submit that already went through: ON CONFLICT waits for it to commit.
    .onConflictDoNothing({ target: [deliveries.locationId, deliveries.clientId] })
    .returning({ id: deliveries.id });
  if (!created) return findLoggedDelivery(tx, locationId, userId, delivery.clientId);

  await tx.insert(deliveryLines).values(
    lines.map((line) => ({
      id: line.id,
      locationId,
      deliveryId: created.id,
      ingredientId: line.ingredientId,
      packSizeId: line.packSizeId,
      packCount: line.packCount,
      qtyBaseUnit: line.qtyBaseUnit,
    })),
  );
  const confirmed = await tx
    .update(deliveries)
    .set({ status: "confirmed", confirmedBy: userId, confirmedAt: new Date() })
    .where(and(eq(deliveries.id, created.id), eq(deliveries.locationId, locationId)))
    .returning({ id: deliveries.id });
  if (confirmed.length === 0) throw new DeliveryError("You do not have permission to log deliveries.");

  const movements: NewMovement[] = lines.map((line) => ({
    ingredientId: line.ingredientId,
    qtyDelta: line.qtyBaseUnit,
    type: "delivery",
    refTable: "delivery_lines",
    refId: line.id,
    note: line.note,
    occurredAt: delivery.deliveredAt,
    createdBy: userId,
  }));
  await appendMovements(tx, locationId, movements);
  return { id: created.id, lineCount: lines.length, alreadyLogged: false };
}

async function findLoggedDelivery(tx: Tx, locationId: string, userId: string, clientId: string): Promise<LoggedDelivery> {
  const [existing] = await tx
    .select({ id: deliveries.id, status: deliveries.status, createdBy: deliveries.createdBy })
    .from(deliveries)
    .where(and(eq(deliveries.locationId, locationId), eq(deliveries.clientId, clientId)));
  if (!existing || existing.createdBy !== userId || existing.status !== "confirmed") {
    throw new DeliveryError("This delivery could not be saved. Reload the page and try again.");
  }
  const [lines] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(deliveryLines)
    .where(and(eq(deliveryLines.deliveryId, existing.id), eq(deliveryLines.locationId, locationId)));
  return { id: existing.id, lineCount: lines.count, alreadyLogged: true };
}

export type DeliverySummaryLine = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  baseUnit: BaseUnit;
  qtyBaseUnit: string;
  packCount: string | null;
  /** Null when typed in a unit, or when the pack size was deleted since. */
  packLabel: string | null;
};

export type DeliverySummary = {
  id: string;
  supplierName: string | null;
  deliveredAt: Date;
  createdBy: string;
  /** Known to owners and managers; null for staff. */
  createdByEmail: string | null;
  lines: DeliverySummaryLine[];
};

/** Confirmed deliveries, newest delivery time first, with their lines. */
export async function listDeliveries(tx: Tx, locationId: string, limit = 20): Promise<DeliverySummary[]> {
  const rows = await tx.execute<{
    id: string;
    supplier_name: string | null;
    delivered_at: string;
    created_by: string;
    created_by_email: string | null;
  }>(sql`
    select d.id, d.supplier_name, d.delivered_at, d.created_by, m.email as created_by_email
    from public.deliveries d
    left join public.list_location_members(${locationId}::uuid) m on m.user_id = d.created_by
    where d.location_id = ${locationId}::uuid and d.status = 'confirmed'
    order by d.delivered_at desc, d.created_at desc
    limit ${limit}
  `);
  if (rows.length === 0) return [];

  const lines = await tx
    .select({
      id: deliveryLines.id,
      deliveryId: deliveryLines.deliveryId,
      ingredientId: ingredients.id,
      ingredientName: ingredients.name,
      baseUnit: ingredients.baseUnit,
      qtyBaseUnit: deliveryLines.qtyBaseUnit,
      packCount: deliveryLines.packCount,
      packLabel: packSizes.label,
    })
    .from(deliveryLines)
    .innerJoin(ingredients, eq(ingredients.id, deliveryLines.ingredientId))
    .leftJoin(packSizes, eq(packSizes.id, deliveryLines.packSizeId))
    .where(
      and(
        eq(deliveryLines.locationId, locationId),
        inArray(
          deliveryLines.deliveryId,
          rows.map((row) => row.id),
        ),
      ),
    )
    .orderBy(asc(deliveryLines.createdAt), asc(ingredients.name));

  return rows.map((row) => ({
    id: row.id,
    supplierName: row.supplier_name,
    deliveredAt: new Date(row.delivered_at),
    createdBy: row.created_by,
    createdByEmail: row.created_by_email,
    lines: lines
      .filter((line) => line.deliveryId === row.id)
      .map((line) => ({
        id: line.id,
        ingredientId: line.ingredientId,
        ingredientName: line.ingredientName,
        baseUnit: line.baseUnit,
        // Confirmed lines always have a quantity (trigger in migration 0013).
        qtyBaseUnit: line.qtyBaseUnit ?? "0.000",
        packCount: line.packCount,
        packLabel: line.packLabel,
      })),
  }));
}
