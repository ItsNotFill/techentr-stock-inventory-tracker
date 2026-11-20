import { expect, test, type Browser, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { runAsUser } from "../lib/db/rls";
import { stockMovements } from "../lib/db/schema";
import { createIngredient } from "../lib/ingredients";
import { depleteSaleLines } from "../lib/ledger/depletion";
import { createMenuItem } from "../lib/menu";
import { saveSubRecipe } from "../lib/sub-recipes";
import { ingredientFormSchema } from "../lib/validation/ingredients";
import { menuItemFormSchema } from "../lib/validation/menu";
import { prepLinesInputSchema, subRecipeFormSchema } from "../lib/validation/sub-recipes";
import {
  createTestDb,
  createTestRestaurant,
  createTestUser,
  deleteTestRestaurants,
  deleteTestUser,
  type TestDb,
  type TestRestaurant,
  type TestUser,
} from "../tests/helpers/db";
import { insertTestSales } from "../tests/helpers/sales";

/**
 * The recipe editor with a prep recipe as a line (DECISIONS.md 96): 250 g
 * Pizza dough and 120 g Mozzarella cost EUR 1.13, and four sales use up the
 * dough's ingredients.
 */

let testDb: TestDb;
let owner: TestUser;
let restaurant: TestRestaurant;
const ids: Record<string, string> = {};

const ingredient = (name: string, baseUnit: "g" | "ml", cost: string) =>
  ingredientFormSchema.parse({
    name,
    baseUnit,
    costAmount: cost,
    costUnit: baseUnit === "g" ? "kg" : "l",
    reorderPoint: "",
    parLevel: "",
    levelUnit: baseUnit === "g" ? "kg" : "l",
    category: "",
    storageArea: "",
  });

test.beforeAll(async () => {
  testDb = createTestDb();
  owner = await createTestUser("e2e-recipe-prep-owner");
  restaurant = await createTestRestaurant(testDb.db, owner, "E2E Recipe Prep");
  const loc = restaurant.locationId;
  await runAsUser(testDb.db, owner.id, async (tx) => {
    ids.flour = await createIngredient(tx, loc, ingredient("Flour", "g", "1.10"));
    ids.water = await createIngredient(tx, loc, ingredient("Water", "ml", "0"));
    ids.salt = await createIngredient(tx, loc, ingredient("Salt", "g", "0.50"));
    ids.mozzarella = await createIngredient(tx, loc, ingredient("Mozzarella", "g", "8"));
    ids.dough = await saveSubRecipe(
      tx,
      loc,
      null,
      subRecipeFormSchema.parse({ name: "Pizza dough", baseUnit: "g", yieldAmount: "10", yieldUnit: "kg", category: "" }),
      prepLinesInputSchema.parse([
        { ingredientId: ids.flour, amount: "6", unit: "kg" },
        { ingredientId: ids.water, amount: "3.9", unit: "l" },
        { ingredientId: ids.salt, amount: "100", unit: "g" },
      ]),
    );
    ids.margherita = await createMenuItem(
      tx,
      loc,
      menuItemFormSchema.parse({ posName: "Margherita", posItemId: "", displayName: "", kind: "item", category: "", price: "" }),
    );
  });
});

test.afterAll(async () => {
  await deleteTestRestaurants(testDb.db, [restaurant]);
  await deleteTestUser(owner);
  await testDb.close();
});

async function logIn(browser: Browser, user: TestUser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill(user.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return page;
}

const amount = (page: Page, line: number) =>
  page.getByRole("textbox", { name: `Amount, line ${line}`, exact: true }).filter({ visible: true });

test("the owner adds a prep recipe line, sees the cost, saves, and sales use up its ingredients", async ({ browser }) => {
  const page = await logIn(browser, owner);
  await page.goto(`/menu/${ids.margherita}`);
  await expect(page.getByRole("heading", { name: "Margherita" }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Needs recipe").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Prep recipes" }).filter({ visible: true })).toHaveAttribute("href", "/prep");

  await page.getByRole("button", { name: "Add ingredient" }).filter({ visible: true }).click();
  await page.getByLabel("Ingredient, line 1").filter({ visible: true }).click();
  await expect(page.getByRole("group", { name: "Prep recipes" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Ingredients" })).toBeVisible();
  await page.getByRole("option", { name: "Pizza dough", exact: true }).click();
  await amount(page, 1).fill("250");

  await page.getByRole("button", { name: "Add ingredient" }).filter({ visible: true }).click();
  await page.getByLabel("Ingredient, line 2").filter({ visible: true }).click();
  // The prep recipe used on line 1 is no longer offered; the ingredients are.
  await expect(page.getByRole("option", { name: "Pizza dough", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Mozzarella", exact: true }).click();
  await amount(page, 2).fill("120");

  // 250 x 0.000665 = 0.16625 and 120 x 0.008 = 0.96 make 1.12625, shown as EUR 1.13.
  await expect(page.getByText("€1.13").filter({ visible: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByText("Has recipe").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Unsaved changes")).toBeHidden();

  await page.reload();
  await expect(amount(page, 1)).toHaveValue("250");
  await expect(amount(page, 2)).toHaveValue("120");
  await expect(page.getByLabel("Ingredient, line 1").filter({ visible: true })).toContainText("Pizza dough");
  await expect(page.getByLabel("Ingredient, line 2").filter({ visible: true })).toContainText("Mozzarella");
  await expect(page.getByText("€1.13").filter({ visible: true }).first()).toBeVisible();
  await page.context().close();

  // Four sales use up the dough's ingredients and the mozzarella.
  const loc = restaurant.locationId;
  const { saleIds } = await insertTestSales(testDb.db, owner.id, loc, [
    { posOrderId: "E2E-PREP-1", soldAt: new Date(Date.now() - 3_600_000), lines: [{ menuItemId: ids.margherita, qty: "4" }] },
  ]);
  await runAsUser(testDb.db, owner.id, (tx) => depleteSaleLines(tx, loc, owner.id, { saleIds }));
  const movements = await testDb.db
    .select({ ingredientId: stockMovements.ingredientId, qtyDelta: stockMovements.qtyDelta })
    .from(stockMovements)
    .where(and(eq(stockMovements.locationId, loc), eq(stockMovements.type, "sale")));
  const byIngredient = Object.fromEntries(movements.map((row) => [row.ingredientId, Number(row.qtyDelta)]));
  expect(byIngredient).toEqual({
    [ids.flour]: -600, // 4 x 250 g x 0.6
    [ids.water]: -390, // 4 x 250 g x 0.39
    [ids.salt]: -10, // 4 x 250 g x 0.01
    [ids.mozzarella]: -480, // 4 x 120 g
  });
});
