import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approveCount, saveCountEntries, startCount, submitCount } from "@/lib/counts";
import { runAsUser } from "@/lib/db/rls";
import { countLines, deliveries, deliveryLines, stockMovements } from "@/lib/db/schema";
import { DeliveryError, listDeliveries, logDelivery } from "@/lib/deliveries";
import { addPackSize, createIngredient, listEntryOptions, setIngredientActive } from "@/lib/ingredients";
import { appendMovements, stockNow, stockOf } from "@/lib/ledger";
import { toDecimal } from "@/lib/units";
import { ingredientFormSchema, packSizeFormSchema } from "@/lib/validation/ingredients";
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

const ingredient = (name: string, baseUnit: "g" | "ml" = "g") =>
  ingredientFormSchema.parse({
    name,
    baseUnit,
    costAmount: "8",
    costUnit: baseUnit === "g" ? "kg" : "l",
    reorderPoint: "",
    parLevel: "",
    levelUnit: baseUnit === "g" ? "kg" : "l",
    category: "",
    storageArea: "",
  });

const HOUR = 3_600_000;

/**
 * Log delivery (lib/deliveries) against the real database: the worked
 * example's 5 x 1 kg bags, retries, input errors, late deliveries and
 * tenant isolation.
 */
describe.skipIf(!hasDatabase)("deliveries", () => {
  let testDb: TestDb;
  let owner: TestUser;
  let staff: TestUser;
  let otherOwner: TestUser;
  let restaurant: TestRestaurant;
  let otherRestaurant: TestRestaurant;
  let mozzarella: string;
  let milk: string;
  let bag: string;
  let crate: string;
  let otherIngredient: string;

  const as = <T>(user: TestUser, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(testDb.db, user.id, fn);
  const loc = () => restaurant.locationId;
  const stock = async (id: string) => stockOf(await as(owner, (tx) => stockNow(tx, loc())), id);
  const log = (user: TestUser, lines: { ingredientId: string; amount: string; unit: string }[], extra: Partial<{ clientId: string; deliveredAt: Date; supplierName: string }> = {}) =>
    as(user, (tx) =>
      logDelivery(tx, loc(), user.id, {
        clientId: extra.clientId ?? randomUUID(),
        supplierName: extra.supplierName ?? null,
        deliveredAt: extra.deliveredAt ?? new Date(),
        lines,
      }),
    );

  beforeAll(async () => {
    testDb = createTestDb();
    [owner, staff, otherOwner] = await Promise.all([
      createTestUser("deliveries-owner"),
      createTestUser("deliveries-staff"),
      createTestUser("deliveries-other"),
    ]);
    restaurant = await createTestRestaurant(testDb.db, owner, "Deliveries");
    otherRestaurant = await createTestRestaurant(testDb.db, otherOwner, "Deliveries Other");
    await addTestMember(testDb.db, restaurant, staff, "staff");
    [mozzarella, milk, bag, crate] = await as(owner, async (tx) => {
      const cheese = await createIngredient(tx, loc(), ingredient("Mozzarella"));
      const milkId = await createIngredient(tx, loc(), ingredient("Milk", "ml"));
      const bagId = await addPackSize(tx, loc(), cheese, packSizeFormSchema.parse({ label: "Bag 1 kg", amount: "1", unit: "kg", isDefault: true }));
      const crateId = await addPackSize(tx, loc(), milkId, packSizeFormSchema.parse({ label: "Crate 12×1 L", amount: "12", unit: "l", isDefault: true }));
      // The worked example's opening stock: 2,000 g, yesterday.
      await appendMovements(tx, loc(), [
        { ingredientId: cheese, qtyDelta: "2000", type: "count_adjust", occurredAt: new Date(Date.now() - 24 * HOUR), createdBy: owner.id },
      ]);
      return [cheese, milkId, bagId, crateId];
    });
    otherIngredient = await as(otherOwner, (tx) => createIngredient(tx, otherRestaurant.locationId, ingredient("Other cheese")));
  });

  afterAll(async () => {
    await deleteTestRestaurants(testDb.db, [restaurant, otherRestaurant]);
    await Promise.all([owner, staff, otherOwner].map(deleteTestUser));
    await testDb.close();
  });

  it("adds the worked example's 5 x 1 kg bags: 2,000 g becomes 7,000 g", async () => {
    const deliveredAt = new Date(Date.now() - HOUR);
    const logged = await log(staff, [{ ingredientId: mozzarella, amount: "5", unit: `pack:${bag}` }], {
      deliveredAt,
      supplierName: "Caseificio Rossi",
    });
    expect(logged).toMatchObject({ lineCount: 1, alreadyLogged: false });
    expect(await stock(mozzarella)).toBe("7000.000");

    const [delivery] = await testDb.db.select().from(deliveries).where(eq(deliveries.id, logged.id));
    expect(delivery).toMatchObject({ source: "manual", status: "confirmed", supplierName: "Caseificio Rossi", createdBy: staff.id, confirmedBy: staff.id });
    const [line] = await testDb.db.select().from(deliveryLines).where(eq(deliveryLines.deliveryId, logged.id));
    expect(line).toMatchObject({ ingredientId: mozzarella, packSizeId: bag, packCount: "5.000", qtyBaseUnit: "5000.000" });

    const [movement] = await testDb.db
      .select()
      .from(stockMovements)
      .where(and(eq(stockMovements.refTable, "delivery_lines"), eq(stockMovements.refId, line.id)));
    expect(movement).toMatchObject({ type: "delivery", qtyDelta: "5000.000", note: "5 × Bag 1 kg", createdBy: staff.id });
    expect(movement.occurredAt.getTime()).toBe(deliveredAt.getTime());
  });

  it("takes several lines, in packs or in units", async () => {
    const before = { mozzarella: await stock(mozzarella), milk: await stock(milk) };
    const logged = await log(owner, [
      { ingredientId: mozzarella, amount: "2,5", unit: "kg" },
      { ingredientId: milk, amount: "2", unit: `pack:${crate}` },
      { ingredientId: milk, amount: "75", unit: "cl" },
    ]);
    expect(logged.lineCount).toBe(3);
    expect(await stock(mozzarella)).toBe(toDecimal(before.mozzarella).plus(2500).toFixed(3));
    expect(await stock(milk)).toBe(toDecimal(before.milk).plus(24000).plus(750).toFixed(3));
  });

  it("writes a retried submit only once", async () => {
    const clientId = randomUUID();
    const before = await stock(mozzarella);
    const first = await log(staff, [{ ingredientId: mozzarella, amount: "1", unit: `pack:${bag}` }], { clientId });
    const again = await log(staff, [{ ingredientId: mozzarella, amount: "1", unit: `pack:${bag}` }], { clientId });
    expect(again).toEqual({ id: first.id, lineCount: 1, alreadyLogged: true });
    expect(await stock(mozzarella)).toBe(toDecimal(before).plus(1000).toFixed(3));
  });

  it("explains what is wrong with a line", async () => {
    const cases: [{ ingredientId: string; amount: string; unit: string }, string, string][] = [
      [{ ingredientId: mozzarella, amount: "0", unit: "kg" }, "more than zero", "lines.0.amount"],
      [{ ingredientId: mozzarella, amount: "-2", unit: "kg" }, "more than zero", "lines.0.amount"],
      [{ ingredientId: mozzarella, amount: "abc", unit: "kg" }, "not a number", "lines.0.amount"],
      [{ ingredientId: mozzarella, amount: "1", unit: "l" }, "does not match", "lines.0.unit"],
      [{ ingredientId: mozzarella, amount: "1", unit: `pack:${crate}` }, "no longer exists", "lines.0.unit"],
      [{ ingredientId: otherIngredient, amount: "1", unit: "kg" }, "no longer exists", "lines.0.ingredientId"],
    ];
    for (const [line, message, field] of cases) {
      const error = await log(staff, [line]).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(DeliveryError);
      expect((error as DeliveryError).message).toContain(message);
      expect((error as DeliveryError).field).toBe(field);
    }
  });

  it("refuses a time in the future or more than 31 days ago", async () => {
    const line = [{ ingredientId: mozzarella, amount: "1", unit: "kg" }];
    await expect(log(staff, line, { deliveredAt: new Date(Date.now() + HOUR) })).rejects.toThrow("future");
    await expect(log(staff, line, { deliveredAt: new Date(Date.now() - 32 * 24 * HOUR) })).rejects.toThrow("31 days");
  });

  it("refuses an archived ingredient", async () => {
    const old = await as(owner, async (tx) => {
      const id = await createIngredient(tx, loc(), ingredient("Old cheese"));
      await setIngredientActive(tx, loc(), id, false);
      return id;
    });
    await expect(log(staff, [{ ingredientId: old, amount: "1", unit: "kg" }])).rejects.toThrow("archived");
    const options = await as(staff, (tx) => listEntryOptions(tx, loc()));
    expect(options.map((option) => option.id)).not.toContain(old);
    // Phone screens get no costs.
    expect(Object.keys(options[0]).sort()).toEqual(["baseUnit", "id", "name", "packSizes", "storageArea"]);
  });

  it("keeps an approved count right when a delivery is dated before it", async () => {
    // Count 4 kg of mozzarella an hour ago, approved.
    const countTime = new Date(Date.now() - 2 * HOUR);
    const sessionId = await as(staff, async (tx) => {
      const id = await startCount(tx, loc(), staff.id, randomUUID());
      await saveCountEntries(tx, loc(), staff.id, id, [{ ingredientId: mozzarella, amount: "4", unit: "kg" }]);
      await submitCount(tx, loc(), staff.id, id, countTime);
      return id;
    });
    await as(owner, (tx) => approveCount(tx, loc(), owner.id, sessionId));
    const afterCount = await stock(mozzarella);

    // Staff then log a delivery that arrived before the count.
    await log(staff, [{ ingredientId: mozzarella, amount: "3", unit: `pack:${bag}` }], { deliveredAt: new Date(countTime.getTime() - HOUR) });
    expect(await stock(mozzarella)).toBe(afterCount);
    const [line] = await testDb.db.select().from(countLines).where(eq(countLines.sessionId, sessionId));
    expect(line.lateAdjustQty).toBe("3000.000");
  });

  it("lists deliveries with their lines; e-mails only for managers", async () => {
    const forOwner = await as(owner, (tx) => listDeliveries(tx, loc()));
    const example = forOwner.find((delivery) => delivery.supplierName === "Caseificio Rossi");
    expect(example?.createdByEmail).toBe(staff.email);
    expect(example?.lines).toEqual([
      expect.objectContaining({ ingredientName: "Mozzarella", baseUnit: "g", qtyBaseUnit: "5000.000", packCount: "5.000", packLabel: "Bag 1 kg" }),
    ]);
    const forStaff = await as(staff, (tx) => listDeliveries(tx, loc()));
    expect(forStaff.length).toBe(forOwner.length);
    expect(forStaff.every((delivery) => delivery.createdByEmail === null)).toBe(true);
    // Newest delivery time first.
    const times = forOwner.map((delivery) => delivery.deliveredAt.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    expect(await as(otherOwner, (tx) => listDeliveries(tx, loc()))).toEqual([]);
  });
});
