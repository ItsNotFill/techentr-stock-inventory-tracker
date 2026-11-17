import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAsUser } from "@/lib/db/rls";
import { countLines, countSessions, stockMovements } from "@/lib/db/schema";
import {
  approveCount,
  CountError,
  getCountSheet,
  listCounts,
  rejectCount,
  saveCountEntries,
  startCount,
  submitCount,
} from "@/lib/counts";
import { confirmImport, parseCsv, prepareImport, undoImport } from "@/lib/imports";
import { addPackSize, createIngredient } from "@/lib/ingredients";
import { appendMovements, stockAt, stockNow, stockOf, sumDeltas } from "@/lib/ledger";
import { createMenuItem, saveRecipe } from "@/lib/menu";
import { getCountReport, listApprovedCounts } from "@/lib/variance";
import { ingredientFormSchema, packSizeFormSchema } from "@/lib/validation/ingredients";
import { menuItemFormSchema, recipeInputSchema } from "@/lib/validation/menu";
import type { ColumnMap } from "@/lib/validation/imports";
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
import { randomUUID } from "node:crypto";

const TIMEZONE = "Europe/Amsterdam";
const MAP: ColumnMap = {
  orderId: "Order ID",
  itemName: "Item",
  itemId: null,
  quantity: "Quantity",
  soldAt: "Date",
  soldAtTime: "Time",
  dateFormat: "dmy",
  decimalSeparator: ".",
};
// 16 Nov 2026, in UTC (Amsterdam is UTC+1).
const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 10, 16, hour - 1, minute));

const ingredient = (name: string) =>
  ingredientFormSchema.parse({
    name,
    baseUnit: "g",
    costAmount: "8",
    costUnit: "kg",
    reorderPoint: "",
    parLevel: "",
    levelUnit: "kg",
    category: "",
    storageArea: "Walk-in fridge",
  });
const item = (posName: string) =>
  menuItemFormSchema.parse({ posName, posItemId: "", displayName: "", kind: "item", category: "", price: "" });

/**
 * Stage 4 against the real database: the SPEC worked example to -500 g and
 * -EUR 4, late movements, undo after a count, counts approved out of order,
 * and the invariant "unexplained usage = sum of the line's count adjustments".
 */
describe.skipIf(!hasDatabase)("stock counts and unexplained usage", () => {
  let testDb: TestDb;
  let owner: TestUser;
  let manager: TestUser;
  let staff: TestUser;
  let otherOwner: TestUser;
  let restaurant: TestRestaurant;
  let otherRestaurant: TestRestaurant;
  let mozzarella: string;
  let basil: string;
  let bag: string;
  let closingCount: string;

  const as = <T>(user: TestUser, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(testDb.db, user.id, fn);
  const loc = () => restaurant.locationId;
  const stock = async (id: string) => stockOf(await as(owner, (tx) => stockNow(tx, loc())), id);

  /** A full count by `user`: start, enter, submit at `time`, return its id. */
  async function count(user: TestUser, time: Date, entries: { ingredientId: string; amount: string; unit: string }[]) {
    return as(user, async (tx) => {
      const id = await startCount(tx, loc(), user.id, randomUUID());
      await saveCountEntries(tx, loc(), user.id, id, entries);
      await submitCount(tx, loc(), user.id, id, time);
      return id;
    });
  }

  /** The line of a count for an ingredient, with the sum of the adjustments that point at it. */
  async function line(sessionId: string, ingredientId: string) {
    return as(owner, async (tx) => {
      const [row] = await tx
        .select()
        .from(countLines)
        .where(and(eq(countLines.sessionId, sessionId), eq(countLines.ingredientId, ingredientId)));
      const adjustments = await tx
        .select({ qtyDelta: stockMovements.qtyDelta })
        .from(stockMovements)
        .where(and(eq(stockMovements.refTable, "count_lines"), eq(stockMovements.refId, row.id)));
      const report = await getCountReport(tx, loc(), sessionId);
      const reportLine = report!.lines.find((entry) => entry.ingredientId === ingredientId)!;
      return { row, adjustments: sumDeltas(adjustments.map((a) => a.qtyDelta)), reportLine, report: report! };
    });
  }

  const importCsv = (rows: string[]) =>
    as(owner, (tx) =>
      confirmImport(tx, loc(), owner.id, {
        fileName: "sales.csv",
        prepared: prepareImport(parseCsv(["Order ID,Date,Time,Item,Quantity", ...rows].join("\n")), MAP, TIMEZONE),
      }),
    );

  beforeAll(async () => {
    testDb = createTestDb();
    [owner, manager, staff, otherOwner] = await Promise.all([
      createTestUser("count-owner"),
      createTestUser("count-manager"),
      createTestUser("count-staff"),
      createTestUser("count-other"),
    ]);
    restaurant = await createTestRestaurant(testDb.db, owner, "Count Test");
    otherRestaurant = await createTestRestaurant(testDb.db, otherOwner, "Count Other");
    await addTestMember(testDb.db, restaurant, manager, "manager");
    await addTestMember(testDb.db, restaurant, staff, "staff");

    await as(owner, async (tx) => {
      mozzarella = await createIngredient(tx, loc(), ingredient("Mozzarella"));
      basil = await createIngredient(tx, loc(), ingredient("Basil"));
      bag = await addPackSize(tx, loc(), mozzarella, packSizeFormSchema.parse({ label: "Bag 1 kg", amount: "1", unit: "kg", isDefault: true }));
      const recipe = (grams: string) => recipeInputSchema.parse([{ ingredientId: mozzarella, amount: grams, unit: "g" }]);
      await saveRecipe(tx, loc(), owner.id, await createMenuItem(tx, loc(), item("Margherita")), recipe("120"));
      await saveRecipe(tx, loc(), owner.id, await createMenuItem(tx, loc(), item("Quattro Formaggi")), recipe("80"));
    });
  });

  afterAll(async () => {
    await deleteTestRestaurants(testDb.db, [restaurant, otherRestaurant]);
    await Promise.all([owner, manager, staff, otherOwner].map(deleteTestUser));
    await testDb.close();
  });

  it("the opening count: 2,000 g, flagged as opening, theoretical 0", async () => {
    // Staff counts two bags in the morning; a manager approves.
    const opening = await count(staff, at(8), [{ ingredientId: mozzarella, amount: "2", unit: `pack:${bag}` }]);
    const approval = await as(manager, (tx) => approveCount(tx, loc(), manager.id, opening));
    expect(approval).toEqual({ adjustments: 1, openingLines: 1 });
    const { row, adjustments, report } = await line(opening, mozzarella);
    expect([row.countedQty, row.theoreticalQty, row.isOpening, row.unitCost]).toEqual(["2000.000", "0.000", true, "0.008000"]);
    expect(adjustments).toBe("2000.000");
    expect(report.totalValue).toBe("0.00"); // opening counts are not unexplained usage
    expect(await stock(mozzarella)).toBe("2000.000");
  });

  it("the worked example's day: delivery, 30 Margherita, 10 Quattro Formaggi, a dropped tray", async () => {
    await as(staff, (tx) =>
      appendMovements(tx, loc(), [
        { ingredientId: mozzarella, qtyDelta: "5000", type: "delivery", occurredAt: at(10), createdBy: staff.id },
      ]),
    );
    await importCsv([
      "1,16/11/2026,12:30,Margherita,14",
      "2,16/11/2026,13:00,Quattro Formaggi,4",
      "3,16/11/2026,19:30,Margherita,16",
      "4,16/11/2026,20:00,Quattro Formaggi,6",
    ]);
    expect(await stock(mozzarella)).toBe("2600.000");
    await as(staff, (tx) =>
      appendMovements(tx, loc(), [
        { ingredientId: mozzarella, qtyDelta: "-200", type: "waste", wasteReason: "dropped", occurredAt: at(21), createdBy: staff.id },
      ]),
    );
    expect(await stock(mozzarella)).toBe("2400.000");
  });

  it("the closing count shows -500 g and -EUR 4 (stage 4 done check)", async () => {
    closingCount = await count(staff, at(23), [{ ingredientId: mozzarella, amount: "1.9", unit: "kg" }]);
    // Submitting stores a first theoretical figure; the ledger is untouched.
    const sheet = await as(staff, (tx) => getCountSheet(tx, loc(), closingCount));
    expect(sheet?.status).toBe("submitted");
    expect(sheet?.ingredients.find((entry) => entry.id === mozzarella)?.theoreticalQty).toBe("2400.000");
    expect(await stock(mozzarella)).toBe("2400.000");

    await as(owner, (tx) => approveCount(tx, loc(), owner.id, closingCount));
    const { row, adjustments, reportLine, report } = await line(closingCount, mozzarella);
    expect([row.countedQty, row.theoreticalQty, row.isOpening]).toEqual(["1900.000", "2400.000", false]);
    expect(reportLine.differenceQty).toBe("-500.000");
    expect(reportLine.differenceValue).toBe("-4.00");
    expect(report.totalValue).toBe("-4.00");
    expect(adjustments).toBe(reportLine.differenceQty); // the invariant
    expect(await stock(mozzarella)).toBe("1900.000");

    const [listed] = await as(owner, (tx) => listApprovedCounts(tx, loc()));
    expect(listed).toMatchObject({ sessionId: closingCount, totalValue: "-4.00", lostValue: "-4.00", lineCount: 1 });
  });

  let lateImport: string;
  it("late sales: 5 more Margherita from that day, imported after the count", async () => {
    lateImport = (await importCsv(["5,16/11/2026,22:00,Margherita,5"])).importId;
    const { row, adjustments, reportLine } = await line(closingCount, mozzarella);
    expect(row.lateAdjustQty).toBe("-600.000");
    expect(reportLine.differenceQty).toBe("100.000"); // 1,900 - (2,400 - 600)
    expect(adjustments).toBe(reportLine.differenceQty);
    expect(await stock(mozzarella)).toBe("1900.000"); // still what was counted
    // The day before the count, stock reads as if the sale had been there all along.
    const before = await as(owner, (tx) => stockAt(tx, loc(), at(22, 30)));
    expect(stockOf(before, mozzarella)).toBe("1800.000");
  });

  it("undo after a count: removing the late sales puts the count back", async () => {
    await as(owner, (tx) => undoImport(tx, lateImport));
    const { row, adjustments, reportLine } = await line(closingCount, mozzarella);
    expect(row.lateAdjustQty).toBe("0.000");
    expect(reportLine.differenceQty).toBe("-500.000");
    expect(reportLine.differenceValue).toBe("-4.00");
    expect(adjustments).toBe(reportLine.differenceQty);
    expect(await stock(mozzarella)).toBe("1900.000");
  });

  it("undo of sales the count already included: they are taken out of its theoretical stock", async () => {
    // A day's import that the closing count saw on time, then undone afterwards.
    const imported = await as(owner, (tx) =>
      confirmImport(tx, loc(), owner.id, {
        fileName: "extra.csv",
        prepared: prepareImport(parseCsv("Order ID,Date,Time,Item,Quantity\n6,16/11/2026,21:30,Margherita,1\n"), MAP, TIMEZONE),
      }),
    );
    // It was imported after the approval, so it is late: -120 corrected on the count.
    let current = await line(closingCount, mozzarella);
    expect(current.row.lateAdjustQty).toBe("-120.000");
    await as(owner, (tx) => undoImport(tx, imported.importId));
    current = await line(closingCount, mozzarella);
    expect(current.row.lateAdjustQty).toBe("0.000");
    expect(current.adjustments).toBe("-500.000");
    expect(await stock(mozzarella)).toBe("1900.000");
  });

  it("a late delivery logged by staff is corrected too", async () => {
    await as(staff, (tx) =>
      appendMovements(tx, loc(), [
        { ingredientId: mozzarella, qtyDelta: "1000", type: "delivery", occurredAt: at(18), createdBy: staff.id },
      ]),
    );
    const { row, adjustments, reportLine } = await line(closingCount, mozzarella);
    expect(row.lateAdjustQty).toBe("1000.000");
    expect(reportLine.differenceQty).toBe("-1500.000"); // a bag that was delivered is also missing
    expect(adjustments).toBe(reportLine.differenceQty);
    expect(await stock(mozzarella)).toBe("1900.000");
  });

  it("counts approved out of order end up as if approved on time", async () => {
    // Basil: opening on 15 Nov, then two counts approved newest first.
    const day = (hour: number) => new Date(Date.UTC(2026, 10, 15, hour));
    const opening = await count(manager, day(6), [{ ingredientId: basil, amount: "500", unit: "g" }]);
    await as(manager, (tx) => approveCount(tx, loc(), manager.id, opening));
    await as(manager, (tx) =>
      appendMovements(tx, loc(), [
        { ingredientId: basil, qtyDelta: "-100", type: "waste", wasteReason: "expired", occurredAt: day(9), createdBy: manager.id },
        { ingredientId: basil, qtyDelta: "-50", type: "waste", wasteReason: "burnt", occurredAt: day(15), createdBy: manager.id },
      ]),
    );
    const first = await count(staff, day(12), [{ ingredientId: basil, amount: "380", unit: "g" }]); // expected 400
    const second = await count(staff, day(18), [{ ingredientId: basil, amount: "300", unit: "g" }]); // expected 380 - 50 = 330
    await as(owner, (tx) => approveCount(tx, loc(), owner.id, second));
    await as(owner, (tx) => approveCount(tx, loc(), owner.id, first));

    const a = await line(first, basil);
    const b = await line(second, basil);
    expect(a.reportLine.differenceQty).toBe("-20.000");
    expect(b.reportLine.differenceQty).toBe("-30.000");
    expect(a.adjustments).toBe(a.reportLine.differenceQty);
    expect(b.adjustments).toBe(b.reportLine.differenceQty);
    expect(await stock(basil)).toBe("300.000");
  });

  it("only the counter edits a draft, only owners and managers approve, approved counts are frozen", async () => {
    const draft = await as(staff, (tx) => startCount(tx, loc(), staff.id, randomUUID()));
    // Starting again returns the same draft.
    expect(await as(staff, (tx) => startCount(tx, loc(), staff.id, randomUUID()))).toBe(draft);
    await expect(
      as(manager, (tx) => saveCountEntries(tx, loc(), manager.id, draft, [{ ingredientId: basil, amount: "1", unit: "g" }])),
    ).rejects.toThrow("Only the person who started");
    await as(staff, (tx) => saveCountEntries(tx, loc(), staff.id, draft, [{ ingredientId: basil, amount: "250", unit: "g" }]));
    await as(staff, (tx) => submitCount(tx, loc(), staff.id, draft));
    await expect(as(staff, (tx) => approveCount(tx, loc(), staff.id, draft))).rejects.toThrow();
    await expect(as(staff, (tx) => rejectCount(tx, loc(), staff.id, draft, null))).rejects.toThrow(CountError);
    await as(manager, (tx) => rejectCount(tx, loc(), manager.id, draft, "Count the walk-in again, please"));
    const [rejected] = (await as(staff, (tx) => listCounts(tx, loc()))).filter((entry) => entry.id === draft);
    expect([rejected.status, rejected.reviewNote]).toEqual(["rejected", "Count the walk-in again, please"]);
    expect(await stock(basil)).toBe("300.000"); // a rejection changes nothing

    // Nobody can change an approved count, not even through the admin connection.
    await expect(
      as(owner, (tx) => tx.update(countLines).set({ countedQty: "1" }).where(eq(countLines.sessionId, closingCount))),
    ).rejects.toThrow();
    await expect(testDb.db.update(countSessions).set({ reviewNote: "x" }).where(eq(countSessions.id, closingCount))).rejects.toThrow();
    await expect(testDb.db.delete(countSessions).where(eq(countSessions.id, closingCount))).rejects.toThrow();
  });

  it("refuses bad entries and a count time in the future", async () => {
    const draft = await as(staff, (tx) => startCount(tx, loc(), staff.id, randomUUID()));
    for (const [entry, message] of [
      [{ ingredientId: basil, amount: "-1", unit: "g" }, "below zero"],
      [{ ingredientId: basil, amount: "lots", unit: "g" }, "not a number"],
      [{ ingredientId: basil, amount: "1", unit: "l" }, "does not match"],
      [{ ingredientId: basil, amount: "1", unit: `pack:${bag}` }, "pack size no longer exists"],
    ] as const) {
      await expect(as(staff, (tx) => saveCountEntries(tx, loc(), staff.id, draft, [entry]))).rejects.toThrow(message);
    }
    await expect(as(staff, (tx) => submitCount(tx, loc(), staff.id, draft))).rejects.toThrow("at least one ingredient");
    await as(staff, (tx) => saveCountEntries(tx, loc(), staff.id, draft, [{ ingredientId: basil, amount: "1", unit: "kg" }]));
    await expect(as(staff, (tx) => submitCount(tx, loc(), staff.id, draft, new Date(Date.now() + 3_600_000)))).rejects.toThrow(
      "future",
    );
    // An empty amount takes the ingredient off the count.
    await as(staff, (tx) => saveCountEntries(tx, loc(), staff.id, draft, [{ ingredientId: basil, amount: "", unit: "g" }]));
    const sheet = await as(staff, (tx) => getCountSheet(tx, loc(), draft));
    expect(sheet?.ingredients.find((entry) => entry.id === basil)?.countedQty).toBeNull();
  });

  it("nobody can forge a correction from an old movement, or add a line to an approved count", async () => {
    // The dropped tray was on time (before the closing count's approval). Staff
    // pointing the correction function at it must change nothing.
    const [tray] = await as(staff, (tx) =>
      tx
        .select({ id: stockMovements.id })
        .from(stockMovements)
        .where(and(eq(stockMovements.type, "waste"), eq(stockMovements.ingredientId, mozzarella))),
    );
    const before = await line(closingCount, mozzarella);
    const [result] = await as(staff, (tx) =>
      tx.execute<{ corrected: number }>(sql`select public.apply_late_corrections(array[${tray.id}::uuid]) as corrected`),
    );
    expect(result.corrected).toBe(0);
    const after = await line(closingCount, mozzarella);
    expect(after.row.lateAdjustQty).toBe(before.row.lateAdjustQty);
    expect(after.adjustments).toBe(before.adjustments);

    await expect(
      as(owner, (tx) =>
        tx.insert(countLines).values({ locationId: loc(), sessionId: closingCount, ingredientId: basil, countedQty: "1.000" }),
      ),
    ).rejects.toThrow();
  });

  it("a first count that matched exactly still makes the next count a real one", async () => {
    const day = (hour: number) => new Date(Date.UTC(2026, 10, 13, hour));
    const oregano = await as(owner, (tx) => createIngredient(tx, loc(), ingredient("Oregano")));
    // First count: nothing there, nothing expected: no adjustment is written.
    const first = await count(manager, day(8), [{ ingredientId: oregano, amount: "0", unit: "g" }]);
    expect(await as(manager, (tx) => approveCount(tx, loc(), manager.id, first))).toEqual({ adjustments: 0, openingLines: 1 });
    await as(staff, (tx) =>
      appendMovements(tx, loc(), [
        { ingredientId: oregano, qtyDelta: "200", type: "delivery", occurredAt: day(10), createdBy: staff.id },
      ]),
    );
    const second = await count(staff, day(20), [{ ingredientId: oregano, amount: "150", unit: "g" }]);
    expect(await as(manager, (tx) => approveCount(tx, loc(), manager.id, second))).toEqual({ adjustments: 1, openingLines: 0 });
    const { row, adjustments, reportLine, report } = await line(second, oregano);
    expect(row.isOpening).toBe(false);
    expect(reportLine.differenceQty).toBe("-50.000");
    expect(report.totalValue).toBe("-0.40"); // 50 g at EUR 8 per kg
    expect(adjustments).toBe(reportLine.differenceQty);
  });

  it("undoing sales the count saw on time takes them out of its expected stock", async () => {
    const day = (hour: number) => new Date(Date.UTC(2026, 10, 14, hour));
    const ricotta = await as(owner, async (tx) => {
      const id = await createIngredient(tx, loc(), ingredient("Ricotta"));
      const calzone = await createMenuItem(tx, loc(), item("Calzone"));
      await saveRecipe(tx, loc(), owner.id, calzone, recipeInputSchema.parse([{ ingredientId: id, amount: "100", unit: "g" }]));
      return id;
    });
    const opening = await count(manager, day(6), [{ ingredientId: ricotta, amount: "1000", unit: "g" }]);
    await as(manager, (tx) => approveCount(tx, loc(), manager.id, opening));
    // Two calzones at lunch (12:00 Amsterdam), imported before the evening count.
    const sale = await importCsv(["9001,14/11/2026,12:00,Calzone,2"]);
    const evening = await count(staff, day(21), [{ ingredientId: ricotta, amount: "700", unit: "g" }]);
    await as(manager, (tx) => approveCount(tx, loc(), manager.id, evening));
    let current = await line(evening, ricotta);
    expect([current.row.theoreticalQty, current.reportLine.differenceQty]).toEqual(["800.000", "-100.000"]);

    // The sales turn out to be wrong and are undone after the count.
    await as(owner, (tx) => undoImport(tx, sale.importId));
    current = await line(evening, ricotta);
    expect(current.row.lateAdjustQty).toBe("200.000");
    expect(current.reportLine.expectedQty).toBe("1000.000");
    expect(current.reportLine.differenceQty).toBe("-300.000");
    expect(current.adjustments).toBe(current.reportLine.differenceQty);
    expect(await stock(ricotta)).toBe("700.000");
  });

  it("another restaurant sees none of it", async () => {
    expect(await as(otherOwner, (tx) => listCounts(tx, loc()))).toEqual([]);
    expect(await as(otherOwner, (tx) => getCountReport(tx, loc(), closingCount))).toBeNull();
    expect(await as(otherOwner, (tx) => listApprovedCounts(tx, loc()))).toEqual([]);
    await expect(as(otherOwner, (tx) => approveCount(tx, loc(), otherOwner.id, closingCount))).rejects.toThrow();
  });
});
