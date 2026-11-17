import { runAsUser, type Database, type Tx } from "@/lib/db/rls";
import { saleLines, sales, salesImports } from "@/lib/db/schema";

/**
 * Writes one CSV-style import with its sales and lines straight into the
 * tables, as the given user, WITHOUT depleting. For ledger tests that need
 * sales before the import code is involved.
 */
export async function insertTestSales(
  db: Database,
  userId: string,
  locationId: string,
  orders: { posOrderId: string; soldAt: Date; lines: { menuItemId: string; qty: string }[] }[],
): Promise<{ importId: string; saleIds: string[]; saleLineIds: string[] }> {
  return runAsUser(db, userId, async (tx: Tx) => {
    const [created] = await tx
      .insert(salesImports)
      .values({ locationId, source: "csv", status: "confirmed", fileName: "test.csv", importedBy: userId })
      .returning({ id: salesImports.id });
    const saleIds: string[] = [];
    const saleLineIds: string[] = [];
    for (const order of orders) {
      const [sale] = await tx
        .insert(sales)
        .values({ locationId, importId: created.id, posOrderId: order.posOrderId, soldAt: order.soldAt })
        .returning({ id: sales.id });
      saleIds.push(sale.id);
      const lines = await tx
        .insert(saleLines)
        .values(order.lines.map((line) => ({ locationId, saleId: sale.id, menuItemId: line.menuItemId, qty: line.qty })))
        .returning({ id: saleLines.id });
      saleLineIds.push(...lines.map((line) => line.id));
    }
    return { importId: created.id, saleIds, saleLineIds };
  });
}
