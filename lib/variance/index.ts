import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { countLines, countSessions, ingredients, type BaseUnit, type CountStatus } from "@/lib/db/schema";
import { toDbMoney, toDecimal } from "@/lib/units";
import { unexplainedQty, unexplainedValue } from "./math";

export { totalUnexplainedValue, unexplainedQty, unexplainedValue } from "./math";
export type { VarianceInput } from "./math";

/**
 * The unexplained usage report: per approved count, every line with its
 * theoretical and counted stock and the difference in units and euros.
 */

export type ReportLine = {
  lineId: string;
  ingredientId: string;
  ingredientName: string;
  baseUnit: BaseUnit;
  storageArea: string | null;
  countedQty: string;
  /** Theoretical stock at the count time, including late corrections. */
  expectedQty: string;
  theoreticalQty: string;
  lateAdjustQty: string;
  /** counted - expected. Negative: missing. */
  differenceQty: string;
  unitCost: string;
  /** In euros. Negative: lost. */
  differenceValue: string;
  isOpening: boolean;
};

export type CountReport = {
  sessionId: string;
  status: CountStatus;
  submittedAt: Date | null;
  approvedAt: Date | null;
  countedBy: string;
  lines: ReportLine[];
  /** Euros over all lines except opening counts. */
  totalValue: string;
  /** Sum of the lost (negative) values only, opening counts left out. */
  lostValue: string;
};

/** Approved counts, newest first, with their totals in euros (opening counts left out). */
export async function listApprovedCounts(
  tx: Tx,
  locationId: string,
  limit = 50,
): Promise<{ sessionId: string; submittedAt: Date; approvedAt: Date | null; lineCount: number; totalValue: string; lostValue: string }[]> {
  const difference = sql`(${countLines.countedQty} - (${countLines.theoreticalQty} + ${countLines.lateAdjustQty})) * coalesce(${countLines.unitCost}, 0)`;
  const rows = await tx
    .select({
      sessionId: countSessions.id,
      submittedAt: countSessions.submittedAt,
      approvedAt: countSessions.approvedAt,
      lineCount: sql<number>`count(${countLines.id})::int`,
      totalValue: sql<string>`coalesce(sum(${difference}) filter (where not ${countLines.isOpening}), 0)::text`,
      lostValue: sql<string>`coalesce(sum(least(${difference}, 0)) filter (where not ${countLines.isOpening}), 0)::text`,
    })
    .from(countSessions)
    .leftJoin(countLines, eq(countLines.sessionId, countSessions.id))
    .where(and(eq(countSessions.locationId, locationId), eq(countSessions.status, "approved")))
    .groupBy(countSessions.id)
    .orderBy(desc(countSessions.submittedAt))
    .limit(limit);
  return rows.map((row) => ({
    ...row,
    submittedAt: row.submittedAt!,
    totalValue: toDbMoney(row.totalValue),
    lostValue: toDbMoney(row.lostValue),
  }));
}

export async function getCountReport(tx: Tx, locationId: string, sessionId: string): Promise<CountReport | null> {
  const [session] = await tx
    .select()
    .from(countSessions)
    .where(and(eq(countSessions.id, sessionId), eq(countSessions.locationId, locationId)));
  if (!session) return null;

  const rows = await tx
    .select({
      lineId: countLines.id,
      ingredientId: countLines.ingredientId,
      ingredientName: ingredients.name,
      baseUnit: ingredients.baseUnit,
      storageArea: ingredients.storageArea,
      countedQty: countLines.countedQty,
      theoreticalQty: countLines.theoreticalQty,
      lateAdjustQty: countLines.lateAdjustQty,
      unitCost: countLines.unitCost,
      currentCost: ingredients.costPerBaseUnit,
      isOpening: countLines.isOpening,
    })
    .from(countLines)
    .innerJoin(ingredients, eq(ingredients.id, countLines.ingredientId))
    .where(and(eq(countLines.sessionId, sessionId), eq(countLines.locationId, locationId)))
    .orderBy(asc(ingredients.name));

  const lines: ReportLine[] = rows.map((row) => {
    const theoreticalQty = row.theoreticalQty ?? "0.000";
    // Before approval there is no cost snapshot; show today's cost.
    const unitCost = row.unitCost ?? row.currentCost;
    const input = { countedQty: row.countedQty, theoreticalQty, lateAdjustQty: row.lateAdjustQty, unitCost };
    return {
      lineId: row.lineId,
      ingredientId: row.ingredientId,
      ingredientName: row.ingredientName,
      baseUnit: row.baseUnit,
      storageArea: row.storageArea,
      countedQty: row.countedQty,
      theoreticalQty,
      lateAdjustQty: row.lateAdjustQty,
      expectedQty: toDecimal(theoreticalQty).plus(toDecimal(row.lateAdjustQty)).toFixed(3),
      differenceQty: unexplainedQty(input)!,
      unitCost,
      differenceValue: unexplainedValue(input)!,
      isOpening: row.isOpening,
    };
  });

  // Sorted by euros lost: the biggest loss first, opening counts last.
  lines.sort((a, b) => {
    if (a.isOpening !== b.isOpening) return a.isOpening ? 1 : -1;
    const byValue = toDecimal(a.differenceValue).comparedTo(toDecimal(b.differenceValue));
    return byValue !== 0 ? byValue : a.ingredientName.localeCompare(b.ingredientName);
  });

  const counted = lines.filter((line) => !line.isOpening);
  const sum = (values: string[]) => toDbMoney(values.reduce((total, value) => total.plus(toDecimal(value)), toDecimal("0")));
  return {
    sessionId: session.id,
    status: session.status,
    submittedAt: session.submittedAt,
    approvedAt: session.approvedAt,
    countedBy: session.countedBy,
    lines,
    totalValue: sum(counted.map((line) => line.differenceValue)),
    lostValue: sum(counted.map((line) => line.differenceValue).filter((value) => toDecimal(value).isNegative())),
  };
}
