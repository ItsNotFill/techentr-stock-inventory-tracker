import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
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
 * The setup import: the owner uploads the two template files, checks them,
 * imports, and finds the items on the menu. A broken recipes file shows its
 * error with the line and cannot be imported. Staff cannot open the screen.
 */

const TEMPLATES = path.join(__dirname, "..", "public", "templates");

let testDb: TestDb;
let owner: TestUser;
let staff: TestUser;
let restaurant: TestRestaurant;

test.beforeAll(async () => {
  testDb = createTestDb();
  [owner, staff] = await Promise.all([createTestUser("e2e-setup-owner"), createTestUser("e2e-setup-staff")]);
  restaurant = await createTestRestaurant(testDb.db, owner, "E2E Setup");
  await addTestMember(testDb.db, restaurant, staff, "staff");
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

const metric = (page: Page, label: string) =>
  page.getByText(label, { exact: true }).filter({ visible: true }).first().locator("xpath=..");

test("a broken recipes file shows its error with the line and cannot be imported", async ({ browser }) => {
  const page = await logIn(browser, owner);
  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Import from a spreadsheet" }).filter({ visible: true })).toBeVisible();
  const csv = "menu_item,ingredient,amount,unit\nMargherita,Unobtainium,120,g\n";
  await page.getByLabel("Recipes file").filter({ visible: true }).setInputFiles({
    name: "recipes.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Check files" }).click();
  await expect(page.getByText(/Line 2 of recipes\.csv:.*Unobtainium/).filter({ visible: true })).toBeVisible();
  const importButton = page.getByRole("button", { name: "Import", exact: true });
  await expect(importButton).toBeDisabled();
  await page.context().close();
});

test("the owner imports the two templates and finds the items on the menu", async ({ browser }) => {
  const page = await logIn(browser, owner);
  await page.goto("/setup");
  await page.getByLabel("Ingredients file").filter({ visible: true }).setInputFiles(path.join(TEMPLATES, "ingredients.csv"));
  await page.getByLabel("Recipes file").filter({ visible: true }).setInputFiles(path.join(TEMPLATES, "recipes.csv"));
  await page.getByRole("button", { name: "Check files" }).click();

  await expect(metric(page, "New ingredients")).toContainText("4");
  await expect(metric(page, "Pack sizes to add")).toContainText("5");
  await expect(metric(page, "New menu items")).toContainText("4");
  await expect(metric(page, "Recipes to save")).toContainText("3");

  const importButton = page.getByRole("button", { name: "Import", exact: true });
  await expect(importButton).toBeEnabled();
  await importButton.click();
  await expect(page.getByRole("status").filter({ hasText: "Imported:" }).filter({ visible: true })).toContainText(
    "4 ingredients added",
  );

  await page.getByRole("main").getByRole("link", { name: "Menu", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/menu$/);
  const margherita = page.getByRole("row", { name: /Margherita/ }).filter({ visible: true });
  await expect(margherita).toContainText("Has recipe");
  const service = page.getByRole("row", { name: /Service charge/ }).filter({ visible: true });
  await expect(service).toContainText("Needs recipe");
  await page.context().close();
});

test("staff opening the setup screen are sent to the dashboard", async ({ browser }) => {
  const page = await logIn(browser, staff);
  await page.goto("/setup");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.context().close();
});
