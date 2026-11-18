import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAsUser } from "@/lib/db/rls";
import { stockMovements } from "@/lib/db/schema";
import { addPackSize, createIngredient, setIngredientActive } from "@/lib/ingredients";
import { appendMovements, stockNow, stockOf } from "@/lib/ledger";
import { toDecimal } from "@/lib/units";
import { ingredientFormSchema, packSizeFormSchema } from "@/lib/validation/ingredients";
import { listRecentWaste, logWaste, WasteError, type NewWaste } from "@/lib/waste";
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

const HOUR = 3_600_000;

/** Log waste (lib/waste) against the real database, with the worked example's dropped tray. */
describe.skipIf(!hasDatabase)("waste", () => {
  let testDb: TestDb;
  let owner: TestUser;
  let staff: TestUser;
  let otherOwner: TestUser;
  let restaurant: TestRestaurant;
  let otherRestaurant: TestRestaurant;
  let mozzarella: string;
  let bag: string;

  const as = <T>(user: TestUser, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(testDb.db, user.id, fn);
  const loc = () => restaurant.locationId;
  const stock = async () => stockOf(await as(owner, (tx) => stockNow(tx, loc())), mozzarella);
  const waste = (overrides: Partial<NewWaste> = {}): NewWaste => ({
    clientId: randomUUID(),
    ingredientId: mozzarella,
    amount: "200",
    unit: "g",
    reason: "dropped",
    note: null,
    occurredAt: new Date(),
    ...overrides,
  });

  beforeAll(async () => {
    testDb = createTestDb();
    [owner, staff, otherOwner] = await Promise.all([
      createTestUser("waste-owner"),
      createTestUser("waste-staff"),
      createTestUser("waste-other"),
    ]);
    restaurant = await createTestRestaurant(testDb.db, owner, "Waste");
    otherRestaurant = await createTestRestaurant(testDb.db, otherOwner, "Waste Other");
    await addTestMember(testDb.db, restaurant, staff, "staff");
    [mozzarella, bag] = await as(owner, async (tx) => {
      const id = await createIngredient(tx, loc(), ingredient("Mozzarella"));
      const pack = await addPackSize(tx, loc(), id, packSizeFormSchema.parse({ label: "Bag 1 kg", amount: "1", unit: "kg", isDefault: true }));
      // The worked example just before the dropped tray: 2,600 g.
      await appendMovements(tx, loc(), [
        { ingredientId: id, qtyDelta: "2600", type: "count_adjust", occurredAt: new Date(Date.now() - 24 * HOUR), createdBy: owner.id },
      ]);
      return [id, pack];
    });
  });

  afterAll(async () => {
    await deleteTestRestaurants(testDb.db, [restaurant, otherRestaurant]);
    await Promise.all([owner, staff, otherOwner].map(deleteTestUser));
    await testDb.close();
  });

  it("logs the worked example's dropped tray: 2,600 g becomes 2,400 g", async () => {
    const logged = await as(staff, (tx) => logWaste(tx, loc(), staff.id, waste({ note: "dropped tray" })));
    expect(logged).toMatchObject({ qtyDelta: "-200.000", baseUnit: "g", ingredientName: "Mozzarella", alreadyLogged: false });
    expect(await stock()).toBe("2400.000");
    const [movement] = await testDb.db.select().from(stockMovements).where(eq(stockMovements.id, logged.movementId));
    expect(movement).toMatchObject({ type: "waste", wasteReason: "dropped", note: "dropped tray", refTable: null, createdBy: staff.id });
  });

  it("takes packs and says which pack in the note", async () => {
    const before = await stock();
    const logged = await as(staff, (tx) =>
      logWaste(tx, loc(), staff.id, waste({ amount: "0,5", unit: `pack:${bag}`, reason: "expired", note: "past date" })),
    );
    expect(logged.qtyDelta).toBe("-500.000");
    expect(await stock()).toBe(toDecimal(before).minus(500).toFixed(3));
    const [movement] = await testDb.db.select().from(stockMovements).where(eq(stockMovements.id, logged.movementId));
    expect(movement.note).toBe("0.5 × Bag 1 kg · past date");
  });

  it("writes a retried submit only once", async () => {
    const input = waste({ amount: "10" });
    const before = await stock();
    const first = await as(staff, (tx) => logWaste(tx, loc(), staff.id, input));
    const again = await as(staff, (tx) => logWaste(tx, loc(), staff.id, input));
    expect(again).toMatchObject({ movementId: first.movementId, alreadyLogged: true });
    expect(await stock()).toBe(toDecimal(before).minus(10).toFixed(3));
    // Somebody else's id is not theirs to claim.
    await expect(as(owner, (tx) => logWaste(tx, loc(), owner.id, input))).rejects.toThrow("could not be saved");
  });

  it("explains what is wrong", async () => {
    const cases: [Partial<NewWaste>, string, string][] = [
      [{ amount: "0" }, "more than zero", "amount"],
      [{ amount: "-5" }, "more than zero", "amount"],
      [{ amount: "x" }, "not a number", "amount"],
      [{ unit: "ml" }, "does not match", "unit"],
      [{ occurredAt: new Date(Date.now() + HOUR) }, "future", "occurredAt"],
      [{ occurredAt: new Date(Date.now() - 40 * 24 * HOUR) }, "31 days", "occurredAt"],
      [{ ingredientId: randomUUID() }, "no longer exists", "ingredientId"],
    ];
    for (const [overrides, message, field] of cases) {
      const error = await as(staff, (tx) => logWaste(tx, loc(), staff.id, waste(overrides))).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(WasteError);
      expect((error as WasteError).message).toContain(message);
      expect((error as WasteError).field).toBe(field);
    }
    const old = await as(owner, async (tx) => {
      const id = await createIngredient(tx, loc(), ingredient("Old cheese"));
      await setIngredientActive(tx, loc(), id, false);
      return id;
    });
    await expect(as(staff, (tx) => logWaste(tx, loc(), staff.id, waste({ ingredientId: old })))).rejects.toThrow("archived");
  });

  it("keeps restaurants apart", async () => {
    // The other restaurant cannot waste this restaurant's ingredient...
    await expect(
      as(otherOwner, (tx) => logWaste(tx, otherRestaurant.locationId, otherOwner.id, waste())),
    ).rejects.toThrow("no longer exists");
    // ...nor write into this restaurant at all.
    await expect(as(otherOwner, (tx) => logWaste(tx, loc(), otherOwner.id, waste()))).rejects.toThrow();
    expect(await as(otherOwner, (tx) => listRecentWaste(tx, loc()))).toEqual([]);
  });

  it("lists recent waste, newest first, e-mails only for managers", async () => {
    const forOwner = await as(owner, (tx) => listRecentWaste(tx, loc()));
    expect(forOwner.length).toBeGreaterThanOrEqual(3);
    expect(forOwner.find((row) => row.note === "dropped tray")).toMatchObject({
      ingredientName: "Mozzarella",
      qtyDelta: "-200.000",
      reason: "dropped",
      createdByEmail: staff.email,
    });
    const times = forOwner.map((row) => row.occurredAt.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    const forStaff = await as(staff, (tx) => listRecentWaste(tx, loc()));
    expect(forStaff.every((row) => row.createdByEmail === null)).toBe(true);
  });
});
