import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAsUser } from "@/lib/db/rls";
import { ingredients, packSizes } from "@/lib/db/schema";
import {
  addPackSize,
  createIngredient,
  getIngredient,
  IngredientError,
  listIngredients,
  setIngredientActive,
  updateIngredient,
} from "@/lib/ingredients";
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

const mozzarella = ingredientFormSchema.parse({
  name: "Mozzarella",
  baseUnit: "g",
  costAmount: "8",
  costUnit: "kg",
  reorderPoint: "2",
  parLevel: "",
  levelUnit: "kg",
  category: "Dairy",
  storageArea: "Walk-in fridge",
});

const bag = packSizeFormSchema.parse({ label: "Bag 1 kg", amount: "1", unit: "kg", isDefault: false });

/**
 * Stage 1 done check: two accounts in different restaurants cannot see or
 * change each other's ingredients. Also covers roles inside one restaurant.
 */
describe.skipIf(!hasDatabase)("ingredients: tenant isolation and roles", () => {
  let testDb: TestDb;
  let ownerA: TestUser;
  let managerA: TestUser;
  let staffA: TestUser;
  let ownerB: TestUser;
  let restaurantA: TestRestaurant;
  let restaurantB: TestRestaurant;
  let mozzarellaA: string;
  let mozzarellaB: string;

  const as = <T>(user: TestUser, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(testDb.db, user.id, fn);

  beforeAll(async () => {
    testDb = createTestDb();
    [ownerA, managerA, staffA, ownerB] = await Promise.all([
      createTestUser("owner-a"),
      createTestUser("manager-a"),
      createTestUser("staff-a"),
      createTestUser("owner-b"),
    ]);
    restaurantA = await createTestRestaurant(testDb.db, ownerA, "Isolation A");
    restaurantB = await createTestRestaurant(testDb.db, ownerB, "Isolation B");
    await addTestMember(testDb.db, restaurantA, managerA, "manager");
    await addTestMember(testDb.db, restaurantA, staffA, "staff");

    mozzarellaA = await as(ownerA, (tx) => createIngredient(tx, restaurantA.locationId, mozzarella));
    await as(ownerA, (tx) => addPackSize(tx, restaurantA.locationId, mozzarellaA, bag));
    // The same name in another restaurant is fine: names are unique per location.
    mozzarellaB = await as(ownerB, (tx) => createIngredient(tx, restaurantB.locationId, mozzarella));
  });

  afterAll(async () => {
    await deleteTestRestaurants(testDb.db, [restaurantA, restaurantB]);
    await Promise.all([ownerA, managerA, staffA, ownerB].map(deleteTestUser));
    await testDb.close();
  });

  it("stores the form's readable units as base units", async () => {
    const saved = await as(ownerA, (tx) => getIngredient(tx, restaurantA.locationId, mozzarellaA));
    expect(saved?.costPerBaseUnit).toBe("0.008000"); // EUR 8 per kg
    expect(saved?.reorderPoint).toBe("2000.000"); // 2 kg
    expect(saved?.parLevel).toBeNull();
    expect(saved?.packSizes).toHaveLength(1);
    expect(saved?.packSizes[0].qtyInBaseUnit).toBe("1000.000");
    expect(saved?.packSizes[0].isDefault).toBe(true); // the first pack size becomes the default
  });

  it("another restaurant cannot read the ingredients", async () => {
    const seenByB = await as(ownerB, (tx) => tx.select({ id: ingredients.id }).from(ingredients));
    expect(seenByB.map((row) => row.id)).toEqual([mozzarellaB]);

    // Even when asking for restaurant A by its id.
    expect(await as(ownerB, (tx) => listIngredients(tx, restaurantA.locationId))).toEqual([]);
    expect(await as(ownerB, (tx) => getIngredient(tx, restaurantA.locationId, mozzarellaA))).toBeNull();
    const packsSeenByB = await as(ownerB, (tx) => tx.select({ id: packSizes.id }).from(packSizes));
    expect(packsSeenByB).toEqual([]);
  });

  it("another restaurant cannot change, archive or delete the ingredients", async () => {
    const updated = await as(ownerB, (tx) =>
      tx.update(ingredients).set({ name: "Hacked" }).where(eq(ingredients.id, mozzarellaA)).returning(),
    );
    expect(updated).toEqual([]);
    const deleted = await as(ownerB, (tx) =>
      tx.delete(ingredients).where(eq(ingredients.id, mozzarellaA)).returning(),
    );
    expect(deleted).toEqual([]);
    await expect(as(ownerB, (tx) => setIngredientActive(tx, restaurantA.locationId, mozzarellaA, false))).rejects.toThrow(
      IngredientError,
    );

    const stillThere = await as(ownerA, (tx) => getIngredient(tx, restaurantA.locationId, mozzarellaA));
    expect(stillThere?.name).toBe("Mozzarella");
    expect(stillThere?.isActive).toBe(true);
  });

  it("another restaurant cannot insert into the first one", async () => {
    await expect(
      as(ownerB, (tx) => createIngredient(tx, restaurantA.locationId, { ...mozzarella, name: "Planted" })),
    ).rejects.toThrow();
  });

  it("a pack size cannot point at another restaurant's ingredient", async () => {
    // Owner B writes a row for their own location that references A's ingredient:
    // RLS allows the location, the composite foreign key refuses the reference.
    await expect(
      as(ownerB, (tx) =>
        tx.insert(packSizes).values({
          locationId: restaurantB.locationId,
          ingredientId: mozzarellaA,
          label: "Cross-tenant",
          qtyInBaseUnit: "1.000",
        }),
      ),
    ).rejects.toThrow();
  });

  it("another restaurant and staff cannot write pack sizes", async () => {
    const [packA] = await as(ownerA, (tx) => tx.select({ id: packSizes.id }).from(packSizes));
    const newPack = { locationId: restaurantA.locationId, ingredientId: mozzarellaA, qtyInBaseUnit: "500.000" };

    // Owner B: insert into A's location, then update and delete A's row.
    await expect(as(ownerB, (tx) => tx.insert(packSizes).values({ ...newPack, label: "Planted" }))).rejects.toThrow();
    expect(
      await as(ownerB, (tx) => tx.update(packSizes).set({ label: "Hacked" }).where(eq(packSizes.id, packA.id)).returning()),
    ).toEqual([]);
    expect(await as(ownerB, (tx) => tx.delete(packSizes).where(eq(packSizes.id, packA.id)).returning())).toEqual([]);

    // Staff of A: may read, may not insert, update or delete.
    expect(await as(staffA, (tx) => tx.select({ id: packSizes.id }).from(packSizes))).toHaveLength(1);
    await expect(as(staffA, (tx) => tx.insert(packSizes).values({ ...newPack, label: "Staff pack" }))).rejects.toThrow();
    expect(
      await as(staffA, (tx) => tx.update(packSizes).set({ label: "Staff" }).where(eq(packSizes.id, packA.id)).returning()),
    ).toEqual([]);
    expect(await as(staffA, (tx) => tx.delete(packSizes).where(eq(packSizes.id, packA.id)).returning())).toEqual([]);

    const [unchanged] = await as(ownerA, (tx) => tx.select({ label: packSizes.label }).from(packSizes));
    expect(unchanged.label).toBe("Bag 1 kg");
  });

  it("staff can read but not write; managers can write", async () => {
    const seenByStaff = await as(staffA, (tx) => listIngredients(tx, restaurantA.locationId));
    expect(seenByStaff.map((row) => row.id)).toEqual([mozzarellaA]);

    await expect(
      as(staffA, (tx) => createIngredient(tx, restaurantA.locationId, { ...mozzarella, name: "Staff basil" })),
    ).rejects.toThrow();
    const staffUpdate = await as(staffA, (tx) =>
      tx.update(ingredients).set({ costPerBaseUnit: "0" }).where(eq(ingredients.id, mozzarellaA)).returning(),
    );
    expect(staffUpdate).toEqual([]);

    const basil = await as(managerA, (tx) =>
      createIngredient(tx, restaurantA.locationId, { ...mozzarella, name: "Basil" }),
    );
    expect(basil).toBeTruthy();
  });

  it("keeps names unique per restaurant and the unit fixed while pack sizes exist", async () => {
    await expect(
      as(ownerA, (tx) => createIngredient(tx, restaurantA.locationId, { ...mozzarella, name: "mozzarella" })),
    ).rejects.toThrow("already an ingredient");
    await expect(
      as(ownerA, (tx) =>
        updateIngredient(tx, restaurantA.locationId, mozzarellaA, {
          ...mozzarella,
          baseUnit: "ml",
          costUnit: "l",
          levelUnit: "l",
        }),
      ),
    ).rejects.toThrow("unit cannot change once");
  });

  it("allows only one default pack size per ingredient", async () => {
    const caseOfTen = packSizeFormSchema.parse({ label: "Case 10 kg", amount: "10", unit: "kg", isDefault: true });
    await as(ownerA, (tx) => addPackSize(tx, restaurantA.locationId, mozzarellaA, caseOfTen));
    const saved = await as(ownerA, (tx) => getIngredient(tx, restaurantA.locationId, mozzarellaA));
    expect(saved?.packSizes.filter((pack) => pack.isDefault).map((pack) => pack.label)).toEqual(["Case 10 kg"]);
    expect(saved?.packSizes.map((pack) => pack.qtyInBaseUnit)).toEqual(["1000.000", "10000.000"]);
  });
});
