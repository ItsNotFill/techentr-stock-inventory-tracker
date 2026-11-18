import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { countSessions, menuItems, salesImports, type BaseUnit } from "@/lib/db/schema";
import { listLowStock, type LowStockItem } from "@/lib/ingredients";
import { getCountReport, listApprovedCounts } from "@/lib/variance";
import { toDecimal } from "@/lib/units";

/**
 * Everything the dashboard shows, in one read (SPEC.md: low-stock list, last
 * import, last count's total unexplained usage, top five unexplained-usage
 * ingredients). Euro figures are only computed for owners and managers, so
 * they never reach a staff member's browser (DECISIONS.md 24, 46).
 */

export type LastImport = {
  id: string;
  fileName: string | null;
  createdAt: Date;
  rowCount: number;
  skippedCount: number;
  unmappedCount: number;
};

export type TopUnexplained = {
  ingredientId: string;
  ingredientName: string;
  baseUnit: BaseUnit;
  /** Negative: missing, in base units. */
  differenceQty: string;
  /** Negative: lost, in euros. */
  differenceValue: string;
};

export type LastCount = {
  sessionId: string;
  submittedAt: Date;
  lineCount: number;
  /** Euros over all lines except opening counts. */
  totalValue: string;
  /** The lost (negative) lines only. */
  lostValue: string;
  /** The five ingredients with the most euros lost in this count, biggest loss first. */
  top: TopUnexplained[];
};

export type Dashboard = {
  lowStock: LowStockItem[];
  /** The newest import that is not undone. */
  lastImport: LastImport | null;
  /** Menu items waiting in the "Needs recipe" queue. */
  needsRecipe: number;
  /** Counts submitted and waiting for a manager. */
  countsWaiting: number;
  /** The newest approved count; null for staff, or before the first count. */
  lastCount: LastCount | null;
};

export const TOP_UNEXPLAINED = 5;

export async function getDashboard(tx: Tx, locationId: string, options: { withMoney: boolean }): Promise<Dashboard> {
  const lowStock = await listLowStock(tx, locationId);

  const [lastImport] = await tx
    .select({
      id: salesImports.id,
      fileName: salesImports.fileName,
      createdAt: salesImports.createdAt,
      rowCount: salesImports.rowCount,
      skippedCount: salesImports.skippedCount,
      unmappedCount: salesImports.unmappedCount,
    })
    .from(salesImports)
    .where(and(eq(salesImports.locationId, locationId), eq(salesImports.status, "confirmed")))
    .orderBy(desc(salesImports.createdAt))
    .limit(1);

  const [queue] = await tx
    .select({ value: count() })
    .from(menuItems)
    .where(and(eq(menuItems.locationId, locationId), sql`not ${menuItems.isMapped} and not ${menuItems.isIgnored}`));
  const [waiting] = await tx
    .select({ value: count() })
    .from(countSessions)
    .where(and(eq(countSessions.locationId, locationId), eq(countSessions.status, "submitted")));

  return {
    lowStock,
    lastImport: lastImport ?? null,
    needsRecipe: queue.value,
    countsWaiting: waiting.value,
    lastCount: options.withMoney ? await lastCountSummary(tx, locationId) : null,
  };
}

async function lastCountSummary(tx: Tx, locationId: string): Promise<LastCount | null> {
  const [latest] = await listApprovedCounts(tx, locationId, 1);
  if (!latest) return null;
  const report = await getCountReport(tx, locationId, latest.sessionId);
  // The report's lines come sorted by euros lost, opening counts last.
  const top = (report?.lines ?? [])
    .filter((line) => !line.isOpening && toDecimal(line.differenceValue).isNegative() && !toDecimal(line.differenceValue).isZero())
    .slice(0, TOP_UNEXPLAINED)
    .map((line) => ({
      ingredientId: line.ingredientId,
      ingredientName: line.ingredientName,
      baseUnit: line.baseUnit,
      differenceQty: line.differenceQty,
      differenceValue: line.differenceValue,
    }));
  return {
    sessionId: latest.sessionId,
    submittedAt: latest.submittedAt,
    lineCount: latest.lineCount,
    totalValue: latest.totalValue,
    lostValue: latest.lostValue,
    top,
  };
}
