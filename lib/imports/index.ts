import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { menuItems, posImportMappings, saleLines, sales, salesImports, type SalesImport } from "@/lib/db/schema";
import { depleteSaleLines } from "@/lib/ledger/depletion";
import { columnMapSchema, type ColumnMap } from "@/lib/validation/imports";
import type { ImportOrder, PreparedImport, SaleRow } from "./rows";

export { CsvError, parseCsv } from "./csv";
export { guessColumnMap, mapFitsHeaders } from "./mapping";
export { prepareImport } from "./rows";
export type { ImportOrder, InvalidRow, PreparedImport, SaleRow } from "./rows";

/**
 * Sales import against the database. Every function takes a transaction from
 * `withUser`, so RLS applies (imports are for owners and managers).
 *
 * Idempotent: an order is identified by its POS order number within a
 * location (`UNIQUE(location_id, pos_order_id)`), and orders that are already
 * there are skipped, so the same file can be uploaded twice without changing
 * stock twice. Undoable: `undoImport` removes an import's sales and their
 * stock movements through the database function `undo_sales_import()`.
 */

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

const CHUNK = 500;

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

// ---------------------------------------------------------------------------
// Matching file rows to menu items
// ---------------------------------------------------------------------------

type KnownItem = { id: string; isMapped: boolean; isIgnored: boolean };

type MenuIndex = {
  byPosId: Map<string, KnownItem>;
  byName: Map<string, KnownItem>;
};

const nameKey = (name: string) => name.trim().toLowerCase();

/** Rows match on the POS item id first, then on the name without regard to case (SCHEMA.md, menu_items). */
async function loadMenuIndex(tx: Tx, locationId: string): Promise<MenuIndex> {
  const items = await tx
    .select({
      id: menuItems.id,
      posItemId: menuItems.posItemId,
      posName: menuItems.posName,
      isMapped: menuItems.isMapped,
      isIgnored: menuItems.isIgnored,
    })
    .from(menuItems)
    .where(eq(menuItems.locationId, locationId))
    // Items without a POS id first, then the oldest: that one wins a name match.
    .orderBy(sql`${menuItems.posItemId} is not null`, menuItems.createdAt);

  const index: MenuIndex = { byPosId: new Map(), byName: new Map() };
  for (const item of items) {
    const known = { id: item.id, isMapped: item.isMapped, isIgnored: item.isIgnored };
    if (item.posItemId) index.byPosId.set(item.posItemId, known);
    const key = nameKey(item.posName);
    if (!index.byName.has(key)) index.byName.set(key, known);
  }
  return index;
}

function findItem(index: MenuIndex, row: Pick<SaleRow, "itemId" | "itemName">): KnownItem | undefined {
  return (row.itemId ? index.byPosId.get(row.itemId) : undefined) ?? index.byName.get(nameKey(row.itemName));
}

/** The key under which an item unknown to the app will be created. */
const unknownKey = (row: Pick<SaleRow, "itemId" | "itemName">) => (row.itemId ? `id:${row.itemId}` : `name:${nameKey(row.itemName)}`);

async function existingOrderIds(tx: Tx, locationId: string, orders: ImportOrder[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const batch of chunks(orders.map((order) => order.posOrderId))) {
    const rows = await tx
      .select({ posOrderId: sales.posOrderId })
      .from(sales)
      .where(and(eq(sales.locationId, locationId), inArray(sales.posOrderId, batch)));
    for (const row of rows) found.add(row.posOrderId);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export type ImportPreview = {
  totalRows: number;
  orders: {
    /** Orders that will be imported. */
    new: number;
    /** Orders that are already in the app and will be skipped. */
    alreadyImported: number;
    /** Orders held back because one of their rows is invalid. */
    blocked: number;
  };
  lines: {
    /** Lines of new orders. */
    toImport: number;
    /** Lines whose item has a recipe: they will change stock. */
    willUseStock: number;
    /** Lines whose item has no recipe yet: they wait in the unmapped queue. */
    waitingForRecipe: number;
    /** Lines of ignored items: they never use stock. */
    ignored: number;
  };
  /** Items in the file that the app does not know yet. They are created without a recipe. */
  newItems: { name: string; lines: number }[];
  /** Earliest and latest sale among the new orders, as ISO strings. */
  period: { from: string; to: string } | null;
};

/** What confirming this file would do, without writing anything. */
export async function previewImport(tx: Tx, locationId: string, prepared: PreparedImport): Promise<ImportPreview> {
  const [existing, index] = [await existingOrderIds(tx, locationId, prepared.orders), await loadMenuIndex(tx, locationId)];
  const fresh = prepared.orders.filter((order) => !existing.has(order.posOrderId));

  const lines = { toImport: 0, willUseStock: 0, waitingForRecipe: 0, ignored: 0 };
  const newItems = new Map<string, { name: string; lines: number }>();
  let from: Date | null = null;
  let to: Date | null = null;
  for (const order of fresh) {
    if (!from || order.soldAt < from) from = order.soldAt;
    if (!to || order.soldAt > to) to = order.soldAt;
    for (const line of order.lines) {
      lines.toImport += 1;
      const item = findItem(index, line);
      if (!item) {
        lines.waitingForRecipe += 1;
        const key = unknownKey(line);
        const entry = newItems.get(key) ?? { name: line.itemName, lines: 0 };
        entry.lines += 1;
        newItems.set(key, entry);
      } else if (item.isIgnored) {
        lines.ignored += 1;
      } else if (item.isMapped) {
        lines.willUseStock += 1;
      } else {
        lines.waitingForRecipe += 1;
      }
    }
  }

  return {
    totalRows: prepared.totalRows,
    orders: { new: fresh.length, alreadyImported: existing.size, blocked: prepared.blockedOrderIds.length },
    lines,
    newItems: [...newItems.values()].sort((a, b) => b.lines - a.lines),
    period: from && to ? { from: from.toISOString(), to: to.toISOString() } : null,
  };
}

// ---------------------------------------------------------------------------
// Confirm
// ---------------------------------------------------------------------------

export type ImportResult = {
  importId: string;
  ordersImported: number;
  ordersSkipped: number;
  linesImported: number;
  /** Lines that changed stock. */
  linesDepleted: number;
  /** Lines waiting for a recipe (the unmapped queue). */
  linesWaiting: number;
  /** Names of the menu items this import created. */
  itemsCreated: string[];
};

/**
 * Imports a prepared file. Run it inside ONE `withUser` transaction: either
 * the sales, their lines and their stock movements are all written, or
 * nothing is.
 *
 * - Orders already imported are skipped (`ON CONFLICT DO NOTHING` on the
 *   idempotency key), also when two people upload the same file at once.
 * - Items the app does not know are created as menu items without a recipe;
 *   their lines wait with `depleted_at` null (nothing is silently lost).
 * - Lines of items with a confirmed recipe write `sale` movements.
 */
export async function confirmImport(
  tx: Tx,
  locationId: string,
  userId: string,
  input: { fileName: string | null; prepared: PreparedImport },
): Promise<ImportResult> {
  const { prepared } = input;
  if (prepared.orders.length === 0) {
    throw new ImportError("There is nothing to import: no order in this file is complete and valid.");
  }

  const [created] = await tx
    .insert(salesImports)
    .values({
      locationId,
      source: "csv",
      status: "confirmed",
      fileName: input.fileName,
      importedBy: userId,
      confirmedBy: userId,
      confirmedAt: new Date(),
    })
    .returning({ id: salesImports.id });
  const importId = created.id;

  // 1. Orders. The unique key on (location_id, pos_order_id) decides what is new.
  const saleIdByOrder = new Map<string, string>();
  for (const batch of chunks(prepared.orders)) {
    const inserted = await tx
      .insert(sales)
      .values(batch.map((order) => ({ locationId, importId, posOrderId: order.posOrderId, soldAt: order.soldAt })))
      .onConflictDoNothing({ target: [sales.locationId, sales.posOrderId] })
      .returning({ id: sales.id, posOrderId: sales.posOrderId });
    for (const row of inserted) saleIdByOrder.set(row.posOrderId, row.id);
  }
  const fresh = prepared.orders.filter((order) => saleIdByOrder.has(order.posOrderId));
  const ordersSkipped = prepared.orders.length - fresh.length;

  // 2. Menu items the app does not know yet: created without a recipe.
  const index = await loadMenuIndex(tx, locationId);
  const unknown = new Map<string, { posName: string; posItemId: string | null }>();
  for (const order of fresh) {
    for (const line of order.lines) {
      if (!findItem(index, line)) {
        const key = unknownKey(line);
        if (!unknown.has(key)) unknown.set(key, { posName: line.itemName, posItemId: line.itemId });
      }
    }
  }
  const itemsCreated: string[] = [];
  for (const item of unknown.values()) {
    const [saved] = await tx
      .insert(menuItems)
      .values({ locationId, posName: item.posName, displayName: item.posName, posItemId: item.posItemId })
      .onConflictDoNothing()
      .returning({ id: menuItems.id });
    if (saved) itemsCreated.push(item.posName);
  }
  const finalIndex = unknown.size > 0 ? await loadMenuIndex(tx, locationId) : index;

  // 3. Lines.
  const lineRows: { locationId: string; saleId: string; menuItemId: string; qty: string }[] = [];
  for (const order of fresh) {
    const saleId = saleIdByOrder.get(order.posOrderId)!;
    for (const line of order.lines) {
      const item = findItem(finalIndex, line);
      if (!item) throw new ImportError(`Could not create the menu item "${line.itemName}". Try again.`);
      lineRows.push({ locationId, saleId, menuItemId: item.id, qty: line.qty });
    }
  }
  for (const batch of chunks(lineRows)) {
    await tx.insert(saleLines).values(batch);
  }

  // 4. Stock: lines of items with a confirmed recipe are depleted now.
  const saleIds = [...saleIdByOrder.values()];
  const depletion = await depleteSaleLines(tx, locationId, userId, { saleIds });

  // 5. What is left waiting for a recipe (ignored items never use stock, so they do not wait).
  let linesWaiting = 0;
  for (const batch of chunks(saleIds)) {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(saleLines)
      .innerJoin(menuItems, eq(menuItems.id, saleLines.menuItemId))
      .where(
        and(
          eq(saleLines.locationId, locationId),
          inArray(saleLines.saleId, batch),
          isNull(saleLines.depletedAt),
          eq(menuItems.isIgnored, false),
        ),
      );
    linesWaiting += row.count;
  }

  await tx
    .update(salesImports)
    .set({ rowCount: lineRows.length, skippedCount: ordersSkipped, unmappedCount: linesWaiting })
    .where(and(eq(salesImports.id, importId), eq(salesImports.locationId, locationId)));

  return {
    importId,
    ordersImported: fresh.length,
    ordersSkipped,
    linesImported: lineRows.length,
    linesDepleted: depletion.linesDepleted,
    linesWaiting,
    itemsCreated,
  };
}

// ---------------------------------------------------------------------------
// Undo and history
// ---------------------------------------------------------------------------

/**
 * Undoes an import: its sales, their lines and their stock movements are
 * removed by the database function, and the import row is kept as `undone`.
 * The same file can then be imported again.
 */
export async function undoImport(tx: Tx, importId: string): Promise<{ sales: number; movements: number }> {
  try {
    // A savepoint, so a refusal from the function does not abort the caller's transaction.
    const [row] = await tx.transaction((inner) =>
      inner.execute<{ result: { sales: number; movements: number } }>(
        sql`select public.undo_sales_import(${importId}::uuid) as result`,
      ),
    );
    return row.result;
  } catch (error) {
    const text = error instanceof Error ? `${error.message} ${String((error as { cause?: unknown }).cause ?? "")}` : "";
    if (text.includes("IMPORT_NOT_FOUND")) throw new ImportError("This import no longer exists.");
    if (text.includes("IMPORT_NOT_CONFIRMED")) throw new ImportError("This import was already undone.");
    throw error;
  }
}

export type ImportHistoryEntry = Pick<
  SalesImport,
  "id" | "source" | "status" | "fileName" | "rowCount" | "skippedCount" | "unmappedCount" | "createdAt" | "undoneAt"
>;

/** Imports, newest first. */
export async function listImports(tx: Tx, locationId: string, limit = 50): Promise<ImportHistoryEntry[]> {
  return tx
    .select({
      id: salesImports.id,
      source: salesImports.source,
      status: salesImports.status,
      fileName: salesImports.fileName,
      rowCount: salesImports.rowCount,
      skippedCount: salesImports.skippedCount,
      unmappedCount: salesImports.unmappedCount,
      createdAt: salesImports.createdAt,
      undoneAt: salesImports.undoneAt,
    })
    .from(salesImports)
    .where(eq(salesImports.locationId, locationId))
    .orderBy(desc(salesImports.createdAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// The column mapping, remembered per POS
// ---------------------------------------------------------------------------

/** The mapping saved for this POS, or null when there is none or it no longer validates. */
export async function getSavedColumnMap(tx: Tx, locationId: string, posProvider: string): Promise<ColumnMap | null> {
  const [row] = await tx
    .select({ columnMap: posImportMappings.columnMap })
    .from(posImportMappings)
    .where(and(eq(posImportMappings.locationId, locationId), eq(posImportMappings.posProvider, posProvider)));
  const parsed = columnMapSchema.safeParse(row?.columnMap);
  return parsed.success ? parsed.data : null;
}

export async function saveColumnMap(
  tx: Tx,
  locationId: string,
  posProvider: string,
  userId: string,
  columnMap: ColumnMap,
): Promise<void> {
  await tx
    .insert(posImportMappings)
    .values({ locationId, posProvider, columnMap, updatedBy: userId })
    .onConflictDoUpdate({
      target: [posImportMappings.locationId, posImportMappings.posProvider],
      set: { columnMap, updatedBy: userId, updatedAt: new Date() },
    });
}

/** The name mappings are stored under: the restaurant's POS, or "default". */
export function posProviderKey(posProvider: string | null | undefined): string {
  return posProvider?.trim().toLowerCase() || "default";
}
