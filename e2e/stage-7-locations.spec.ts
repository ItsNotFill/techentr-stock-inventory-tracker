import { expect, test, type Browser, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { runAsUser } from "../lib/db/rls";
import * as schema from "../lib/db/schema";
import { createIngredient } from "../lib/ingredients";
import { ingredientFormSchema } from "../lib/validation/ingredients";
import {
  addTestMember,
  createTestDb,
  createTestRestaurant,
  createTestUser,
  deleteRestaurantData,
  deleteTestUser,
  type TestDb,
  type TestRestaurant,
  type TestUser,
} from "../tests/helpers/db";

/**
 * Several locations: the owner adds Pizzeria Centro in Settings, lands on its
 * (empty) dashboard, and switches back with the shell switcher. Staff of one
 * location see no switcher.
 */

test.describe.configure({ mode: "serial" });

let testDb: TestDb;
let owner: TestUser;
let staff: TestUser;
let restaurant: TestRestaurant;

test.beforeAll(async () => {
  testDb = createTestDb();
  [owner, staff] = await Promise.all([createTestUser("e2e-loc-owner"), createTestUser("e2e-loc-staff")]);
  restaurant = await createTestRestaurant(testDb.db, owner, "E2E Locations");
  await addTestMember(testDb.db, restaurant, staff, "staff");
  await runAsUser(testDb.db, owner.id, async (tx) => {
    await createIngredient(
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
  // The app created the second location: remove every location of the organization.
  const rows = await testDb.db
    .select({ id: schema.locations.id })
    .from(schema.locations)
    .where(eq(schema.locations.orgId, restaurant.organizationId));
  await deleteRestaurantData(testDb.db, rows.map((row) => row.id), [restaurant.organizationId]);
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

test("the owner adds a location, works in it, and switches back", async ({ browser }) => {
  const page = await logIn(browser, owner);
  const sidebar = page.getByRole("complementary");

  // One location: no switcher.
  await expect(sidebar.getByRole("button", { name: /Change location/ })).toHaveCount(0);

  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: "Location name" }).filter({ visible: true }).fill("Pizzeria Centro");
  await page.getByRole("combobox", { name: "Location timezone" }).filter({ visible: true }).click();
  await page.getByRole("option", { name: "Europe/Rome", exact: true }).click();
  await page.getByRole("button", { name: "Add location" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  const switcher = sidebar.getByRole("button", { name: /Change location/ });
  await expect(switcher).toContainText("Pizzeria Centro");

  await page.goto("/ingredients");
  await expect(page.getByRole("main").getByText("Mozzarella")).toHaveCount(0);

  // Back to the first location with the shell switcher.
  await switcher.click();
  await page.getByRole("menuitem", { name: /E2E Locations/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(sidebar.getByRole("button", { name: /Change location/ })).toContainText("E2E Locations");
  await page.goto("/ingredients");
  await expect(page.getByRole("main").getByText("Mozzarella").filter({ visible: true }).first()).toBeVisible();
});

test("staff of one location see no switcher", async ({ browser }) => {
  const page = await logIn(browser, staff);
  await expect(page.getByRole("button", { name: /Change location/ })).toHaveCount(0);
});
