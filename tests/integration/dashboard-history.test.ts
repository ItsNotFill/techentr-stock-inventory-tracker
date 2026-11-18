import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approveCount, saveCountEntries, startCount, submitCount } from "@/lib/counts";
import { getDashboard } from "@/lib/dashboard";
import { runAsUser } from "@/lib/db/rls";
import { logDelivery } from "@/lib/deliveries";
import { addPackSize, createIngredient, listLowStock, setIngredientActive } from "@/lib/ingredients";
import { isLowStock, quantityToPar } from "@/lib/ingredients/stock";
import { getIngredientHistory } from "@/lib/ledger/history";
import { depleteSaleLines } from "@/lib/ledger/depletion";
import { createMenuItem, saveRecipe } from "@/lib/menu";
import { ingredientFormSchema, packSizeFormSchema } from "@/lib/validation/ingredients";
import { historyRange, historySearchSchema } from "@/lib/validation/history";
import { menuItemFormSchema, recipeInputSchema } from "@/lib/validation/menu";
import { logWaste } from "@/lib/waste";
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
import { insertTestSales } from "../helpers/sales";

const ingredient = (name: string, cost: string, reorderPoint: string, parLevel: string) =>
  ingredientFormSchema.parse({
    name,
    baseUnit: "g",
    costAmount: cost,
    costUnit: "kg",
    reorderPoint,
    parLevel,
    levelUnit: "kg",
    category: "",
    storageArea: "Walk-in fridge",
  });
const item = (posName: string) =>
  menuItemFormSchema.parse({ posName, posItemId: "", displayName: "", kind: "item", category: "", price: "" });

const HOUR = 3_600_000;

/**
 * The SPEC worked example, entered through the stage 5 code (delivery and
 * waste screens' functions, counts, sales), then read back by the low-stock
 * list, the dashboard and the stock history.
 */
describe.skipIf(!hasDatabase)("low stock, dashboard and stock history", () => {
  let testDb: TestDb;
  let owner: TestUser;
  let staff: TestUser;
  let otherOwner: TestUser;
  let restaurant: TestRestaurant;
  let otherRestaurant: TestRestaurant;
  let mozzarella: string;
  let flour: string;
  let bag: string;
  let closingCount: string;
  const start = Date.now() - 10 * HOUR;
  const at = (hours: number) => new Date(start + hours * HOUR);

  const as = <T>(user: TestUser, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(testDb.db, user.id, fn);
  const loc = () => restaurant.locationId;

  async function count(entries: { ingredientId: string; amount: string }[], time: Date) {
    const id = await as(staff, async (tx) => {
      const sessionId = await startCount(tx, loc(), staff.id, randomUUID());
      await saveCountEntries(tx, loc(), staff.id, sessionId, entries.map((entry) => ({ ...entry, unit: "g" })));
      await submitCount(tx, loc(), staff.id, sessionId, time);
      return sessionId;
    });
    await as(owner, (tx) => approveCount(tx, loc(), owner.id, id));
    return id;
  }

  beforeAll(async () => {
    testDb = createTestDb();
    [owner, staff, otherOwner] = await Promise.all([
      createTestUser("dashboard-owner"),
      createTestUser("dashboard-staff"),
      createTestUser("dashboard-other"),
    ]);
    restaurant = await createTestRestaurant(testDb.db, owner, "Dashboard");
    otherRestaurant = await createTestRestaurant(testDb.db, otherOwner, "Dashboard Other");
    await addTestMember(testDb.db, restaurant, staff, "staff");

    let margherita = "";
    let quattroFormaggi = "";
    [mozzarella, flour, bag, margherita, quattroFormaggi] = await as(owner, async (tx) => {
      // Mozzarella: EUR 8 per kg, reorder at 3 kg, par 6 kg. Flour: plenty, reorder at 1 kg.
      const cheese = await createIngredient(tx, loc(), ingredient("Mozzarella", "8", "3", "6"));
      const flourId = await createIngredient(tx, loc(), ingredient("Flour", "1.10", "1", ""));
      const bagId = await addPackSize(tx, loc(), cheese, packSizeFormSchema.parse({ label: "Bag 1 kg", amount: "1", unit: "kg", isDefault: true }));
      const pizza = await createMenuItem(tx, loc(), item("Margherita"));
      const quattro = await createMenuItem(tx, loc(), item("Quattro Formaggi"));
      await saveRecipe(tx, loc(), owner.id, pizza, recipeInputSchema.parse([{ ingredientId: cheese, amount: "120", unit: "g" }]));
      await saveRecipe(tx, loc(), owner.id, quattro, recipeInputSchema.parse([{ ingredientId: cheese, amount: "80", unit: "g" }]));
      await createMenuItem(tx, loc(), item("Mystery special")); // waits for a recipe
      return [cheese, flourId, bagId, pizza, quattro];
    });

    // The day: opening count, delivery, sales, waste, closing count.
    await count([{ ingredientId: mozzarella, amount: "2000" }, { ingredientId: flour, amount: "5000" }], at(0));
    await as(staff, (tx) =>
      logDelivery(tx, loc(), staff.id, {
        clientId: randomUUID(),
        supplierName: "Caseificio Rossi",
        deliveredAt: at(1),
        lines: [{ ingredientId: mozzarella, amount: "5", unit: `pack:${bag}` }],
      }),
    );
    const { saleIds } = await insertTestSales(testDb.db, owner.id, loc(), [
      { posOrderId: "L-1", soldAt: at(3), lines: [{ menuItemId: margherita, qty: "30" }] },
      { posOrderId: "D-1", soldAt: at(6), lines: [{ menuItemId: quattroFormaggi, qty: "10" }] },
    ]);
    await as(owner, (tx) => depleteSaleLines(tx, loc(), owner.id, { saleIds }));
    await as(staff, (tx) =>
      logWaste(tx, loc(), staff.id, {
        clientId: randomUUID(),
        ingredientId: mozzarella,
        amount: "200",
        unit: "g",
        reason: "dropped",
        note: "dropped tray",
        occurredAt: at(7),
      }),
    );
    closingCount = await count([{ ingredientId: mozzarella, amount: "1900" }, { ingredientId: flour, amount: "4800" }], at(8));
  });

  afterAll(async () => {
    await deleteTestRestaurants(testDb.db, [restaurant, otherRestaurant]);
    await Promise.all([owner, staff, otherOwner].map(deleteTestUser));
    await testDb.close();
  });

  it("decides low stock at or below the reorder point", () => {
    expect(isLowStock("1900", "3000")).toBe(true);
    expect(isLowStock("3000", "3000")).toBe(true);
    expect(isLowStock("3000.001", "3000")).toBe(false);
    expect(isLowStock("-5", null)).toBe(false);
    expect(quantityToPar("1900", "6000")).toBe("4100.000");
    expect(quantityToPar("7000", "6000")).toBeNull();
    expect(quantityToPar("100", null)).toBeNull();
  });

  it("lists mozzarella as low after the closing count, with what brings it to par", async () => {
    const low = await as(staff, (tx) => listLowStock(tx, loc()));
    expect(low).toEqual([
      expect.objectContaining({ id: mozzarella, name: "Mozzarella", stock: "1900.000", reorderPoint: "3000.000", toPar: "4100.000" }),
    ]);
    // Archived ingredients are not on the list.
    await as(owner, (tx) => setIngredientActive(tx, loc(), mozzarella, false));
    expect(await as(staff, (tx) => listLowStock(tx, loc()))).toEqual([]);
    await as(owner, (tx) => setIngredientActive(tx, loc(), mozzarella, true));
    // Another restaurant sees nothing.
    expect(await as(otherOwner, (tx) => listLowStock(tx, loc()))).toEqual([]);
  });

  it("shows the last count's unexplained usage: -500 g and -EUR 4.00 of mozzarella", async () => {
    const dashboard = await as(owner, (tx) => getDashboard(tx, loc(), { withMoney: true }));
    expect(dashboard.lastCount).toMatchObject({ sessionId: closingCount, lineCount: 2 });
    // Mozzarella -500 g x EUR 0.008 = -4.00; flour -200 g x EUR 0.0011 = -0.22.
    expect(dashboard.lastCount?.totalValue).toBe("-4.22");
    expect(dashboard.lastCount?.top).toEqual([
      { ingredientId: mozzarella, ingredientName: "Mozzarella", baseUnit: "g", differenceQty: "-500.000", differenceValue: "-4.00" },
      { ingredientId: flour, ingredientName: "Flour", baseUnit: "g", differenceQty: "-200.000", differenceValue: "-0.22" },
    ]);
    expect(dashboard.lastImport).toMatchObject({ fileName: "test.csv" });
    expect(dashboard.needsRecipe).toBe(1);
    expect(dashboard.countsWaiting).toBe(0);
    expect(dashboard.lowStock.map((row) => row.name)).toEqual(["Mozzarella"]);
  });

  it("leaves money out for staff", async () => {
    const dashboard = await as(staff, (tx) => getDashboard(tx, loc(), { withMoney: false }));
    expect(dashboard.lastCount).toBeNull();
    expect(dashboard.lowStock).toHaveLength(1);
  });

  it("shows every mozzarella movement, newest first, with the stock after each", async () => {
    const history = await as(owner, (tx) => getIngredientHistory(tx, loc(), mozzarella));
    expect(history.truncated).toBe(false);
    expect(history.rows.map((row) => [row.type, row.qtyDelta, row.stockAfter])).toEqual([
      ["count_adjust", "-500.000", "1900.000"],
      ["waste", "-200.000", "2400.000"],
      ["sale", "-800.000", "2600.000"],
      ["sale", "-3600.000", "3400.000"],
      ["delivery", "5000.000", "7000.000"],
      ["count_adjust", "2000.000", "2000.000"],
    ]);
    const [closing, waste, dinner, , delivery, opening] = history.rows;
    expect(closing.source).toEqual({ kind: "count", sessionId: closingCount, isOpening: false });
    expect(opening.source).toMatchObject({ kind: "count", isOpening: true });
    expect(waste).toMatchObject({ wasteReason: "dropped", note: "dropped tray", source: null, createdByEmail: staff.email });
    expect(dinner.source).toMatchObject({ kind: "sale", posOrderId: "D-1", menuItemName: "Quattro Formaggi", fileName: "test.csv" });
    expect(delivery).toMatchObject({ note: "5 × Bag 1 kg", source: { kind: "delivery", supplierName: "Caseificio Rossi" } });
    expect(history.totals).toEqual({ count_adjust: "1500.000", delivery: "5000.000", sale: "-4400.000", waste: "-200.000" });
  });

  it("filters by type and by date, keeping the running stock of the whole ledger", async () => {
    const deliveriesOnly = await as(owner, (tx) => getIngredientHistory(tx, loc(), mozzarella, { types: ["delivery"] }));
    expect(deliveriesOnly.rows.map((row) => row.stockAfter)).toEqual(["7000.000"]);
    expect(deliveriesOnly.totals).toEqual({ delivery: "5000.000" });

    const middle = await as(owner, (tx) => getIngredientHistory(tx, loc(), mozzarella, { from: at(2), before: at(7) }));
    expect(middle.rows.map((row) => row.type)).toEqual(["sale", "sale"]);

    const limited = await as(owner, (tx) => getIngredientHistory(tx, loc(), mozzarella, { limit: 2 }));
    expect(limited.rows).toHaveLength(2);
    expect(limited.truncated).toBe(true);

    expect((await as(otherOwner, (tx) => getIngredientHistory(tx, loc(), mozzarella))).rows).toEqual([]);
  });

  it("reads the history filters from the URL, dropping what does not parse", () => {
    expect(historySearchSchema.parse({ ingredient: mozzarella, type: "waste", from: "2026-11-01", to: "2026-11-16" })).toEqual({
      ingredient: mozzarella,
      type: "waste",
      from: "2026-11-01",
      to: "2026-11-16",
    });
    expect(historySearchSchema.parse({ ingredient: "nope", type: "theft", from: "2026-02-30", to: ["2026-11-16", "x"] })).toEqual({
      ingredient: undefined,
      type: undefined,
      from: undefined,
      to: "2026-11-16",
    });
    const range = historyRange({ from: "2026-11-16", to: "2026-11-16" }, "Europe/Amsterdam");
    expect(range.from?.toISOString()).toBe("2026-11-15T23:00:00.000Z");
    expect(range.before?.toISOString()).toBe("2026-11-16T23:00:00.000Z");
    // Backwards ranges are turned round; end of month rolls over.
    const backwards = historyRange({ from: "2026-11-30", to: "2026-11-01" }, "Europe/Amsterdam");
    expect(backwards.from?.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(backwards.before?.toISOString()).toBe("2026-11-30T23:00:00.000Z");
  });
});
