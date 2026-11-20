import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAsUser } from "@/lib/db/rls";
import { stockMovements } from "@/lib/db/schema";
import { baseUnitLocked, createIngredient } from "@/lib/ingredients";
import { depleteSaleLines } from "@/lib/ledger/depletion";
import { createMenuItem, getMenuItem, listMenuItems, saveRecipe } from "@/lib/menu";
import { getSubRecipe, listSubRecipes, saveSubRecipe, setSubRecipeActive, SubRecipeError } from "@/lib/sub-recipes";
import { ingredientFormSchema } from "@/lib/validation/ingredients";
import { menuItemFormSchema, recipeInputSchema } from "@/lib/validation/menu";
import { prepLinesInputSchema, subRecipeFormSchema } from "@/lib/validation/sub-recipes";
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

const ingredient = (name: string, baseUnit: "g" | "ml", costPerKgOrL: string) =>
  ingredientFormSchema.parse({
    name,
    baseUnit,
    costAmount: costPerKgOrL,
    costUnit: baseUnit === "g" ? "kg" : "l",
    reorderPoint: "",
    parLevel: "",
    levelUnit: baseUnit === "g" ? "kg" : "l",
    category: "",
    storageArea: "",
  });
const prep = (name: string, baseUnit: "g" | "ml" | "unit", yieldAmount: string, yieldUnit: string) =>
  subRecipeFormSchema.parse({ name, baseUnit, yieldAmount, yieldUnit, category: "" });
const line = (target: { ingredientId?: string; subRecipeId?: string }, amount: string, unit: string) => ({ ...target, amount, unit });

/**
 * Prep recipes against the real database (DECISIONS.md 96): pizza dough, and
 * a tomato sauce that uses garlic oil, both used by the Margherita.
 */
describe.skipIf(!hasDatabase)("prep recipes", () => {
  let testDb: TestDb;
  let owner: TestUser;
  let staff: TestUser;
  let otherOwner: TestUser;
  let restaurant: TestRestaurant;
  let otherRestaurant: TestRestaurant;
  const ids: Record<string, string> = {};

  const as = <T>(user: TestUser, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(testDb.db, user.id, fn);
  const loc = () => restaurant.locationId;
  const lines = (input: Parameters<typeof prepLinesInputSchema.parse>[0]) => prepLinesInputSchema.parse(input);

  beforeAll(async () => {
    testDb = createTestDb();
    [owner, staff, otherOwner] = await Promise.all([createTestUser("prep-owner"), createTestUser("prep-staff"), createTestUser("prep-other")]);
    restaurant = await createTestRestaurant(testDb.db, owner, "Prep Recipes");
    otherRestaurant = await createTestRestaurant(testDb.db, otherOwner, "Prep Other");
    await addTestMember(testDb.db, restaurant, staff, "staff");
    await as(owner, async (tx) => {
      ids.flour = await createIngredient(tx, loc(), ingredient("Flour", "g", "1.10"));
      ids.water = await createIngredient(tx, loc(), ingredient("Water", "ml", "0"));
      ids.salt = await createIngredient(tx, loc(), ingredient("Salt", "g", "0.50"));
      ids.tomatoes = await createIngredient(tx, loc(), ingredient("Tomatoes", "g", "2"));
      ids.oil = await createIngredient(tx, loc(), ingredient("Olive oil", "ml", "9"));
      ids.garlic = await createIngredient(tx, loc(), ingredient("Garlic", "g", "6"));
      ids.mozzarella = await createIngredient(tx, loc(), ingredient("Mozzarella", "g", "8"));
      ids.dough = await saveSubRecipe(tx, loc(), null, prep("Pizza dough", "g", "10", "kg"), lines([
        line({ ingredientId: ids.flour }, "6", "kg"),
        line({ ingredientId: ids.water }, "3.9", "l"),
        line({ ingredientId: ids.salt }, "100", "g"),
      ]));
      ids.garlicOil = await saveSubRecipe(tx, loc(), null, prep("Garlic oil", "ml", "1", "l"), lines([
        line({ ingredientId: ids.oil }, "900", "ml"),
        line({ ingredientId: ids.garlic }, "100", "g"),
      ]));
      ids.sauce = await saveSubRecipe(tx, loc(), null, prep("Tomato sauce", "ml", "5", "l"), lines([
        line({ ingredientId: ids.tomatoes }, "4", "kg"),
        line({ subRecipeId: ids.garlicOil }, "200", "ml"),
      ]));
      ids.margherita = await createMenuItem(tx, loc(), menuItemFormSchema.parse({ posName: "Margherita", posItemId: "", displayName: "", kind: "item", category: "", price: "" }));
      await saveRecipe(tx, loc(), owner.id, ids.margherita, recipeInputSchema.parse([
        line({ subRecipeId: ids.dough }, "250", "g"),
        line({ subRecipeId: ids.sauce }, "80", "ml"),
        line({ ingredientId: ids.mozzarella }, "120", "g"),
      ]));
    });
  });

  afterAll(async () => {
    await deleteTestRestaurants(testDb.db, [restaurant, otherRestaurant]);
    await Promise.all([owner, staff, otherOwner].map(deleteTestUser));
    await testDb.close();
  });

  it("expands prep recipes into their ingredients when 30 Margherita sell, one movement per ingredient", async () => {
    const { saleIds } = await insertTestSales(testDb.db, owner.id, loc(), [
      { posOrderId: "PREP-1", soldAt: new Date(Date.now() - 3_600_000), lines: [{ menuItemId: ids.margherita, qty: "30" }] },
    ]);
    const result = await as(owner, (tx) => depleteSaleLines(tx, loc(), owner.id, { saleIds }));
    expect(result).toEqual({ linesDepleted: 1, movementsWritten: 7 });

    const movements = await testDb.db
      .select({ ingredientId: stockMovements.ingredientId, qtyDelta: stockMovements.qtyDelta })
      .from(stockMovements)
      .where(and(eq(stockMovements.locationId, loc()), eq(stockMovements.type, "sale")));
    const byIngredient = Object.fromEntries(movements.map((row) => [row.ingredientId, row.qtyDelta]));
    expect(byIngredient).toEqual({
      [ids.flour]: "-4500.000", // 30 x 250 g x 0.6
      [ids.water]: "-2925.000", // 30 x 250 g x 0.39
      [ids.salt]: "-75.000", // 30 x 250 g x 0.01
      [ids.tomatoes]: "-1920.000", // 30 x 80 ml x 0.8
      [ids.oil]: "-86.400", // 30 x 80 ml x 0.04 garlic oil x 0.9
      [ids.garlic]: "-9.600", // 30 x 80 ml x 0.04 garlic oil x 0.1
      [ids.mozzarella]: "-3600.000",
    });
  });

  it("costs the Margherita with its prep recipes: EUR 1.28", async () => {
    // Mozzarella 0.96 + dough 250 x 0.000665 + sauce 80 x 0.001948 = 1.28209.
    const items = await as(owner, (tx) => listMenuItems(tx, loc()));
    expect(items.find((item) => item.id === ids.margherita)?.recipeCost).toBe("1.28");
    const detail = await as(owner, (tx) => getMenuItem(tx, loc(), ids.margherita));
    expect(detail?.lines.find((row) => row.subRecipeId === ids.dough)).toMatchObject({
      subRecipeName: "Pizza dough",
      baseUnit: "g",
      costPerBaseUnit: "0.000665",
      qtyBaseUnit: "250.000",
      confirmed: true,
    });
    const preps = await as(owner, (tx) => listSubRecipes(tx, loc()));
    expect(preps.map((row) => [row.name, row.costPerUnit, row.usedBy])).toEqual([
      ["Garlic oil", "0.008700", 1],
      ["Pizza dough", "0.000665", 1],
      ["Tomato sauce", "0.001948", 1],
    ]);
  });

  it("refuses a prep recipe inside itself, directly or through another one", async () => {
    const values = prep("Garlic oil", "ml", "1", "l");
    await expect(
      as(owner, (tx) => saveSubRecipe(tx, loc(), ids.garlicOil, values, lines([line({ subRecipeId: ids.garlicOil }, "1", "ml")]))),
    ).rejects.toThrow("cannot contain itself");
    await expect(
      as(owner, (tx) =>
        saveSubRecipe(tx, loc(), ids.garlicOil, values, lines([line({ ingredientId: ids.oil }, "900", "ml"), line({ subRecipeId: ids.sauce }, "10", "ml")])),
      ),
    ).rejects.toThrow("inside itself");
  });

  it("refuses to nest deeper than five, counting the prep recipes above the one being saved", async () => {
    // E < D < C < B < A: five deep, the most allowed.
    const chain = await as(owner, async (tx) => {
      const made: string[] = [];
      let child: string | null = null;
      for (const name of ["Chain E", "Chain D", "Chain C", "Chain B", "Chain A"]) {
        const chainLines = child ? [line({ subRecipeId: child }, "1", "g")] : [line({ ingredientId: ids.salt }, "1", "g")];
        child = await saveSubRecipe(tx, loc(), null, prep(name, "g", "1", "kg"), lines(chainLines));
        made.push(child);
      }
      return made;
    });
    const [bottom] = chain;
    const extra = await as(owner, (tx) => saveSubRecipe(tx, loc(), null, prep("Chain F", "g", "1", "kg"), lines([line({ ingredientId: ids.salt }, "1", "g")])));
    // Giving the bottom one a child of its own would make the chain six deep.
    await expect(
      as(owner, (tx) => saveSubRecipe(tx, loc(), bottom, prep("Chain E", "g", "1", "kg"), lines([line({ subRecipeId: extra }, "1", "g")]))),
    ).rejects.toThrow("nested at most 5 deep");
    // The top one still works out.
    const top = await as(owner, (tx) => getSubRecipe(tx, loc(), chain[4]));
    expect(top?.costPerUnit).not.toBeNull();
  });

  it("checks names, units and what a prep recipe is used by", async () => {
    await expect(
      as(owner, (tx) => saveSubRecipe(tx, loc(), null, prep("pizza DOUGH", "g", "1", "kg"), lines([line({ ingredientId: ids.flour }, "1", "kg")]))),
    ).rejects.toThrow("already a prep recipe with this name");
    await expect(
      as(owner, (tx) => saveSubRecipe(tx, loc(), null, prep("Brine", "ml", "1", "l"), lines([line({ ingredientId: ids.salt }, "1", "l")]))),
    ).rejects.toThrow("does not match");
    // Used by the Margherita: its unit is fixed.
    const error = await as(owner, (tx) =>
      saveSubRecipe(tx, loc(), ids.dough, prep("Pizza dough", "unit", "10", "unit"), lines([line({ ingredientId: ids.flour }, "6", "kg")])),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SubRecipeError);
    expect((error as SubRecipeError).field).toBe("baseUnit");
    expect((await as(owner, (tx) => getSubRecipe(tx, loc(), ids.dough)))?.usedBy.menuItems).toEqual([{ id: ids.margherita, name: "Margherita" }]);
    // Flour is in the dough: its unit is fixed too.
    expect(await as(owner, (tx) => baseUnitLocked(tx, loc(), ids.flour))).toBe(true);
  });

  it("keeps an archived prep recipe working where it is used, but not in new recipes", async () => {
    await as(owner, (tx) => setSubRecipeActive(tx, loc(), ids.garlicOil, false));
    const salad = await as(owner, (tx) =>
      createMenuItem(tx, loc(), menuItemFormSchema.parse({ posName: "Bruschetta", posItemId: "", displayName: "", kind: "item", category: "", price: "" })),
    );
    await expect(
      as(owner, (tx) => saveRecipe(tx, loc(), owner.id, salad, recipeInputSchema.parse([line({ subRecipeId: ids.garlicOil }, "10", "ml")]))),
    ).rejects.toThrow("archived");
    // The sauce still uses it, and still costs the same.
    const sauce = await as(owner, (tx) => getSubRecipe(tx, loc(), ids.sauce));
    expect(sauce?.costPerUnit).toBe("0.001948");
    await as(owner, (tx) => setSubRecipeActive(tx, loc(), ids.garlicOil, true));
  });

  it("refuses staff, and keeps restaurants apart", async () => {
    await expect(
      as(staff, (tx) => saveSubRecipe(tx, loc(), null, prep("Pesto", "g", "1", "kg"), lines([line({ ingredientId: ids.garlic }, "50", "g")]))),
    ).rejects.toThrow();
    expect(await as(otherOwner, (tx) => listSubRecipes(tx, loc()))).toEqual([]);
    const otherItem = await as(otherOwner, (tx) =>
      createMenuItem(tx, otherRestaurant.locationId, menuItemFormSchema.parse({ posName: "Copy", posItemId: "", displayName: "", kind: "item", category: "", price: "" })),
    );
    // Another restaurant's prep recipe is unknown here.
    await expect(
      as(otherOwner, (tx) =>
        saveRecipe(tx, otherRestaurant.locationId, otherOwner.id, otherItem, recipeInputSchema.parse([line({ subRecipeId: ids.dough }, "250", "g")])),
      ),
    ).rejects.toThrow("no longer exists");
  });

  it("can switch a recipe line between an ingredient and a prep recipe", async () => {
    await as(owner, (tx) =>
      saveRecipe(tx, loc(), owner.id, ids.margherita, recipeInputSchema.parse([
        line({ subRecipeId: ids.dough }, "250", "g"),
        line({ ingredientId: ids.tomatoes }, "60", "g"),
        line({ ingredientId: ids.mozzarella }, "120", "g"),
      ])),
    );
    const detail = await as(owner, (tx) => getMenuItem(tx, loc(), ids.margherita));
    // Kept lines keep their place; the new one comes last.
    expect(detail?.lines.map((row) => row.subRecipeName ?? row.ingredientName)).toEqual(["Pizza dough", "Mozzarella", "Tomatoes"]);
    expect(detail?.lines.some((row) => row.subRecipeId === ids.sauce)).toBe(false);
  });
});
