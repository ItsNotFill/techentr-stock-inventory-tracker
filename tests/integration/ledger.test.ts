import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAsUser } from "@/lib/db/rls";
import { saleLines, stockMovements } from "@/lib/db/schema";
import { baseUnitLocked, createIngredient } from "@/lib/ingredients";
import { appendMovements, LedgerError, stockAt, stockNow, stockOf } from "@/lib/ledger";
import { depleteSaleLines } from "@/lib/ledger/depletion";
import { createMenuItem, saveRecipe } from "@/lib/menu";
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
import { insertTestSales } from "../helpers/sales";

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
    storageArea: "",
  });
const item = (posName: string) =>
  menuItemFormSchema.parse({ posName, posItemId: "", displayName: "", kind: "item", category: "", price: "" });

// The day of the worked example, in order.
const OPENING = new Date("2026-11-16T08:00:00Z");
const DELIVERY = new Date("2026-11-16T10:00:00Z");
const LUNCH = new Date("2026-11-16T12:30:00Z");
const DINNER = new Date("2026-11-16T19:30:00Z");

/**
 * The ledger against the real database: the SPEC worked example up to
 * 2,600 g, depletion, back-fill, append-only enforcement and tenant rules.
 */
describe.skipIf(!hasDatabase)("ledger and depletion", () => {
  let testDb: TestDb;
  let owner: TestUser;
  let staff: TestUser;
  let otherOwner: TestUser;
  let restaurant: TestRestaurant;
  let otherRestaurant: TestRestaurant;
  let mozzarella: string;
  let cream: string;
  let otherIngredient: string;
  let margherita: string;
  let quattroFormaggi: string;
  let tiramisu: string;

  const as = <T>(user: TestUser, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(testDb.db, user.id, fn);
  const mozzarellaNow = async () => stockOf(await as(owner, (tx) => stockNow(tx, restaurant.locationId)), mozzarella);

  beforeAll(async () => {
    testDb = createTestDb();
    [owner, staff, otherOwner] = await Promise.all([
      createTestUser("ledger-owner"),
      createTestUser("ledger-staff"),
      createTestUser("ledger-other"),
    ]);
    restaurant = await createTestRestaurant(testDb.db, owner, "Ledger Test");
    otherRestaurant = await createTestRestaurant(testDb.db, otherOwner, "Ledger Other");
    await addTestMember(testDb.db, restaurant, staff, "staff");

    [mozzarella, cream] = await as(owner, async (tx) => [
      await createIngredient(tx, restaurant.locationId, ingredient("Mozzarella")),
      await createIngredient(tx, restaurant.locationId, ingredient("Mascarpone")),
    ]);
    otherIngredient = await as(otherOwner, (tx) => createIngredient(tx, otherRestaurant.locationId, ingredient("Mozzarella")));
    [margherita, quattroFormaggi, tiramisu] = await as(owner, async (tx) => [
      await createMenuItem(tx, restaurant.locationId, item("Margherita")),
      await createMenuItem(tx, restaurant.locationId, item("Quattro Formaggi")),
      await createMenuItem(tx, restaurant.locationId, item("Tiramisu")),
    ]);
    const recipe = (grams: string) => recipeInputSchema.parse([{ ingredientId: mozzarella, amount: grams, unit: "g" }]);
    await as(owner, (tx) => saveRecipe(tx, restaurant.locationId, owner.id, margherita, recipe("120")));
    await as(owner, (tx) => saveRecipe(tx, restaurant.locationId, owner.id, quattroFormaggi, recipe("80")));
  });

  afterAll(async () => {
    await deleteTestRestaurants(testDb.db, [restaurant, otherRestaurant]);
    await Promise.all([owner, staff, otherOwner].map(deleteTestUser));
    await testDb.close();
  });

  it("an ingredient without movements has no stock", async () => {
    expect(await mozzarellaNow()).toBe("0.000");
  });

  it("opening stock and a delivery add up: 2,000 g + 5 x 1 kg = 7,000 g", async () => {
    await as(owner, (tx) =>
      appendMovements(tx, restaurant.locationId, [
        { ingredientId: mozzarella, qtyDelta: "2000", type: "count_adjust", occurredAt: OPENING, createdBy: owner.id },
      ]),
    );
    expect(await mozzarellaNow()).toBe("2000.000");
    // Staff may log a delivery.
    await as(staff, (tx) =>
      appendMovements(tx, restaurant.locationId, [
        { ingredientId: mozzarella, qtyDelta: "5000", type: "delivery", occurredAt: DELIVERY, createdBy: staff.id },
      ]),
    );
    expect(await mozzarellaNow()).toBe("7000.000");
  });

  it("depletes sales through recipes: 30 Margherita and 10 Quattro Formaggi leave 2,600 g", async () => {
    const { saleIds } = await insertTestSales(testDb.db, owner.id, restaurant.locationId, [
      { posOrderId: "L-1", soldAt: LUNCH, lines: [{ menuItemId: margherita, qty: "12" }] },
      { posOrderId: "L-2", soldAt: LUNCH, lines: [{ menuItemId: margherita, qty: "18" }, { menuItemId: tiramisu, qty: "4" }] },
      { posOrderId: "D-1", soldAt: DINNER, lines: [{ menuItemId: quattroFormaggi, qty: "10" }] },
    ]);
    // Nothing moves until the lines are depleted.
    expect(await mozzarellaNow()).toBe("7000.000");

    const result = await as(owner, (tx) => depleteSaleLines(tx, restaurant.locationId, owner.id, { saleIds }));
    expect(result).toEqual({ linesDepleted: 3, movementsWritten: 3 });
    expect(await mozzarellaNow()).toBe("2600.000");

    const movements = await as(owner, (tx) =>
      tx
        .select({ qtyDelta: stockMovements.qtyDelta, occurredAt: stockMovements.occurredAt, refTable: stockMovements.refTable })
        .from(stockMovements)
        .where(eq(stockMovements.type, "sale"))
        .orderBy(stockMovements.qtyDelta),
    );
    expect(movements.map((row) => row.qtyDelta)).toEqual(["-2160.000", "-1440.000", "-800.000"]);
    expect(movements.every((row) => row.refTable === "sale_lines")).toBe(true);
    // Each movement is dated at its sale, not at the import.
    expect(movements.map((row) => row.occurredAt.toISOString()).sort()).toEqual(
      [LUNCH, LUNCH, DINNER].map((date) => date.toISOString()).sort(),
    );
  });

  it("depleting again changes nothing", async () => {
    const lines = await as(owner, (tx) => tx.select({ saleId: saleLines.saleId }).from(saleLines));
    const again = await as(owner, (tx) =>
      depleteSaleLines(tx, restaurant.locationId, owner.id, { saleIds: lines.map((line) => line.saleId) }),
    );
    expect(again).toEqual({ linesDepleted: 0, movementsWritten: 0 });
    expect(await mozzarellaNow()).toBe("2600.000");
  });

  it("knows the stock at any past moment", async () => {
    const at = async (moment: Date) =>
      stockOf(await as(owner, (tx) => stockAt(tx, restaurant.locationId, moment)), mozzarella);
    expect(await at(new Date("2026-11-16T07:00:00Z"))).toBe("0.000");
    expect(await at(OPENING)).toBe("2000.000");
    expect(await at(new Date("2026-11-16T11:00:00Z"))).toBe("7000.000");
    expect(await at(new Date("2026-11-16T13:00:00Z"))).toBe("3400.000"); // after 30 Margherita
    expect(await at(DINNER)).toBe("2600.000");
  });

  it("lines of an item without a recipe wait, and are depleted when it gets one", async () => {
    const waiting = () =>
      as(owner, (tx) =>
        tx.select({ depletedAt: saleLines.depletedAt }).from(saleLines).where(eq(saleLines.menuItemId, tiramisu)),
      );
    expect((await waiting()).map((line) => line.depletedAt)).toEqual([null]);
    const before = await as(owner, (tx) => stockNow(tx, restaurant.locationId));
    expect(stockOf(before, cream)).toBe("0.000");

    const result = await as(owner, (tx) =>
      saveRecipe(
        tx,
        restaurant.locationId,
        owner.id,
        tiramisu,
        recipeInputSchema.parse([{ ingredientId: cream, amount: "60", unit: "g" }]),
      ),
    );
    expect(result).toEqual({ isMapped: true, backfilledLines: 1 });
    expect((await waiting())[0].depletedAt).not.toBeNull();

    // 4 Tiramisu x 60 g, dated at the sale.
    const after = await as(owner, (tx) => stockNow(tx, restaurant.locationId));
    expect(stockOf(after, cream)).toBe("-240.000");
    const beforeLunch = await as(owner, (tx) => stockAt(tx, restaurant.locationId, DELIVERY));
    expect(stockOf(beforeLunch, cream)).toBe("0.000");
    // The other ingredient is untouched.
    expect(stockOf(after, mozzarella)).toBe("2600.000");
  });

  it("a recipe change applies to future sales only", async () => {
    await as(owner, (tx) =>
      saveRecipe(
        tx,
        restaurant.locationId,
        owner.id,
        tiramisu,
        recipeInputSchema.parse([{ ingredientId: cream, amount: "100", unit: "g" }]),
      ),
    );
    const stock = await as(owner, (tx) => stockNow(tx, restaurant.locationId));
    expect(stockOf(stock, cream)).toBe("-240.000"); // still 4 x 60 g
  });

  it("a refund gives stock back", async () => {
    const { saleIds } = await insertTestSales(testDb.db, owner.id, restaurant.locationId, [
      { posOrderId: "R-1", soldAt: DINNER, lines: [{ menuItemId: margherita, qty: "-1" }] },
    ]);
    await as(owner, (tx) => depleteSaleLines(tx, restaurant.locationId, owner.id, { saleIds }));
    expect(await mozzarellaNow()).toBe("2720.000");
    // Put it back for the checks below with a matching sale.
    const again = await insertTestSales(testDb.db, owner.id, restaurant.locationId, [
      { posOrderId: "R-2", soldAt: DINNER, lines: [{ menuItemId: margherita, qty: "1" }] },
    ]);
    await as(owner, (tx) => depleteSaleLines(tx, restaurant.locationId, owner.id, { saleIds: again.saleIds }));
    expect(await mozzarellaNow()).toBe("2600.000");
  });

  it("is append-only: nobody can update, delete or truncate movements", async () => {
    // The app role has no such privilege.
    await expect(as(owner, (tx) => tx.update(stockMovements).set({ qtyDelta: "1" }))).rejects.toThrow();
    await expect(as(owner, (tx) => tx.delete(stockMovements))).rejects.toThrow();
    // Even the admin connection is stopped by the triggers.
    await expect(testDb.db.update(stockMovements).set({ note: "edited" }).where(eq(stockMovements.locationId, restaurant.locationId))).rejects.toThrow();
    await expect(testDb.db.delete(stockMovements).where(eq(stockMovements.locationId, restaurant.locationId))).rejects.toThrow();
    await expect(testDb.db.execute(sql`truncate table public.stock_movements`)).rejects.toThrow();
    expect(await mozzarellaNow()).toBe("2600.000");
  });

  it("sale lines cannot be changed after the fact, except for marking them depleted", async () => {
    const [line] = await as(owner, (tx) => tx.select({ id: saleLines.id }).from(saleLines).limit(1));
    await expect(as(owner, (tx) => tx.update(saleLines).set({ qty: "999" }).where(eq(saleLines.id, line.id)))).rejects.toThrow();
  });

  it("lets staff log deliveries and waste, but not sales or count adjustments", async () => {
    const now = new Date();
    await as(staff, (tx) =>
      appendMovements(tx, restaurant.locationId, [
        { ingredientId: cream, qtyDelta: "-10", type: "waste", wasteReason: "dropped", occurredAt: now, createdBy: staff.id },
      ]),
    );
    await expect(
      as(staff, (tx) =>
        appendMovements(tx, restaurant.locationId, [
          { ingredientId: cream, qtyDelta: "500", type: "count_adjust", occurredAt: now, createdBy: staff.id },
        ]),
      ),
    ).rejects.toThrow();
    const [line] = await as(owner, (tx) => tx.select({ id: saleLines.id }).from(saleLines).limit(1));
    await expect(
      as(staff, (tx) =>
        appendMovements(tx, restaurant.locationId, [
          { ingredientId: cream, qtyDelta: "-5", type: "sale", refTable: "sale_lines", refId: line.id, occurredAt: now, createdBy: staff.id },
        ]),
      ),
    ).rejects.toThrow();
    const stock = await as(owner, (tx) => stockNow(tx, restaurant.locationId));
    expect(stockOf(stock, cream)).toBe("-250.000");
  });

  it("keeps restaurants apart", async () => {
    const now = new Date();
    // Another restaurant sees nothing here.
    expect(await as(otherOwner, (tx) => stockNow(tx, restaurant.locationId))).toEqual(new Map());
    expect(await as(otherOwner, (tx) => tx.select({ id: stockMovements.id }).from(stockMovements))).toEqual([]);
    // It cannot append to this restaurant's ledger...
    await expect(
      as(otherOwner, (tx) =>
        appendMovements(tx, restaurant.locationId, [
          { ingredientId: mozzarella, qtyDelta: "-1000", type: "count_adjust", occurredAt: now, createdBy: otherOwner.id },
        ]),
      ),
    ).rejects.toThrow();
    // ...nor move this restaurant's ingredient from its own ledger (composite key)...
    await expect(
      as(otherOwner, (tx) =>
        appendMovements(tx, otherRestaurant.locationId, [
          { ingredientId: mozzarella, qtyDelta: "-1000", type: "count_adjust", occurredAt: now, createdBy: otherOwner.id },
        ]),
      ),
    ).rejects.toThrow();
    // ...nor point a movement at this restaurant's sale line.
    const [line] = await as(owner, (tx) => tx.select({ id: saleLines.id }).from(saleLines).limit(1));
    await expect(
      as(otherOwner, (tx) =>
        appendMovements(tx, otherRestaurant.locationId, [
          { ingredientId: otherIngredient, qtyDelta: "-5", type: "sale", refTable: "sale_lines", refId: line.id, occurredAt: now, createdBy: otherOwner.id },
        ]),
      ),
    ).rejects.toThrow(LedgerError);
    expect(await mozzarellaNow()).toBe("2600.000");
  });

  it("fixes an ingredient's unit once it has movements or is used in a recipe", async () => {
    expect(await as(owner, (tx) => baseUnitLocked(tx, restaurant.locationId, mozzarella))).toBe(true);
    const fresh = await as(owner, (tx) => createIngredient(tx, restaurant.locationId, ingredient("Fresh basil")));
    expect(await as(owner, (tx) => baseUnitLocked(tx, restaurant.locationId, fresh))).toBe(false);
    await as(owner, (tx) =>
      appendMovements(tx, restaurant.locationId, [
        { ingredientId: fresh, qtyDelta: "100", type: "delivery", occurredAt: new Date(), createdBy: owner.id },
      ]),
    );
    expect(await as(owner, (tx) => baseUnitLocked(tx, restaurant.locationId, fresh))).toBe(true);
  });
});
