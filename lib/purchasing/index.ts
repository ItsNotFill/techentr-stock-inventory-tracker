import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import {
  ingredients,
  locations,
  packSizes,
  purchaseOrderLines,
  purchaseOrders,
  suppliers,
  type BaseUnit,
  type PurchaseOrderStatus,
} from "@/lib/db/schema";
import { logDelivery } from "@/lib/deliveries";
import { stockNow, stockOf } from "@/lib/ledger";
import { parseQuantityInput, toDecimal } from "@/lib/units";
import { EntryError, resolveEntry } from "@/lib/units/entry";
import type { PurchaseOrderInput, SupplierFormValues } from "@/lib/validation/purchasing";
import type { StockEntry } from "@/lib/validation/stock-entry";
import { OPEN_ORDER_STATUSES, orderText, suggestQuantity, sumQty } from "./suggest";

export { orderText, suggestQuantity } from "./suggest";

/**
 * Suppliers and purchase orders (DECISIONS.md 97). Every function takes a
 * transaction from `withUser`, so RLS applies (owners and managers write) and
 * filters by location as well.
 *
 *   draft --send--> sent --receive--> received
 *     \--------------\----cancel----> cancelled
 *
 * Receiving logs the delivery through lib/deliveries, so stock moves the same
 * way as for any delivery, and links it to the order.
 */

export class PurchasingError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "PurchasingError";
  }
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export type SupplierSummary = {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  ingredientCount: number;
  /** Draft and sent orders. */
  openOrders: number;
};

export async function listSuppliers(tx: Tx, locationId: string, options: { includeArchived?: boolean } = {}): Promise<SupplierSummary[]> {
  const rows = await tx
    .select()
    .from(suppliers)
    .where(options.includeArchived ? eq(suppliers.locationId, locationId) : and(eq(suppliers.locationId, locationId), eq(suppliers.isActive, true)))
    .orderBy(asc(sql`lower(${suppliers.name})`));
  if (rows.length === 0) return [];
  const counts = await tx
    .select({ supplierId: ingredients.supplierId, count: sql<number>`count(*)::int` })
    .from(ingredients)
    .where(and(eq(ingredients.locationId, locationId), eq(ingredients.isActive, true), isNotNull(ingredients.supplierId)))
    .groupBy(ingredients.supplierId);
  const open = await tx
    .select({ supplierId: purchaseOrders.supplierId, count: sql<number>`count(*)::int` })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.locationId, locationId), inArray(purchaseOrders.status, [...OPEN_ORDER_STATUSES])))
    .groupBy(purchaseOrders.supplierId);
  const countOf = new Map(counts.map((row) => [row.supplierId, row.count]));
  const openOf = new Map(open.map((row) => [row.supplierId, row.count]));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    contactName: row.contactName,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    isActive: row.isActive,
    ingredientCount: countOf.get(row.id) ?? 0,
    openOrders: openOf.get(row.id) ?? 0,
  }));
}

/** Active suppliers for a picker (the ingredient form, a new order). */
export async function listSupplierOptions(tx: Tx, locationId: string): Promise<{ id: string; name: string }[]> {
  return tx
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(and(eq(suppliers.locationId, locationId), eq(suppliers.isActive, true)))
    .orderBy(asc(sql`lower(${suppliers.name})`));
}

export async function getSupplier(tx: Tx, locationId: string, id: string) {
  const [row] = await tx
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), eq(suppliers.locationId, locationId)));
  if (!row) return null;
  const supplied = await tx
    .select({ id: ingredients.id, name: ingredients.name, isActive: ingredients.isActive })
    .from(ingredients)
    .where(and(eq(ingredients.locationId, locationId), eq(ingredients.supplierId, id)))
    .orderBy(asc(sql`lower(${ingredients.name})`));
  return { ...row, ingredients: supplied };
}

/** Creates (id null) or updates a supplier. Returns the id. */
export async function saveSupplier(tx: Tx, locationId: string, id: string | null, values: SupplierFormValues): Promise<string> {
  const [clash] = await tx
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.locationId, locationId), sql`lower(${suppliers.name}) = lower(${values.name})`, id ? ne(suppliers.id, id) : undefined));
  if (clash) throw new PurchasingError("There is already a supplier with this name.", "name");
  if (id) {
    const updated = await tx
      .update(suppliers)
      .set(values)
      .where(and(eq(suppliers.id, id), eq(suppliers.locationId, locationId)))
      .returning({ id: suppliers.id });
    if (updated.length === 0) throw new PurchasingError("This supplier no longer exists.");
    return id;
  }
  const [created] = await tx.insert(suppliers).values({ locationId, ...values }).returning({ id: suppliers.id });
  return created.id;
}

/** Archive or restore. Its ingredients and orders keep pointing at it. */
export async function setSupplierActive(tx: Tx, locationId: string, id: string, isActive: boolean): Promise<void> {
  const updated = await tx
    .update(suppliers)
    .set({ isActive })
    .where(and(eq(suppliers.id, id), eq(suppliers.locationId, locationId)))
    .returning({ id: suppliers.id });
  if (updated.length === 0) throw new PurchasingError("This supplier no longer exists.");
}

// ---------------------------------------------------------------------------
// Order suggestions
// ---------------------------------------------------------------------------

export type SuggestedLine = {
  ingredientId: string;
  name: string;
  baseUnit: BaseUnit;
  stock: string;
  reorderPoint: string;
  parLevel: string | null;
  /** Already on draft and sent orders. */
  onOrder: string;
  qtyBaseUnit: string;
  packCount: string | null;
  packSizeId: string | null;
  packLabel: string | null;
};

export type SupplierSuggestion = { supplier: { id: string; name: string } | null; lines: SuggestedLine[] };

/** What to order, per supplier (suppliers by name, ingredients without one last). */
export async function listOrderSuggestions(tx: Tx, locationId: string): Promise<SupplierSuggestion[]> {
  const rows = await tx
    .select({
      id: ingredients.id,
      name: ingredients.name,
      baseUnit: ingredients.baseUnit,
      reorderPoint: ingredients.reorderPoint,
      parLevel: ingredients.parLevel,
      supplierId: ingredients.supplierId,
      supplierName: suppliers.name,
    })
    .from(ingredients)
    .leftJoin(suppliers, eq(suppliers.id, ingredients.supplierId))
    .where(and(eq(ingredients.locationId, locationId), eq(ingredients.isActive, true), isNotNull(ingredients.reorderPoint)))
    .orderBy(asc(sql`lower(${ingredients.name})`));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const stock = await stockNow(tx, locationId, ids);
  const packs = await tx
    .select({ id: packSizes.id, ingredientId: packSizes.ingredientId, label: packSizes.label, qtyInBaseUnit: packSizes.qtyInBaseUnit })
    .from(packSizes)
    .where(and(eq(packSizes.locationId, locationId), eq(packSizes.isDefault, true), inArray(packSizes.ingredientId, ids)));
  const packOf = new Map(packs.map((pack) => [pack.ingredientId, pack]));
  const onOrderRows = await tx
    .select({ ingredientId: purchaseOrderLines.ingredientId, qty: purchaseOrderLines.qtyBaseUnit })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.purchaseOrderId))
    .where(and(eq(purchaseOrderLines.locationId, locationId), inArray(purchaseOrders.status, [...OPEN_ORDER_STATUSES])));
  const onOrderOf = new Map<string, string[]>();
  for (const row of onOrderRows) onOrderOf.set(row.ingredientId, [...(onOrderOf.get(row.ingredientId) ?? []), row.qty]);

  const groups = new Map<string, SupplierSuggestion>();
  for (const row of rows) {
    const onOrder = sumQty(onOrderOf.get(row.id) ?? []);
    const pack = packOf.get(row.id) ?? null;
    const suggestion = suggestQuantity({
      baseUnit: row.baseUnit,
      stock: stockOf(stock, row.id),
      reorderPoint: row.reorderPoint,
      parLevel: row.parLevel,
      onOrder,
      pack,
    });
    if (!suggestion) continue;
    const key = row.supplierId ?? "";
    const group = groups.get(key) ?? { supplier: row.supplierId ? { id: row.supplierId, name: row.supplierName ?? "" } : null, lines: [] };
    group.lines.push({
      ingredientId: row.id,
      name: row.name,
      baseUnit: row.baseUnit,
      stock: stockOf(stock, row.id),
      reorderPoint: row.reorderPoint!,
      parLevel: row.parLevel,
      onOrder,
      qtyBaseUnit: suggestion.qtyBaseUnit,
      packCount: suggestion.packCount,
      packSizeId: suggestion.packSizeId,
      packLabel: pack?.label ?? null,
    });
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => (a.supplier === null ? 1 : b.supplier === null ? -1 : a.supplier.name.localeCompare(b.supplier.name)));
}

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------

export type PurchaseOrderSummary = {
  id: string;
  supplierId: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  lineCount: number;
  createdAt: Date;
  sentAt: Date | null;
  receivedAt: Date | null;
};

export async function listPurchaseOrders(tx: Tx, locationId: string, limit = 50): Promise<PurchaseOrderSummary[]> {
  return tx
    .select({
      id: purchaseOrders.id,
      supplierId: purchaseOrders.supplierId,
      supplierName: suppliers.name,
      status: purchaseOrders.status,
      lineCount: sql<number>`(select count(*)::int from public.purchase_order_lines l where l.purchase_order_id = "purchase_orders"."id")`,
      createdAt: purchaseOrders.createdAt,
      sentAt: purchaseOrders.sentAt,
      receivedAt: purchaseOrders.receivedAt,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .where(eq(purchaseOrders.locationId, locationId))
    .orderBy(sql`${purchaseOrders.status} in ('draft', 'sent') desc`, desc(purchaseOrders.createdAt))
    .limit(limit);
}

export type PurchaseOrderLineDetail = {
  id: string;
  ingredientId: string;
  name: string;
  baseUnit: BaseUnit;
  packSizeId: string | null;
  packLabel: string | null;
  packCount: string | null;
  qtyBaseUnit: string;
};

export type PurchaseOrderDetail = {
  id: string;
  status: PurchaseOrderStatus;
  notes: string | null;
  supplier: { id: string; name: string; email: string | null; phone: string | null; contactName: string | null };
  createdAt: Date;
  sentAt: Date | null;
  receivedAt: Date | null;
  cancelledAt: Date | null;
  deliveryId: string | null;
  lines: PurchaseOrderLineDetail[];
  /** The order as text for the supplier. */
  text: string;
};

export async function getPurchaseOrder(tx: Tx, locationId: string, id: string): Promise<PurchaseOrderDetail | null> {
  const [row] = await tx
    .select({
      order: purchaseOrders,
      supplier: { id: suppliers.id, name: suppliers.name, email: suppliers.email, phone: suppliers.phone, contactName: suppliers.contactName },
      restaurant: locations.name,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .innerJoin(locations, eq(locations.id, purchaseOrders.locationId))
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.locationId, locationId)));
  if (!row) return null;
  const lines = await tx
    .select({
      id: purchaseOrderLines.id,
      ingredientId: purchaseOrderLines.ingredientId,
      name: ingredients.name,
      baseUnit: ingredients.baseUnit,
      packSizeId: purchaseOrderLines.packSizeId,
      packLabel: packSizes.label,
      packCount: purchaseOrderLines.packCount,
      qtyBaseUnit: purchaseOrderLines.qtyBaseUnit,
    })
    .from(purchaseOrderLines)
    .innerJoin(ingredients, eq(ingredients.id, purchaseOrderLines.ingredientId))
    .leftJoin(packSizes, eq(packSizes.id, purchaseOrderLines.packSizeId))
    .where(and(eq(purchaseOrderLines.purchaseOrderId, id), eq(purchaseOrderLines.locationId, locationId)))
    .orderBy(asc(sql`lower(${ingredients.name})`));
  return {
    id: row.order.id,
    status: row.order.status,
    notes: row.order.notes,
    supplier: row.supplier,
    createdAt: row.order.createdAt,
    sentAt: row.order.sentAt,
    receivedAt: row.order.receivedAt,
    cancelledAt: row.order.cancelledAt,
    deliveryId: row.order.deliveryId,
    lines,
    text: orderText(row.restaurant, row.supplier.name, lines, row.order.notes),
  };
}

async function lockOrder(tx: Tx, locationId: string, id: string) {
  const [order] = await tx
    .select({ status: purchaseOrders.status, supplierId: purchaseOrders.supplierId, deliveryId: purchaseOrders.deliveryId })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.locationId, locationId)))
    .for("update");
  if (!order) throw new PurchasingError("This order no longer exists.");
  return order;
}

/** Lines as typed -> rows in base units. Errors name the line: `lines.<index>.<field>`. */
async function prepareLines(tx: Tx, locationId: string, lines: StockEntry[]) {
  if (lines.length === 0) return [];
  const ids = [...new Set(lines.map((line) => line.ingredientId))];
  const known = await tx
    .select({ id: ingredients.id, name: ingredients.name, baseUnit: ingredients.baseUnit, isActive: ingredients.isActive })
    .from(ingredients)
    .where(and(eq(ingredients.locationId, locationId), inArray(ingredients.id, ids)));
  const byId = new Map(known.map((row) => [row.id, row]));
  const packs = await tx
    .select({ id: packSizes.id, ingredientId: packSizes.ingredientId, qtyInBaseUnit: packSizes.qtyInBaseUnit })
    .from(packSizes)
    .where(and(eq(packSizes.locationId, locationId), inArray(packSizes.ingredientId, ids)));
  const seen = new Set<string>();
  return lines.map((line, index) => {
    const ingredient = byId.get(line.ingredientId);
    if (!ingredient) throw new PurchasingError("This ingredient no longer exists.", `lines.${index}.ingredientId`);
    if (!ingredient.isActive) throw new PurchasingError(`${ingredient.name} is archived.`, `lines.${index}.ingredientId`);
    if (seen.has(ingredient.id)) throw new PurchasingError(`${ingredient.name} is on the order twice. Put the total on one line.`, `lines.${index}.ingredientId`);
    seen.add(ingredient.id);
    const amount = parseQuantityInput(line.amount);
    if (!amount) throw new PurchasingError(`"${line.amount}" is not a number.`, `lines.${index}.amount`);
    let resolved;
    try {
      resolved = resolveEntry(ingredient, packs, amount, line.unit);
    } catch (error) {
      if (error instanceof EntryError) throw new PurchasingError(error.message, `lines.${index}.unit`);
      throw error;
    }
    if (!toDecimal(resolved.qtyBase).gt(0)) throw new PurchasingError("Enter more than zero.", `lines.${index}.amount`);
    return { ingredientId: ingredient.id, packSizeId: resolved.packSizeId, packCount: resolved.packCount, qtyBaseUnit: resolved.qtyBase };
  });
}

async function writeLines(tx: Tx, locationId: string, orderId: string, rows: Awaited<ReturnType<typeof prepareLines>>) {
  await tx.delete(purchaseOrderLines).where(and(eq(purchaseOrderLines.purchaseOrderId, orderId), eq(purchaseOrderLines.locationId, locationId)));
  if (rows.length > 0) await tx.insert(purchaseOrderLines).values(rows.map((row) => ({ ...row, locationId, purchaseOrderId: orderId })));
}

/**
 * Starts a draft order for a supplier, filled with that supplier's order
 * suggestions when `fromSuggestions` is true. Returns its id.
 */
export async function createPurchaseOrder(
  tx: Tx,
  locationId: string,
  userId: string,
  supplierId: string,
  options: { fromSuggestions: boolean },
): Promise<string> {
  const [supplier] = await tx
    .select({ isActive: suppliers.isActive })
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.locationId, locationId)));
  if (!supplier) throw new PurchasingError("This supplier no longer exists.", "supplierId");
  if (!supplier.isActive) throw new PurchasingError("This supplier is archived. Restore it first.", "supplierId");
  const [created] = await tx
    .insert(purchaseOrders)
    .values({ locationId, supplierId, status: "draft", createdBy: userId })
    .returning({ id: purchaseOrders.id });
  if (options.fromSuggestions) {
    const groups = await listOrderSuggestions(tx, locationId);
    const lines = groups.find((group) => group.supplier?.id === supplierId)?.lines ?? [];
    await writeLines(
      tx,
      locationId,
      created.id,
      lines.map((line) => ({ ingredientId: line.ingredientId, packSizeId: line.packSizeId, packCount: line.packCount, qtyBaseUnit: line.qtyBaseUnit })),
    );
  }
  return created.id;
}

/** Saves a draft's notes and lines (they replace what was there). */
export async function savePurchaseOrder(tx: Tx, locationId: string, id: string, input: PurchaseOrderInput): Promise<void> {
  const order = await lockOrder(tx, locationId, id);
  if (order.status !== "draft") throw new PurchasingError("Only a draft order can be changed.");
  const rows = await prepareLines(tx, locationId, input.lines);
  await tx
    .update(purchaseOrders)
    .set({ notes: input.notes })
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.locationId, locationId)));
  await writeLines(tx, locationId, id, rows);
}

/** The manager sent the order to the supplier. */
export async function markPurchaseOrderSent(tx: Tx, locationId: string, userId: string, id: string): Promise<void> {
  const order = await lockOrder(tx, locationId, id);
  if (order.status !== "draft") throw new PurchasingError("This order was already sent.");
  const [lines] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseOrderLines)
    .where(and(eq(purchaseOrderLines.purchaseOrderId, id), eq(purchaseOrderLines.locationId, locationId)));
  if (lines.count === 0) throw new PurchasingError("Add at least one line before sending the order.");
  await tx
    .update(purchaseOrders)
    .set({ status: "sent", sentAt: new Date(), sentBy: userId })
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.locationId, locationId), eq(purchaseOrders.status, "draft")));
}

export async function cancelPurchaseOrder(tx: Tx, locationId: string, id: string): Promise<void> {
  const order = await lockOrder(tx, locationId, id);
  if (order.status !== "draft" && order.status !== "sent") throw new PurchasingError("Only an open order can be cancelled.");
  await tx
    .update(purchaseOrders)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.locationId, locationId)));
}

/**
 * The goods arrived: logs the delivery (what really came, which may differ
 * from the order) through lib/deliveries and marks the order received. A
 * retried submit (the same `clientId`) logs nothing twice.
 */
export async function receivePurchaseOrder(
  tx: Tx,
  locationId: string,
  userId: string,
  id: string,
  input: { clientId: string; deliveredAt: Date; lines: StockEntry[] },
): Promise<{ deliveryId: string; alreadyReceived: boolean }> {
  const order = await lockOrder(tx, locationId, id);
  if (order.status === "received" && order.deliveryId) return { deliveryId: order.deliveryId, alreadyReceived: true };
  if (order.status !== "draft" && order.status !== "sent") throw new PurchasingError("This order was cancelled.");
  const [supplier] = await tx
    .select({ name: suppliers.name })
    .from(suppliers)
    .where(and(eq(suppliers.id, order.supplierId), eq(suppliers.locationId, locationId)));
  const logged = await logDelivery(tx, locationId, userId, {
    clientId: input.clientId,
    supplierName: supplier?.name ?? null,
    deliveredAt: input.deliveredAt,
    lines: input.lines,
  });
  await tx
    .update(purchaseOrders)
    .set({ status: "received", receivedAt: new Date(), receivedBy: userId, deliveryId: logged.id })
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.locationId, locationId)));
  return { deliveryId: logged.id, alreadyReceived: false };
}

/** Throws away a draft order. */
export async function deletePurchaseOrder(tx: Tx, locationId: string, id: string): Promise<void> {
  const deleted = await tx
    .delete(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.locationId, locationId), eq(purchaseOrders.status, "draft")))
    .returning({ id: purchaseOrders.id });
  if (deleted.length === 0) throw new PurchasingError("Only a draft order can be deleted.");
}
