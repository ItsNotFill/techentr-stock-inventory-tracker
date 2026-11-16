import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAsUser } from "@/lib/db/rls";
import { menuItems, saleLines, sales, salesImports, stockMovements } from "@/lib/db/schema";
import {
  confirmImport,
  getSavedColumnMap,
  ImportError,
  listImports,
  parseCsv,
  prepareImport,
  previewImport,
  saveColumnMap,
  undoImport,
} from "@/lib/imports";
import { createIngredient } from "@/lib/ingredients";
import { appendMovements, stockNow, stockOf } from "@/lib/ledger";
import { createMenuItem, listUnmappedQueue, saveRecipe, setMenuItemIgnored } from "@/lib/menu";
import { menuItemStatus } from "@/lib/menu/status";
import type { ColumnMap } from "@/lib/validation/imports";
import { ingredientFormSchema } from "@/lib/validation/ingredients";
import { menuItemFormSchema, recipeInputSchema } from "@/lib/validation/menu";
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

// One day of the worked example: 30 Margherita and 10 Quattro Formaggi in total,
// plus a drink, a service charge (ignored) and a dessert the app does not know.
const DAY_CSV = [
  "Order ID,Date,Time,Item,Quantity",
  "1001,16/11/2026,12:05,Margherita,4",
  "1001,16/11/2026,12:05,Cola 33cl,4",
  "1002,16/11/2026,12:20,Margherita,6",
  "1002,16/11/2026,12:20,Service charge,1",
  "1003,16/11/2026,13:10,Quattro Formaggi,3",
  "1003,16/11/2026,13:10,Tiramisu,2",
  "1004,16/11/2026,18:45,Margherita,10",
  "1005,16/11/2026,19:30,Quattro Formaggi,7",
  "1005,16/11/2026,19:30,Tiramisu,1",
  "1006,16/11/2026,20:15,Margherita,10",
].join("\n");

const ingredient = (name: string, baseUnit: "g" | "unit" = "g") =>
  ingredientFormSchema.parse({
    name,
    baseUnit,
    costAmount: "8",
    costUnit: baseUnit === "g" ? "kg" : "unit",
    reorderPoint: "",
    parLevel: "",
    levelUnit: baseUnit === "g" ? "kg" : "unit",
    category: "",
    storageArea: "",
  });
const item = (posName: string) =>
  menuItemFormSchema.parse({ posName, posItemId: "", displayName: "", kind: "item", category: "", price: "" });

/**
 * Stage 3 done check: uploading the same CSV twice changes stock only once,
 * and the mozzarella worked example gives 2,600 g. Also: undo restores stock.
 */
describe.skipIf(!hasDatabase)("sales import: idempotent and undoable", () => {
  let testDb: TestDb;
  let owner: TestUser;
  let staff: TestUser;
  let otherOwner: TestUser;
  let restaurant: TestRestaurant;
  let otherRestaurant: TestRestaurant;
  let mozzarella: string;
  let cola: string;
  let mascarpone: string;
  let firstImportId: string;

  const as = <T>(user: TestUser, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(testDb.db, user.id, fn);
  const prepare = (csv: string) => prepareImport(parseCsv(csv), MAP, TIMEZONE);
  const importCsv = (csv: string, fileName = "day.csv") =>
    as(owner, (tx) => confirmImport(tx, restaurant.locationId, owner.id, { fileName, prepared: prepare(csv) }));
  const stock = async (ingredientId: string) =>
    stockOf(await as(owner, (tx) => stockNow(tx, restaurant.locationId)), ingredientId);
  const count = async (table: typeof sales | typeof saleLines | typeof stockMovements) =>
    (await as(owner, (tx) => tx.select({ id: table.id }).from(table))).length;

  beforeAll(async () => {
    testDb = createTestDb();
    [owner, staff, otherOwner] = await Promise.all([
      createTestUser("import-owner"),
      createTestUser("import-staff"),
      createTestUser("import-other"),
    ]);
    restaurant = await createTestRestaurant(testDb.db, owner, "Import Test");
    otherRestaurant = await createTestRestaurant(testDb.db, otherOwner, "Import Other");
    await addTestMember(testDb.db, restaurant, staff, "staff");

    await as(owner, async (tx) => {
      mozzarella = await createIngredient(tx, restaurant.locationId, ingredient("Mozzarella"));
      cola = await createIngredient(tx, restaurant.locationId, ingredient("Cola can", "unit"));
      mascarpone = await createIngredient(tx, restaurant.locationId, ingredient("Mascarpone"));
      const recipe = (ingredientId: string, amount: string, unit: string) =>
        recipeInputSchema.parse([{ ingredientId, amount, unit }]);
      const margherita = await createMenuItem(tx, restaurant.locationId, item("Margherita"));
      const quattro = await createMenuItem(tx, restaurant.locationId, item("Quattro Formaggi"));
      const colaItem = await createMenuItem(tx, restaurant.locationId, item("Cola 33cl"));
      const service = await createMenuItem(tx, restaurant.locationId, item("Service charge"));
      await saveRecipe(tx, restaurant.locationId, owner.id, margherita, recipe(mozzarella, "120", "g"));
      await saveRecipe(tx, restaurant.locationId, owner.id, quattro, recipe(mozzarella, "80", "g"));
      await saveRecipe(tx, restaurant.locationId, owner.id, colaItem, recipe(cola, "1", "unit"));
      await setMenuItemIgnored(tx, restaurant.locationId, service, true);

      // Opening count of 2,000 g and a delivery of 5 x 1 kg, before service.
      await appendMovements(tx, restaurant.locationId, [
        { ingredientId: mozzarella, qtyDelta: "2000", type: "count_adjust", occurredAt: new Date("2026-11-16T07:00:00Z"), createdBy: owner.id },
        { ingredientId: mozzarella, qtyDelta: "5000", type: "delivery", occurredAt: new Date("2026-11-16T09:00:00Z"), createdBy: owner.id },
      ]);
    });
  });

  afterAll(async () => {
    await deleteTestRestaurants(testDb.db, [restaurant, otherRestaurant]);
    await Promise.all([owner, staff, otherOwner].map(deleteTestUser));
    await testDb.close();
  });

  it("previews a file without writing anything", async () => {
    const preview = await as(owner, (tx) => previewImport(tx, restaurant.locationId, prepare(DAY_CSV)));
    expect(preview).toEqual({
      totalRows: 10,
      orders: { new: 6, alreadyImported: 0, blocked: 0 },
      // 4 Margherita lines, 2 Quattro Formaggi and 1 cola use stock; 2 Tiramisu wait; 1 service charge is ignored.
      lines: { toImport: 10, willUseStock: 7, waitingForRecipe: 2, ignored: 1 },
      newItems: [{ name: "Tiramisu", lines: 2 }],
      period: { from: "2026-11-16T11:05:00.000Z", to: "2026-11-16T19:15:00.000Z" },
    });
    expect(await count(sales)).toBe(0);
    expect(await stock(mozzarella)).toBe("7000.000");
  });

  it("imports the day: mozzarella goes from 7,000 g to 2,600 g", async () => {
    const result = await importCsv(DAY_CSV);
    firstImportId = result.importId;
    expect(result).toMatchObject({
      ordersImported: 6,
      ordersSkipped: 0,
      linesImported: 10,
      linesDepleted: 7,
      linesWaiting: 2,
      itemsCreated: ["Tiramisu"],
    });
    expect(await stock(mozzarella)).toBe("2600.000"); // 7,000 - 30 x 120 - 10 x 80
    expect(await stock(cola)).toBe("-4.000");
    expect(await count(sales)).toBe(6);
    expect(await count(saleLines)).toBe(10);
  });

  it("puts the unknown item in the unmapped queue and stores the counts", async () => {
    const [tiramisu] = await as(owner, (tx) => tx.select().from(menuItems).where(eq(menuItems.posName, "Tiramisu")));
    expect(menuItemStatus(tiramisu)).toBe("unmapped");
    const waiting = await as(owner, (tx) =>
      tx.select({ depletedAt: saleLines.depletedAt, qty: saleLines.qty }).from(saleLines).where(eq(saleLines.menuItemId, tiramisu.id)),
    );
    expect(waiting.map((line) => [line.qty, line.depletedAt])).toEqual(
      expect.arrayContaining([
        ["2.000", null],
        ["1.000", null],
      ]),
    );
    // The queue the "Needs recipe" screen shows: the dessert, with what is waiting on it.
    const queue = await as(owner, (tx) => listUnmappedQueue(tx, restaurant.locationId));
    expect(queue.map((row) => [row.posName, row.waitingLines, row.waitingQty, row.lastSoldAt?.toISOString()])).toEqual([
      ["Tiramisu", 2, "3.000", "2026-11-16T18:30:00.000Z"],
    ]);
    expect(await as(otherOwner, (tx) => listUnmappedQueue(tx, restaurant.locationId))).toEqual([]);

    const [entry] = await as(owner, (tx) => listImports(tx, restaurant.locationId));
    expect(entry).toMatchObject({ id: firstImportId, status: "confirmed", fileName: "day.csv", rowCount: 10, skippedCount: 0, unmappedCount: 2 });
  });

  it("uploading the same file again changes nothing", async () => {
    const movementsBefore = await count(stockMovements);
    const preview = await as(owner, (tx) => previewImport(tx, restaurant.locationId, prepare(DAY_CSV)));
    expect(preview.orders).toEqual({ new: 0, alreadyImported: 6, blocked: 0 });

    const again = await importCsv(DAY_CSV, "day-again.csv");
    expect(again).toMatchObject({ ordersImported: 0, ordersSkipped: 6, linesImported: 0, linesDepleted: 0, linesWaiting: 0 });
    expect(await stock(mozzarella)).toBe("2600.000");
    expect(await stock(cola)).toBe("-4.000");
    expect(await count(sales)).toBe(6);
    expect(await count(saleLines)).toBe(10);
    expect(await count(stockMovements)).toBe(movementsBefore);
  });

  it("a file that overlaps brings in only the orders that are new", async () => {
    const overlapping = [
      "Order ID,Date,Time,Item,Quantity",
      "1006,16/11/2026,20:15,Margherita,10", // already imported
      "1007,16/11/2026,21:00,Margherita,1", // new
    ].join("\n");
    const result = await importCsv(overlapping, "evening.csv");
    expect(result).toMatchObject({ ordersImported: 1, ordersSkipped: 1, linesImported: 1 });
    expect(await stock(mozzarella)).toBe("2480.000");
    // Undo only that import: the earlier day stays.
    expect(await as(owner, (tx) => undoImport(tx, result.importId))).toEqual({ sales: 1, movements: 1 });
    expect(await stock(mozzarella)).toBe("2600.000");
    expect(await count(sales)).toBe(6);
  });

  it("the same file uploaded twice at the same moment is still imported once", async () => {
    const csv = [
      "Order ID,Date,Time,Item,Quantity",
      "2001,17/11/2026,12:00,Margherita,5",
      "2002,17/11/2026,12:10,Margherita,5",
    ].join("\n");
    const results = await Promise.all([importCsv(csv, "race-a.csv"), importCsv(csv, "race-b.csv")]);
    expect(results.map((result) => result.ordersImported).sort()).toEqual([0, 2]);
    expect(results.map((result) => result.ordersSkipped).sort()).toEqual([0, 2]);
    expect(await stock(mozzarella)).toBe("1400.000"); // 2,600 - 10 x 120, once
    const winner = results.find((result) => result.ordersImported === 2)!;
    await as(owner, (tx) => undoImport(tx, winner.importId));
    expect(await stock(mozzarella)).toBe("2600.000");
  });

  it("holds back an order with a bad row and imports the rest", async () => {
    const csv = [
      "Order ID,Date,Time,Item,Quantity",
      "3001,18/11/2026,12:00,Margherita,1",
      "3002,18/11/2026,12:05,Margherita,lots",
      "3002,18/11/2026,12:05,Cola 33cl,1",
    ].join("\n");
    const prepared = prepare(csv);
    expect(prepared.blockedOrderIds).toEqual(["3002"]);
    const result = await importCsv(csv, "partly-bad.csv");
    expect(result).toMatchObject({ ordersImported: 1, linesImported: 1 });
    expect(await stock(cola)).toBe("-4.000"); // 3002's cola was not imported
    // The corrected file brings in the held-back order and skips the one already there.
    const fixed = await importCsv(csv.replace("lots", "2"), "fixed.csv");
    expect(fixed).toMatchObject({ ordersImported: 1, ordersSkipped: 1, linesImported: 2 });
    expect(await stock(cola)).toBe("-5.000");
    await as(owner, (tx) => undoImport(tx, result.importId));
    await as(owner, (tx) => undoImport(tx, fixed.importId));
    expect(await stock(mozzarella)).toBe("2600.000");
    expect(await stock(cola)).toBe("-4.000");
  });

  it("refuses a file with nothing valid in it", async () => {
    const csv = "Order ID,Date,Time,Item,Quantity\n4001,nope,12:00,Margherita,1\n";
    await expect(importCsv(csv)).rejects.toThrow(ImportError);
    expect(await as(owner, (tx) => listImports(tx, restaurant.locationId))).not.toContainEqual(
      expect.objectContaining({ fileName: "day.csv", rowCount: 0 }),
    );
  });

  it("only owners and managers can import or undo, and only in their own restaurant", async () => {
    const csv = "Order ID,Date,Time,Item,Quantity\n5001,19/11/2026,12:00,Margherita,1\n";
    await expect(
      as(staff, (tx) => confirmImport(tx, restaurant.locationId, staff.id, { fileName: "staff.csv", prepared: prepare(csv) })),
    ).rejects.toThrow();
    await expect(as(staff, (tx) => undoImport(tx, firstImportId))).rejects.toThrow("no longer exists");
    await expect(as(otherOwner, (tx) => undoImport(tx, firstImportId))).rejects.toThrow("no longer exists");
    await expect(
      as(otherOwner, (tx) =>
        confirmImport(tx, restaurant.locationId, otherOwner.id, { fileName: "other.csv", prepared: prepare(csv) }),
      ),
    ).rejects.toThrow();
    expect(await as(otherOwner, (tx) => listImports(tx, restaurant.locationId))).toEqual([]);
    // The same order number in another restaurant is a different order.
    const theirs = await as(otherOwner, (tx) =>
      confirmImport(tx, otherRestaurant.locationId, otherOwner.id, { fileName: "theirs.csv", prepared: prepare(DAY_CSV) }),
    );
    expect(theirs.ordersImported).toBe(6);
    expect(await stock(mozzarella)).toBe("2600.000");
    expect(await count(sales)).toBe(6);
  });

  it("undo removes the sales and gives the stock back, back-filled lines included", async () => {
    // The dessert gets its recipe after the import: its two sale lines are depleted now.
    const [tiramisu] = await as(owner, (tx) => tx.select().from(menuItems).where(eq(menuItems.posName, "Tiramisu")));
    const backfill = await as(owner, (tx) =>
      saveRecipe(tx, restaurant.locationId, owner.id, tiramisu.id, recipeInputSchema.parse([{ ingredientId: mascarpone, amount: "60", unit: "g" }])),
    );
    expect(backfill.backfilledLines).toBe(2);
    expect(await stock(mascarpone)).toBe("-180.000");

    // 7 movements from the import and 2 from the back-fill.
    expect(await as(owner, (tx) => undoImport(tx, firstImportId))).toEqual({ sales: 6, movements: 9 });
    expect(await stock(mozzarella)).toBe("7000.000");
    expect(await stock(cola)).toBe("0.000");
    expect(await stock(mascarpone)).toBe("0.000");
    expect(await count(sales)).toBe(0);
    expect(await count(saleLines)).toBe(0);
    // Opening count and delivery are untouched; the import row is kept for the audit trail.
    expect(await count(stockMovements)).toBe(2);
    const [row] = await as(owner, (tx) => tx.select().from(salesImports).where(eq(salesImports.id, firstImportId)));
    expect(row.status).toBe("undone");
    expect(row.undoneBy).toBe(owner.id);
    expect(row.undoneAt).not.toBeNull();
  });

  it("an import cannot be undone twice, and the file can be imported again", async () => {
    await expect(as(owner, (tx) => undoImport(tx, firstImportId))).rejects.toThrow("already undone");
    const again = await importCsv(DAY_CSV, "day-after-undo.csv");
    // The dessert has a recipe now, so every line that uses stock is depleted straight away.
    expect(again).toMatchObject({ ordersImported: 6, ordersSkipped: 0, linesImported: 10, linesDepleted: 9, linesWaiting: 0, itemsCreated: [] });
    expect(await stock(mozzarella)).toBe("2600.000");
    expect(await stock(mascarpone)).toBe("-180.000");
  });

  it("remembers the column mapping per POS", async () => {
    expect(await as(owner, (tx) => getSavedColumnMap(tx, restaurant.locationId, "default"))).toBeNull();
    await as(owner, (tx) => saveColumnMap(tx, restaurant.locationId, "default", owner.id, MAP));
    expect(await as(owner, (tx) => getSavedColumnMap(tx, restaurant.locationId, "default"))).toEqual(MAP);
    await as(owner, (tx) => saveColumnMap(tx, restaurant.locationId, "default", owner.id, { ...MAP, dateFormat: "iso" }));
    expect((await as(owner, (tx) => getSavedColumnMap(tx, restaurant.locationId, "default")))?.dateFormat).toBe("iso");
    expect(await as(otherOwner, (tx) => getSavedColumnMap(tx, restaurant.locationId, "default"))).toBeNull();
    await expect(as(staff, (tx) => saveColumnMap(tx, restaurant.locationId, "default", staff.id, MAP))).rejects.toThrow();
  });
});
