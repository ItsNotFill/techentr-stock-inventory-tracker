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
 * Suppliers: the owner adds Caseificio Rossi, picks it as Mozzarella's supplier
 * on the ingredient form, and sees Mozzarella on the supplier's page.
 * Staff cannot open the screen.
 */

test.describe.configure({ mode: "serial" });

let testDb: TestDb;
let owner: TestUser;
let staff: TestUser;
let restaurant: TestRestaurant;
let mozzarellaId = "";

test.beforeAll(async () => {
  testDb = createTestDb();
  [owner, staff] = await Promise.all([createTestUser("e2e-supp-owner"), createTestUser("e2e-supp-staff")]);
  restaurant = await createTestRestaurant(testDb.db, owner, "E2E Suppliers");
  await addTestMember(testDb.db, restaurant, staff, "staff");
  await runAsUser(testDb.db, owner.id, async (tx) => {
    mozzarellaId = await createIngredient(
      tx,
      restaurant.locationId,
      ingredientFormSchema.parse({
        name: "Mozzarella",
        baseUnit: "g",
        costAmount: "8",
        costUnit: "kg",
        reorderPoint: "",
        parLevel: "",
        levelUnit: "kg",
        category: "",
        storageArea: "",
      }),
    );
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

test("the owner adds a supplier, sets it on an ingredient and sees it on the supplier page", async ({ browser }) => {
  const page = await logIn(browser, owner);
  await page.goto("/suppliers");
  await expect(page.getByText("No suppliers yet").filter({ visible: true })).toBeVisible();
  await page.getByRole("link", { name: "Add supplier" }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/suppliers\/new$/);

  await page.getByRole("textbox", { name: "Name", exact: true }).filter({ visible: true }).fill("Caseificio Rossi");
  await page.getByRole("textbox", { name: "E-mail" }).filter({ visible: true }).fill("ordini@rossi.example");
  await page.getByRole("button", { name: "Add supplier" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/suppliers\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Caseificio Rossi" }).filter({ visible: true })).toBeVisible();

  await page.goto("/suppliers");
  const row = page.getByRole("row", { name: /Caseificio Rossi/ }).filter({ visible: true });
  await expect(row).toContainText("ordini@rossi.example");
  await expect(row.getByRole("link", { name: "ordini@rossi.example" })).toHaveAttribute("href", "mailto:ordini@rossi.example");

  await page.goto(`/ingredients/${mozzarellaId}`);
  const main = page.getByRole("main");
  await main.getByRole("combobox", { name: "Supplier" }).filter({ visible: true }).click();
  await page.getByRole("option", { name: "Caseificio Rossi" }).click();
  await main.getByRole("button", { name: "Save changes" }).filter({ visible: true }).click();
  await expect(page.getByText("Ingredient saved.").first()).toBeVisible();

  await page.goto("/suppliers");
  await page.getByRole("link", { name: "Caseificio Rossi" }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/suppliers\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("main").getByRole("link", { name: "Mozzarella" }).filter({ visible: true })).toBeVisible();
  await page.context().close();
});

test("staff opening /suppliers land on the dashboard", async ({ browser }) => {
  const page = await logIn(browser, staff);
  await page.goto("/suppliers");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.context().close();
});
