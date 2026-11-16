import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAsUser } from "@/lib/db/rls";
import { menuItems, recipeLines } from "@/lib/db/schema";
import { createIngredient, setIngredientActive } from "@/lib/ingredients";
import {
  createMenuItem,
  deleteMenuItem,
  getMenuItem,
  listMenuItems,
  MenuError,
  recipeCost,
  saveRecipe,
  setMenuItemIgnored,
  updateMenuItem,
} from "@/lib/menu";
import { menuItemStatus } from "@/lib/menu/status";
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

const ingredient = (name: string, baseUnit: "g" | "ml" | "unit", cost: string, per: string) =>
  ingredientFormSchema.parse({
    name,
    baseUnit,
    costAmount: cost,
    costUnit: per,
    reorderPoint: "",
    parLevel: "",
    levelUnit: per,
    category: "",
    storageArea: "",
  });

const item = (posName: string, extra: Record<string, string> = {}) =>
  menuItemFormSchema.parse({ posName, posItemId: "", displayName: "", kind: "item", category: "", price: "", ...extra });

describe.skipIf(!hasDatabase)("menu items and recipes", () => {
  let testDb: TestDb;
  let owner: TestUser;
  let staff: TestUser;
  let otherOwner: TestUser;
  let restaurant: TestRestaurant;
  let otherRestaurant: TestRestaurant;
  let mozzarella: string;
  let passata: string;
  let basil: string;
  let margherita: string;

  const as = <T>(user: TestUser, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(testDb.db, user.id, fn);
  const recipe = (lines: { ingredientId: string; amount: string; unit: string }[]) => recipeInputSchema.parse(lines);
  const save = (menuItemId: string, lines: { ingredientId: string; amount: string; unit: string }[]) =>
    as(owner, (tx) => saveRecipe(tx, restaurant.locationId, owner.id, menuItemId, recipe(lines)));

  beforeAll(async () => {
    testDb = createTestDb();
    [owner, staff, otherOwner] = await Promise.all([
      createTestUser("menu-owner"),
      createTestUser("menu-staff"),
      createTestUser("menu-other"),
    ]);
    restaurant = await createTestRestaurant(testDb.db, owner, "Menu Test");
    otherRestaurant = await createTestRestaurant(testDb.db, otherOwner, "Menu Other");
    await addTestMember(testDb.db, restaurant, staff, "staff");

    [mozzarella, passata, basil] = await as(owner, async (tx) => [
      await createIngredient(tx, restaurant.locationId, ingredient("Mozzarella", "g", "8", "kg")),
      await createIngredient(tx, restaurant.locationId, ingredient("Passata", "ml", "2.20", "l")),
      await createIngredient(tx, restaurant.locationId, ingredient("Basil", "g", "25", "kg")),
    ]);
    margherita = await as(owner, (tx) =>
      createMenuItem(tx, restaurant.locationId, item("MARGHERITA", { displayName: "Margherita", price: "9.5" })),
    );
  });

  afterAll(async () => {
    await deleteTestRestaurants(testDb.db, [restaurant, otherRestaurant]);
    await Promise.all([owner, staff, otherOwner].map(deleteTestUser));
    await testDb.close();
  });

  it("starts a new item unmapped, with the display name defaulting to the POS name", async () => {
    const coke = await as(owner, (tx) => createMenuItem(tx, restaurant.locationId, item("Coke 33cl")));
    const saved = await as(owner, (tx) => getMenuItem(tx, restaurant.locationId, coke));
    expect(saved?.displayName).toBe("Coke 33cl");
    expect(saved && menuItemStatus(saved)).toBe("unmapped");
    const pizza = await as(owner, (tx) => getMenuItem(tx, restaurant.locationId, margherita));
    expect(pizza?.displayName).toBe("Margherita");
    expect(pizza?.price).toBe("9.50");
  });

  it("keeps POS names unique without a POS id, and POS ids unique with one", async () => {
    await expect(as(owner, (tx) => createMenuItem(tx, restaurant.locationId, item("margherita")))).rejects.toThrow(
      "already an item with this POS name",
    );
    // Two POS buttons may share a name when the POS tells them apart by id.
    await as(owner, (tx) => createMenuItem(tx, restaurant.locationId, item("Special", { posItemId: "101" })));
    await as(owner, (tx) => createMenuItem(tx, restaurant.locationId, item("Special", { posItemId: "102" })));
    await expect(
      as(owner, (tx) => createMenuItem(tx, restaurant.locationId, item("Other", { posItemId: "101" }))),
    ).rejects.toThrow("already has this POS id");
    // Renaming an item to its own name is not a clash.
    await as(owner, (tx) => updateMenuItem(tx, restaurant.locationId, margherita, item("Margherita", { price: "9.5" })));
  });

  it("saving a recipe confirms its lines and maps the item (Margherita: 120 g mozzarella)", async () => {
    const result = await save(margherita, [
      { ingredientId: mozzarella, amount: "120", unit: "g" },
      { ingredientId: passata, amount: "8", unit: "cl" },
      { ingredientId: basil, amount: "0,002", unit: "kg" },
    ]);
    expect(result.isMapped).toBe(true);

    const saved = await as(owner, (tx) => getMenuItem(tx, restaurant.locationId, margherita));
    expect(saved?.isMapped).toBe(true);
    expect(saved && menuItemStatus(saved)).toBe("mapped");
    expect(saved?.lines.map((line) => [line.ingredientName, line.qtyBaseUnit, line.confirmed, line.source])).toEqual([
      ["Mozzarella", "120.000", true, "manual"],
      ["Passata", "80.000", true, "manual"],
      ["Basil", "2.000", true, "manual"],
    ]);
    // 120 g x 0.008 + 80 ml x 0.0022 + 2 g x 0.025 = 0.96 + 0.176 + 0.05 = 1.186
    expect(recipeCost(saved!.lines)).toBe("1.19");

    const [listed] = (await as(owner, (tx) => listMenuItems(tx, restaurant.locationId))).filter(
      (row) => row.id === margherita,
    );
    expect(listed.lineCount).toBe(3);
    expect(listed.draftLineCount).toBe(0);
    expect(listed.recipeCost).toBe("1.19");
  });

  it("saving again replaces the lines: changed amounts, removed and added ingredients", async () => {
    await save(margherita, [
      { ingredientId: mozzarella, amount: "0.13", unit: "kg" },
      { ingredientId: passata, amount: "80", unit: "ml" },
    ]);
    const saved = await as(owner, (tx) => getMenuItem(tx, restaurant.locationId, margherita));
    expect(saved?.lines.map((line) => [line.ingredientName, line.qtyBaseUnit])).toEqual([
      ["Mozzarella", "130.000"],
      ["Passata", "80.000"],
    ]);
    await save(margherita, [{ ingredientId: mozzarella, amount: "120", unit: "g" }]);
  });

  it("removing every line clears the mapping", async () => {
    const result = await save(margherita, []);
    expect(result.isMapped).toBe(false);
    const saved = await as(owner, (tx) => getMenuItem(tx, restaurant.locationId, margherita));
    expect(saved?.isMapped).toBe(false);
    expect(saved?.lines).toEqual([]);
    expect(saved && menuItemStatus(saved)).toBe("unmapped");
    await save(margherita, [{ ingredientId: mozzarella, amount: "120", unit: "g" }]);
  });

  it("refuses bad lines and leaves the recipe as it was", async () => {
    const attempts: [{ ingredientId: string; amount: string; unit: string }[], string][] = [
      [[{ ingredientId: mozzarella, amount: "1", unit: "l" }], "does not match"],
      [
        [
          { ingredientId: mozzarella, amount: "100", unit: "g" },
          { ingredientId: mozzarella, amount: "20", unit: "g" },
        ],
        "already in the recipe",
      ],
      [[{ ingredientId: mozzarella, amount: "0.0001", unit: "g" }], "too small"],
      [[{ ingredientId: "00000000-0000-4000-8000-000000000000", amount: "1", unit: "g" }], "no longer exists"],
    ];
    for (const [lines, message] of attempts) {
      await expect(save(margherita, lines)).rejects.toThrow(message);
    }
    expect(recipeInputSchema.safeParse([{ ingredientId: mozzarella, amount: "0", unit: "g" }]).success).toBe(false);
    expect(recipeInputSchema.safeParse([{ ingredientId: mozzarella, amount: "-5", unit: "g" }]).success).toBe(false);

    const saved = await as(owner, (tx) => getMenuItem(tx, restaurant.locationId, margherita));
    expect(saved?.lines.map((line) => line.qtyBaseUnit)).toEqual(["120.000"]);
  });

  it("refuses an archived ingredient in a recipe", async () => {
    await as(owner, (tx) => setIngredientActive(tx, restaurant.locationId, basil, false));
    await expect(save(margherita, [{ ingredientId: basil, amount: "2", unit: "g" }])).rejects.toThrow("archived");
    await as(owner, (tx) => setIngredientActive(tx, restaurant.locationId, basil, true));
  });

  it("an item is either mapped or ignored, never both", async () => {
    await expect(as(owner, (tx) => setMenuItemIgnored(tx, restaurant.locationId, margherita, true))).rejects.toThrow(
      MenuError,
    );

    const serviceCharge = await as(owner, (tx) => createMenuItem(tx, restaurant.locationId, item("Service charge")));
    await as(owner, (tx) => setMenuItemIgnored(tx, restaurant.locationId, serviceCharge, true));
    let saved = await as(owner, (tx) => getMenuItem(tx, restaurant.locationId, serviceCharge));
    expect(saved && menuItemStatus(saved)).toBe("ignored");

    // Giving an ignored item a recipe brings it back as mapped.
    await save(serviceCharge, [{ ingredientId: basil, amount: "1", unit: "g" }]);
    saved = await as(owner, (tx) => getMenuItem(tx, restaurant.locationId, serviceCharge));
    expect(saved?.isIgnored).toBe(false);
    expect(saved && menuItemStatus(saved)).toBe("mapped");

    // The database refuses both flags at once, whatever the app does.
    await expect(
      testDb.db.update(menuItems).set({ isIgnored: true }).where(eq(menuItems.id, serviceCharge)),
    ).rejects.toThrow();
  });

  it("confirms an AI draft line when it is saved, and drops drafts that were left out", async () => {
    const mojito = await as(owner, (tx) => createMenuItem(tx, restaurant.locationId, item("Mojito")));
    // What the AI onboarding will write: one draft with a known ingredient, one without.
    await testDb.db.insert(recipeLines).values([
      { locationId: restaurant.locationId, menuItemId: mojito, ingredientId: basil, qtyBaseUnit: "8.000", source: "ai" },
      {
        locationId: restaurant.locationId,
        menuItemId: mojito,
        draftIngredientName: "White rum",
        draftBaseUnit: "ml",
        qtyBaseUnit: "50.000",
        source: "ai",
      },
    ]);
    let saved = await as(owner, (tx) => getMenuItem(tx, restaurant.locationId, mojito));
    expect(saved?.isMapped).toBe(false); // drafts do not map an item
    expect(saved?.lines.map((line) => line.confirmed)).toEqual([false, false]);
    const [listed] = (await as(owner, (tx) => listMenuItems(tx, restaurant.locationId))).filter((row) => row.id === mojito);
    expect([listed.lineCount, listed.draftLineCount, listed.recipeCost]).toEqual([0, 2, null]);

    await save(mojito, [{ ingredientId: basil, amount: "10", unit: "g" }]);
    saved = await as(owner, (tx) => getMenuItem(tx, restaurant.locationId, mojito));
    expect(saved?.isMapped).toBe(true);
    expect(saved?.lines.map((line) => [line.ingredientName, line.qtyBaseUnit, line.confirmed, line.source])).toEqual([
      ["Basil", "10.000", true, "ai"],
    ]);
  });

  it("staff can read the menu but not change it", async () => {
    expect((await as(staff, (tx) => listMenuItems(tx, restaurant.locationId))).length).toBeGreaterThan(0);
    await expect(as(staff, (tx) => createMenuItem(tx, restaurant.locationId, item("Staff special")))).rejects.toThrow();
    await expect(
      as(staff, (tx) =>
        saveRecipe(tx, restaurant.locationId, staff.id, margherita, recipe([{ ingredientId: mozzarella, amount: "1", unit: "g" }])),
      ),
    ).rejects.toThrow();
    const saved = await as(owner, (tx) => getMenuItem(tx, restaurant.locationId, margherita));
    expect(saved?.lines.map((line) => line.qtyBaseUnit)).toEqual(["120.000"]);
  });

  it("another restaurant cannot see the menu or borrow its ingredients", async () => {
    expect(await as(otherOwner, (tx) => listMenuItems(tx, restaurant.locationId))).toEqual([]);
    expect(await as(otherOwner, (tx) => getMenuItem(tx, restaurant.locationId, margherita))).toBeNull();
    expect(await as(otherOwner, (tx) => tx.select({ id: recipeLines.id }).from(recipeLines))).toEqual([]);

    // Acting on this restaurant's item by its id, under either location, finds nothing.
    for (const locationId of [restaurant.locationId, otherRestaurant.locationId]) {
      await expect(
        as(otherOwner, (tx) => saveRecipe(tx, locationId, otherOwner.id, margherita, recipe([]))),
      ).rejects.toThrow("no longer exists");
      await expect(as(otherOwner, (tx) => setMenuItemIgnored(tx, locationId, margherita, true))).rejects.toThrow(
        "no longer exists",
      );
      await expect(as(otherOwner, (tx) => deleteMenuItem(tx, locationId, margherita))).rejects.toThrow(
        "no longer exists",
      );
    }
    const untouched = await as(owner, (tx) => getMenuItem(tx, restaurant.locationId, margherita));
    expect(untouched?.isMapped).toBe(true);
    expect(untouched?.lines.map((line) => line.qtyBaseUnit)).toEqual(["120.000"]);

    const theirs = await as(otherOwner, (tx) => createMenuItem(tx, otherRestaurant.locationId, item("Margherita")));
    // Through the app: the ingredient is not found in their location.
    await expect(
      as(otherOwner, (tx) =>
        saveRecipe(tx, otherRestaurant.locationId, otherOwner.id, theirs, recipe([{ ingredientId: mozzarella, amount: "120", unit: "g" }])),
      ),
    ).rejects.toThrow("no longer exists");
    // Straight at the table: the composite foreign key refuses the cross-tenant reference.
    await expect(
      as(otherOwner, (tx) =>
        tx.insert(recipeLines).values({
          locationId: otherRestaurant.locationId,
          menuItemId: theirs,
          ingredientId: mozzarella,
          qtyBaseUnit: "120.000",
        }),
      ),
    ).rejects.toThrow();
  });
});
