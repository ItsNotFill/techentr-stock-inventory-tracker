import { expect, test, type Browser, type Page } from "@playwright/test";
import { runAsUser } from "../lib/db/rls";
import { createIngredient } from "../lib/ingredients";
import { ingredientFormSchema } from "../lib/validation/ingredients";
import {
  addTestMember,
  createTestDb,
  createTestRestaurant,
  createTestUser,
  deleteTestRestaurants,
  deleteTestUser,
  type TestDb,
  type TestRestaurant,
  type TestUser,
} from "../tests/helpers/db";

/**
 * Prep recipes: the owner adds tomato sauce (counted in ml, 5 l a batch, from
 * 4 kg tomatoes and 200 ml olive oil) and sees the batch cost as they type.
 * A prep recipe is not offered inside itself. Staff cannot open the screen.
 */

test.describe.configure({ mode: "serial" });

let testDb: TestDb;
let owner: TestUser;
let staff: TestUser;
let restaurant: TestRestaurant;

test.beforeAll(async () => {
  testDb = createTestDb();
  [owner, staff] = await Promise.all([createTestUser("e2e-prep-owner"), createTestUser("e2e-prep-staff")]);
  restaurant = await createTestRestaurant(testDb.db, owner, "E2E Prep");
  await addTestMember(testDb.db, restaurant, staff, "staff");
  const make = (name: string, baseUnit: "g" | "ml", cost: string, costUnit: string) =>
    ingredientFormSchema.parse({
      name,
      baseUnit,
      costAmount: cost,
      costUnit,
      reorderPoint: "",
      parLevel: "",
      levelUnit: costUnit,
      category: "",
      storageArea: "",
    });
  await runAsUser(testDb.db, owner.id, async (tx) => {
    await createIngredient(tx, restaurant.locationId, make("Tomatoes", "g", "2", "kg"));
    await createIngredient(tx, restaurant.locationId, make("Olive oil", "ml", "9", "l"));
  });
});

test.afterAll(async () => {
  await deleteTestRestaurants(testDb.db, [restaurant]);
  await Promise.all([owner, staff].map(deleteTestUser));
  await testDb.close();
});

async function logIn(browser: Browser, user: TestUser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill(user.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return page;
}

test("the owner adds tomato sauce, sees the batch cost, saves and edits it", async ({ browser }) => {
  const page = await logIn(browser, owner);
  await page.goto("/prep");
  await expect(page.getByText("No prep recipes yet").filter({ visible: true })).toBeVisible();
  await page.getByRole("link", { name: "Add prep recipe" }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/prep\/new$/);

  await page.getByRole("textbox", { name: "Name" }).filter({ visible: true }).fill("Tomato sauce");
  await page.getByRole("combobox", { name: "Measured in" }).filter({ visible: true }).click();
  await page.getByRole("option", { name: "Millilitres (ml)" }).click();
  await page.getByRole("textbox", { name: "One batch makes" }).filter({ visible: true }).fill("5");

  await page.getByRole("combobox", { name: "Line 1: ingredient or prep recipe" }).filter({ visible: true }).click();
  await page.getByRole("option", { name: "Tomatoes" }).click();
  await page.getByRole("textbox", { name: "Line 1: amount" }).filter({ visible: true }).fill("4");

  await page.getByRole("button", { name: "Add line" }).filter({ visible: true }).click();
  await page.getByRole("combobox", { name: "Line 2: ingredient or prep recipe" }).filter({ visible: true }).click();
  await page.getByRole("option", { name: "Olive oil" }).click();
  await page.getByRole("combobox", { name: "Line 2: unit" }).filter({ visible: true }).click();
  await page.getByRole("option", { name: "ml", exact: true }).click();
  await page.getByRole("textbox", { name: "Line 2: amount" }).filter({ visible: true }).fill("200");

  const cost = page.getByText(/This batch costs/).filter({ visible: true });
  await expect(cost).toContainText("€9.80");
  await expect(cost).toContainText("€1.96 per l");

  await page.getByRole("button", { name: "Save", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/prep\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Tomato sauce" }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Line 1: amount" }).filter({ visible: true })).toHaveValue("4");
  await expect(page.getByRole("textbox", { name: "One batch makes" }).filter({ visible: true })).toHaveValue("5");

  // Edit: 5 kg of tomatoes costs EUR 10.00 + 1.80 = 11.80 for 5 l, 2.36 per l.
  await page.getByRole("textbox", { name: "Line 1: amount" }).filter({ visible: true }).fill("5");
  await expect(page.getByText(/This batch costs/).filter({ visible: true })).toContainText("€11.80");
  await page.getByRole("button", { name: "Save", exact: true }).filter({ visible: true }).click();
  await expect(page.getByText("Prep recipe saved.").first()).toBeVisible();

  await page.goto("/prep");
  const row = page.getByRole("row", { name: /Tomato sauce/ }).filter({ visible: true });
  await expect(row).toContainText("5 l");
  await expect(row).toContainText("€2.36 per l");
  await page.context().close();
});

test("a prep recipe is not offered inside itself", async ({ browser }) => {
  const page = await logIn(browser, owner);
  await page.goto("/prep");
  await page.getByRole("link", { name: "Tomato sauce" }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/prep\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Add line" }).filter({ visible: true }).click();
  await page.getByRole("combobox", { name: "Line 3: ingredient or prep recipe" }).filter({ visible: true }).click();
  await expect(page.getByRole("option", { name: "Tomatoes" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Tomato sauce" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // On a new prep recipe the sauce is offered, so the picker does list prep recipes.
  await page.goto("/prep/new");
  await page.getByRole("combobox", { name: "Line 1: ingredient or prep recipe" }).filter({ visible: true }).click();
  await expect(page.getByRole("option", { name: "Tomato sauce" })).toBeVisible();
  await page.context().close();
});

test("staff opening /prep land on the dashboard", async ({ browser }) => {
  const page = await logIn(browser, staff);
  await page.goto("/prep");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.context().close();
});
