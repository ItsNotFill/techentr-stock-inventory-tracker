import { and, desc, eq } from "drizzle-orm";
import { listLowStock } from "@/lib/ingredients";
import type { Tx } from "@/lib/db/rls";
import { emailLog, locations, type EmailKind } from "@/lib/db/schema";
import { weeklySummaryData } from "./report";
import { lowStockEmail, weeklySummaryEmail, type EmailMessage } from "./templates";

/** The e-mail switches of a location and when each kind last ran (Settings). Through RLS. */
export async function getEmailSettings(tx: Tx, locationId: string) {
  const [location] = await tx
    .select({ weeklySummaryEnabled: locations.weeklySummaryEnabled, lowStockAlertsEnabled: locations.lowStockAlertsEnabled })
    .from(locations)
    .where(eq(locations.id, locationId));
  const last = async (kind: EmailKind) => {
    const [row] = await tx
      .select({ status: emailLog.status, createdAt: emailLog.createdAt, recipientCount: emailLog.recipientCount, error: emailLog.error })
      .from(emailLog)
      .where(and(eq(emailLog.locationId, locationId), eq(emailLog.kind, kind)))
      .orderBy(desc(emailLog.createdAt))
      .limit(1);
    return row ?? null;
  };
  return {
    weeklySummaryEnabled: location?.weeklySummaryEnabled ?? true,
    lowStockAlertsEnabled: location?.lowStockAlertsEnabled ?? true,
    lastWeeklySummary: await last("weekly_summary"),
    lastLowStockAlert: await last("low_stock"),
  };
}

/** Owners switch the e-mails of their location on or off. RLS lets only owners update a location. */
export async function setEmailSettings(tx: Tx, locationId: string, values: { weeklySummary: boolean; lowStockAlerts: boolean }): Promise<void> {
  const updated = await tx
    .update(locations)
    .set({ weeklySummaryEnabled: values.weeklySummary, lowStockAlertsEnabled: values.lowStockAlerts })
    .where(eq(locations.id, locationId))
    .returning({ id: locations.id });
  if (updated.length === 0) throw new Error("Only an owner can change the e-mails.");
}

/** The e-mail as it would go out now, for the preview in Settings. Null for a low-stock alert when nothing is low. */
export async function previewEmail(tx: Tx, locationId: string, kind: EmailKind, now: Date, appUrl: string): Promise<EmailMessage | null> {
  if (kind === "weekly_summary") return weeklySummaryEmail(await weeklySummaryData(tx, locationId, now, appUrl));
  const low = await listLowStock(tx, locationId);
  if (low.length === 0) return null;
  const [location] = await tx.select({ name: locations.name }).from(locations).where(eq(locations.id, locationId));
  return lowStockEmail({
    restaurantName: location?.name ?? "Your restaurant",
    appUrl,
    items: low.map((item) => ({ name: item.name, baseUnit: item.baseUnit, stock: item.stock, reorderPoint: item.reorderPoint })),
  });
}
