import Decimal from "decimal.js";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDashboard } from "@/lib/dashboard";
import type { Tx } from "@/lib/db/rls";
import { countSessions, deliveries, ingredients, locations, stockMovements } from "@/lib/db/schema";
import { toDbMoney, toDecimal } from "@/lib/units";
import { getCountReport } from "@/lib/variance";
import type { LossLine, WeeklySummaryData } from "./templates";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const TOP_LOSSES = 5;

/**
 * The weekly owner summary's figures for one location, for the seven days up
 * to `now` (DECISIONS.md 99). Read through RLS as the caller of `withUser` or
 * `runAsUser`, so it can only see that location.
 */
export async function weeklySummaryData(tx: Tx, locationId: string, now: Date, appUrl: string): Promise<WeeklySummaryData> {
  const since = new Date(now.getTime() - WEEK_MS);
  const [location] = await tx
    .select({ name: locations.name, timezone: locations.timezone })
    .from(locations)
    .where(eq(locations.id, locationId));
  const timeZone = location?.timezone ?? "UTC";

  // The week's approved counts: totals and the biggest losses per ingredient.
  const counts = await tx
    .select({ id: countSessions.id })
    .from(countSessions)
    .where(
      and(
        eq(countSessions.locationId, locationId),
        eq(countSessions.status, "approved"),
        gte(countSessions.submittedAt, since),
        lte(countSessions.submittedAt, now),
      ),
    );
  let unexplained = new Decimal(0);
  const losses = new Map<string, LossLine & { value: Decimal; qty: Decimal }>();
  for (const count of counts) {
    const report = await getCountReport(tx, locationId, count.id);
    if (!report) continue;
    unexplained = unexplained.plus(toDecimal(report.totalValue));
    for (const line of report.lines) {
      if (line.isOpening) continue;
      const current = losses.get(line.ingredientId) ?? {
        name: line.ingredientName,
        baseUnit: line.baseUnit,
        differenceQty: "0",
        differenceValue: "0",
        value: new Decimal(0),
        qty: new Decimal(0),
      };
      current.value = current.value.plus(toDecimal(line.differenceValue));
      current.qty = current.qty.plus(toDecimal(line.differenceQty));
      losses.set(line.ingredientId, current);
    }
  }
  const topLosses = [...losses.values()]
    .filter((line) => line.value.isNegative() && !line.value.isZero())
    .sort((a, b) => a.value.comparedTo(b.value))
    .slice(0, TOP_LOSSES)
    .map(({ name, baseUnit, value, qty }) => ({ name, baseUnit, differenceQty: qty.toFixed(3), differenceValue: toDbMoney(value) }));

  // Waste in euros at today's costs, and deliveries logged.
  const [waste] = await tx
    .select({
      value: sql<string>`coalesce(sum(-${stockMovements.qtyDelta} * ${ingredients.costPerBaseUnit}), 0)::text`,
      entries: sql<number>`count(*)::int`,
    })
    .from(stockMovements)
    .innerJoin(ingredients, eq(ingredients.id, stockMovements.ingredientId))
    .where(
      and(
        eq(stockMovements.locationId, locationId),
        eq(stockMovements.type, "waste"),
        gte(stockMovements.occurredAt, since),
        lte(stockMovements.occurredAt, now),
      ),
    );
  const [delivered] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(deliveries)
    .where(
      and(eq(deliveries.locationId, locationId), eq(deliveries.status, "confirmed"), gte(deliveries.deliveredAt, since), lte(deliveries.deliveredAt, now)),
    );

  const dashboard = await getDashboard(tx, locationId, { withMoney: false });
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone });
  return {
    restaurantName: location?.name ?? "Your restaurant",
    periodLabel: `${day.format(since)} – ${day.format(now)}`,
    appUrl,
    countsApproved: counts.length,
    unexplainedValue: toDbMoney(unexplained),
    topLosses,
    lowStock: dashboard.lowStock.map((item) => ({ name: item.name, baseUnit: item.baseUnit, stock: item.stock, reorderPoint: item.reorderPoint })),
    wasteValue: toDbMoney(waste.value),
    wasteEntries: waste.entries,
    deliveries: delivered.count,
    countsWaiting: dashboard.countsWaiting,
    needsRecipe: dashboard.needsRecipe,
  };
}
