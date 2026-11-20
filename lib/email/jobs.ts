import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";
import { runAsUser, type Database } from "@/lib/db/rls";
import { emailLog, locations, memberships, type EmailKind, type MemberRole } from "@/lib/db/schema";
import { listLowStock } from "@/lib/ingredients";
import { dayKey, isoWeekKey, lowStockSignature } from "./periods";
import { weeklySummaryData } from "./report";
import type { EmailSender } from "./send";
import { lowStockEmail, weeklySummaryEmail, type EmailMessage } from "./templates";

/**
 * The scheduled e-mails (DECISIONS.md 99), run by the cron routes.
 *
 * `db` is the admin connection: it is used ONLY to list the locations and
 * their recipients and to write `email_log`. Each location's figures are read
 * as one of its owners through RLS (`runAsUser`). Every send is claimed in
 * `email_log` first (unique per location, kind and period), so a second run
 * of the same job sends nothing twice. One e-mail per recipient, so nobody
 * sees another's address.
 */

export type JobOptions = {
  now: Date;
  /** Null when e-mail is not set up: the e-mails are logged as skipped. */
  send: EmailSender | null;
  appUrl: string;
  /** Only these locations (tests); every location when left out. */
  only?: string[];
};

export type JobResult = { sent: number; skipped: number; failed: number };

type Recipient = { userId: string; email: string; role: MemberRole };
type LocationRow = { id: string; name: string; timezone: string; recipients: Recipient[] };

async function locationsWith(db: Database, enabled: "weekly" | "lowStock", roles: MemberRole[], only?: string[]): Promise<LocationRow[]> {
  const rows = await db
    .select({ id: locations.id, name: locations.name, timezone: locations.timezone, userId: memberships.userId, role: memberships.role, email: authUsers.email })
    .from(locations)
    .innerJoin(memberships, eq(memberships.locationId, locations.id))
    .innerJoin(authUsers, eq(authUsers.id, memberships.userId))
    .where(
      and(
        enabled === "weekly" ? eq(locations.weeklySummaryEnabled, true) : eq(locations.lowStockAlertsEnabled, true),
        inArray(memberships.role, roles),
        only ? inArray(locations.id, only) : undefined,
      ),
    )
    .orderBy(locations.id, sql`${memberships.role} = 'owner' desc`, memberships.createdAt);
  const byId = new Map<string, LocationRow>();
  for (const row of rows) {
    const location = byId.get(row.id) ?? { id: row.id, name: row.name, timezone: row.timezone, recipients: [] };
    if (row.email) location.recipients.push({ userId: row.userId, email: row.email, role: row.role });
    byId.set(row.id, location);
  }
  return [...byId.values()];
}

/** Claims one send in the log. False when this location, kind and period was done already. */
async function claim(db: Database, locationId: string, kind: EmailKind, period: string, signature: string | null): Promise<string | null> {
  const [row] = await db
    .insert(emailLog)
    .values({ locationId, kind, period, status: "skipped", error: "In progress", signature })
    .onConflictDoNothing({ target: [emailLog.locationId, emailLog.kind, emailLog.period] })
    .returning({ id: emailLog.id });
  return row?.id ?? null;
}

async function deliver(db: Database, logId: string, message: EmailMessage, recipients: Recipient[], send: EmailSender | null, result: JobResult) {
  if (!send) {
    await db.update(emailLog).set({ status: "skipped", error: "No e-mail key: previewed only" }).where(eq(emailLog.id, logId));
    result.skipped += 1;
    return;
  }
  try {
    for (const recipient of recipients) await send({ to: recipient.email, ...message });
    await db.update(emailLog).set({ status: "sent", error: null, recipientCount: recipients.length }).where(eq(emailLog.id, logId));
    result.sent += 1;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await db.update(emailLog).set({ status: "failed", error: reason.slice(0, 500) }).where(eq(emailLog.id, logId));
    result.failed += 1;
  }
}

/** The weekly owner summary, to each location's owners. */
export async function runWeeklySummaries(db: Database, options: JobOptions): Promise<JobResult> {
  const result: JobResult = { sent: 0, skipped: 0, failed: 0 };
  for (const location of await locationsWith(db, "weekly", ["owner"], options.only)) {
    if (location.recipients.length === 0) continue;
    const logId = await claim(db, location.id, "weekly_summary", isoWeekKey(options.now, location.timezone), null);
    if (!logId) continue;
    try {
      const data = await runAsUser(db, location.recipients[0].userId, (tx) => weeklySummaryData(tx, location.id, options.now, options.appUrl));
      await deliver(db, logId, weeklySummaryEmail(data), location.recipients, options.send, result);
    } catch (error) {
      await db.update(emailLog).set({ status: "failed", error: (error instanceof Error ? error.message : String(error)).slice(0, 500) }).where(eq(emailLog.id, logId));
      result.failed += 1;
    }
  }
  return result;
}

/** The low-stock alert, to owners and managers, only when what is low changed since the last alert sent. */
export async function runLowStockAlerts(db: Database, options: JobOptions): Promise<JobResult> {
  const result: JobResult = { sent: 0, skipped: 0, failed: 0 };
  for (const location of await locationsWith(db, "lowStock", ["owner", "manager"], options.only)) {
    const owner = location.recipients.find((recipient) => recipient.role === "owner") ?? location.recipients[0];
    if (!owner) continue;
    let low: Awaited<ReturnType<typeof listLowStock>>;
    try {
      low = await runAsUser(db, owner.userId, (tx) => listLowStock(tx, location.id));
    } catch (error) {
      // One location's trouble must not stop the others; it is tried again tomorrow.
      console.error(`Low-stock alert for location ${location.id} failed:`, error);
      result.failed += 1;
      continue;
    }
    if (low.length === 0) continue;
    const signature = lowStockSignature(low.map((item) => item.id));
    const [last] = await db
      .select({ signature: emailLog.signature })
      .from(emailLog)
      .where(and(eq(emailLog.locationId, location.id), eq(emailLog.kind, "low_stock"), eq(emailLog.status, "sent")))
      .orderBy(desc(emailLog.createdAt))
      .limit(1);
    if (last?.signature === signature) continue;
    const logId = await claim(db, location.id, "low_stock", dayKey(options.now, location.timezone), signature);
    if (!logId) continue;
    const message = lowStockEmail({
      restaurantName: location.name,
      appUrl: options.appUrl,
      items: low.map((item) => ({ name: item.name, baseUnit: item.baseUnit, stock: item.stock, reorderPoint: item.reorderPoint })),
    });
    await deliver(db, logId, message, location.recipients, options.send, result);
  }
  return result;
}
