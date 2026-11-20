import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approveCount, saveCountEntries, startCount, submitCount } from "@/lib/counts";
import { runAsUser } from "@/lib/db/rls";
import { emailLog } from "@/lib/db/schema";
import { runLowStockAlerts, runWeeklySummaries } from "@/lib/email/jobs";
import type { OutgoingEmail } from "@/lib/email/send";
import { getEmailSettings, setEmailSettings } from "@/lib/email/settings";
import { createIngredient, updateIngredient } from "@/lib/ingredients";
import { appendMovements } from "@/lib/ledger";
import { ingredientFormSchema } from "@/lib/validation/ingredients";
import {
  addTestMember,
  createTestDb,
  createTestRestaurant,
  createTestUser,
  deleteTestRestaurants,
  deleteTestUser,
  hasDatabase,
  type TestDb,
  type TestRestaurant,
  type TestUser,
} from "../helpers/db";

const ingredient = (name: string, reorderKg: string) =>
  ingredientFormSchema.parse({
    name,
    baseUnit: "g",
    costAmount: "8",
    costUnit: "kg",
    reorderPoint: reorderKg,
    parLevel: "",
    levelUnit: "kg",
    category: "",
    storageArea: "",
  });

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The scheduled e-mails (DECISIONS.md 99) on a throwaway restaurant, with a fake sender. */
describe.skipIf(!hasDatabase)("scheduled e-mails", () => {
  let testDb: TestDb;
  let owner: TestUser;
  let manager: TestUser;
  let staff: TestUser;
  let restaurant: TestRestaurant;
  let mozzarella: string;
  let flour: string;
  const outbox: OutgoingEmail[] = [];
  const send = async (email: OutgoingEmail) => {
    outbox.push(email);
  };

  const as = <T>(user: TestUser, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(testDb.db, user.id, fn);
  const loc = () => restaurant.locationId;
  const options = (now: Date, sender: typeof send | null = send) => ({ now, send: sender, appUrl: "https://example.com", only: [loc()] });
  const logOf = (kind: "weekly_summary" | "low_stock") =>
    testDb.db.select().from(emailLog).where(and(eq(emailLog.locationId, loc()), eq(emailLog.kind, kind)));

  beforeAll(async () => {
    testDb = createTestDb();
    [owner, manager, staff] = await Promise.all([createTestUser("mail-owner"), createTestUser("mail-manager"), createTestUser("mail-staff")]);
    restaurant = await createTestRestaurant(testDb.db, owner, "E-mails");
    await addTestMember(testDb.db, restaurant, manager, "manager");
    await addTestMember(testDb.db, restaurant, staff, "staff");
    [mozzarella, flour] = await as(owner, async (tx) => {
      const cheese = await createIngredient(tx, loc(), ingredient("Mozzarella", "2"));
      const flourId = await createIngredient(tx, loc(), ingredient("Flour", "1"));
      // Opening stock two days ago: 2,400 g mozzarella, 5 kg flour.
      await appendMovements(tx, loc(), [
        { ingredientId: cheese, qtyDelta: "2400", type: "count_adjust", occurredAt: new Date(Date.now() - 2 * DAY), createdBy: owner.id },
        { ingredientId: flourId, qtyDelta: "5000", type: "count_adjust", occurredAt: new Date(Date.now() - 2 * DAY), createdBy: owner.id },
      ]);
      return [cheese, flourId];
    });
    // Yesterday's count found 1,900 g: -500 g, -EUR 4.00.
    const sessionId = await as(staff, async (tx) => {
      const id = await startCount(tx, loc(), staff.id, randomUUID());
      await saveCountEntries(tx, loc(), staff.id, id, [{ ingredientId: mozzarella, amount: "1900", unit: "g" }]);
      await submitCount(tx, loc(), staff.id, id, new Date(Date.now() - DAY));
      return id;
    });
    await as(owner, (tx) => approveCount(tx, loc(), owner.id, sessionId));
  });

  afterAll(async () => {
    await deleteTestRestaurants(testDb.db, [restaurant]);
    await Promise.all([owner, manager, staff].map(deleteTestUser));
    await testDb.close();
  });

  it("sends the weekly summary to the owners only, once a week", async () => {
    const now = new Date();
    expect(await runWeeklySummaries(testDb.db, options(now))).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(outbox.map((email) => email.to)).toEqual([owner.email]);
    expect(outbox[0].subject).toContain("−€4.00 unexplained usage this week");
    expect(outbox[0].text).toContain("Mozzarella: −€4.00 (−500 g)");
    expect(outbox[0].text).toContain("Mozzarella: 1,900 g (reorder at 2,000 g)");
    // A second run of the same week sends nothing.
    expect(await runWeeklySummaries(testDb.db, options(new Date(now.getTime() + HOUR)))).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(outbox).toHaveLength(1);
    expect(await logOf("weekly_summary")).toEqual([expect.objectContaining({ status: "sent", recipientCount: 1, error: null })]);
  });

  it("logs a skip, not a send, when e-mail is not set up, and nothing when switched off", async () => {
    const nextWeek = new Date(Date.now() + 7 * DAY);
    expect(await runWeeklySummaries(testDb.db, options(nextWeek, null))).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect((await logOf("weekly_summary")).find((row) => row.status === "skipped")?.error).toContain("No e-mail key");
    await as(owner, (tx) => setEmailSettings(tx, loc(), { weeklySummary: false, lowStockAlerts: true }));
    expect(await runWeeklySummaries(testDb.db, options(new Date(Date.now() + 14 * DAY)))).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect((await as(owner, (tx) => getEmailSettings(tx, loc())))).toMatchObject({ weeklySummaryEnabled: false, lowStockAlertsEnabled: true });
  });

  it("alerts owners and managers about low stock only when what is low changes", async () => {
    outbox.length = 0;
    const today = new Date();
    expect(await runLowStockAlerts(testDb.db, options(today))).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(outbox.map((email) => email.to).sort()).toEqual([manager.email, owner.email].sort());
    expect(outbox[0].subject).toMatch(/: 1 ingredient is low$/);
    // The same day, and the next day with the same low list: nothing.
    expect(await runLowStockAlerts(testDb.db, options(today))).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(await runLowStockAlerts(testDb.db, options(new Date(today.getTime() + DAY)))).toEqual({ sent: 0, skipped: 0, failed: 0 });
    // Flour becomes low too (its reorder point is raised): the next day brings a new alert.
    await as(owner, (tx) => updateIngredient(tx, loc(), flour, ingredient("Flour", "6")));
    expect(await runLowStockAlerts(testDb.db, options(new Date(today.getTime() + 2 * DAY)))).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(outbox.at(-1)?.subject).toContain("2 ingredients are low");
  });

  it("keeps the switches to owners and the log to the jobs", async () => {
    await expect(as(staff, (tx) => setEmailSettings(tx, loc(), { weeklySummary: true, lowStockAlerts: true }))).rejects.toThrow();
    await expect(
      as(owner, (tx) => tx.insert(emailLog).values({ locationId: loc(), kind: "low_stock", period: "forged", status: "sent" })),
    ).rejects.toThrow();
    // Members read it (Settings shows when the last one went out).
    expect((await as(staff, (tx) => getEmailSettings(tx, loc()))).lastLowStockAlert).toMatchObject({ status: "sent" });
  });
});
