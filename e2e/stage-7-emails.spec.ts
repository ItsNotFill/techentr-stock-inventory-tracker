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
 * E-mails in Settings: the owner switches the two e-mails, previews both, and a
 * manager cannot open the preview.
 */

test.describe.configure({ mode: "serial" });

let testDb: TestDb;
let owner: TestUser;
let manager: TestUser;
let restaurant: TestRestaurant;
let restaurantName = "";

test.beforeAll(async () => {
  testDb = createTestDb();
  [owner, manager] = await Promise.all([createTestUser("e2e-mail-owner"), createTestUser("e2e-mail-manager")]);
  restaurant = await createTestRestaurant(testDb.db, owner, "E2E Emails");
  await addTestMember(testDb.db, restaurant, manager, "manager");
  await runAsUser(testDb.db, owner.id, async (tx) => {
    await createIngredient(
      tx,
      restaurant.locationId,
      ingredientFormSchema.parse({
        name: "Low Mozzarella",
        baseUnit: "g",
        costAmount: "8",
        costUnit: "kg",
        reorderPoint: "5",
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
  await Promise.all([owner, manager].map(deleteTestUser));
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

test("the owner switches and previews the e-mails", async ({ browser }) => {
  const page = await logIn(browser, owner);
  const main = page.getByRole("main").filter({ visible: true });

  await test.step("settings shows the E-mails card", async () => {
    await page.goto("/settings");
    await expect(main.getByText("E-mails", { exact: true })).toBeVisible();
    await expect(main.getByText(/E-mail is not set up yet/)).toBeVisible();
    await expect(main.getByText("Not sent yet")).toHaveCount(2);
    restaurantName = await main.getByRole("textbox", { name: "Name", exact: true }).inputValue();
  });

  await test.step("switching saves and survives a reload", async () => {
    const weekly = main.getByRole("switch", { name: "Weekly summary" });
    await expect(weekly).toBeChecked();
    await weekly.click();
    await expect(weekly).not.toBeChecked();
    await expect(page.getByText("E-mail settings saved.").first()).toBeVisible();
    await page.reload();
    await expect(main.getByRole("switch", { name: "Weekly summary" })).not.toBeChecked();
    await expect(main.getByRole("switch", { name: "Low-stock alerts" })).toBeChecked();
    await main.getByRole("switch", { name: "Weekly summary" }).click();
    await expect(main.getByRole("switch", { name: "Weekly summary" })).toBeChecked();
    await expect(main.getByRole("switch", { name: "Weekly summary" })).toBeEnabled();
  });

  await test.step("preview of both e-mails", async () => {
    await main.getByRole("link", { name: "Preview weekly summary" }).click();
    await expect(page).toHaveURL(/\/settings\/emails\/preview\?kind=weekly_summary$/);
    await expect(main.getByText(restaurantName).first()).toBeVisible();
    await expect(main.getByText("Subject")).toBeVisible();
    await main.getByRole("link", { name: "Low-stock alert" }).click();
    await expect(page).toHaveURL(/kind=low_stock$/);
    const frame = page.frameLocator('iframe[title="E-mail preview"]');
    await expect(frame.getByText("Low Mozzarella").first()).toBeVisible();
    await expect(main.getByText("Plain-text version")).toBeVisible();
  });

  await page.context().close();
});

test("a manager cannot open the preview", async ({ browser }) => {
  const page = await logIn(browser, manager);
  await page.goto("/settings/emails/preview");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.context().close();
});
