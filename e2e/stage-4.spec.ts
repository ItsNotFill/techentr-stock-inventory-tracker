import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { runAsUser } from "../lib/db/rls";
import { addPackSize, createIngredient } from "../lib/ingredients";
import { appendMovements } from "../lib/ledger";
import { ingredientFormSchema, packSizeFormSchema } from "../lib/validation/ingredients";
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
 * Stage 4 through the real screens: staff count on a phone (by pack and by kg)
 * and submit; the owner reviews, approves, and reads the unexplained usage.
 */

const shown = (locator: Locator) => locator.filter({ visible: true }).first();

let testDb: TestDb;
let owner: TestUser;
let staff: TestUser;
let restaurant: TestRestaurant;

const ingredient = (name: string, cost: string, storageArea: string) =>
  ingredientFormSchema.parse({
    name,
    baseUnit: "g",
    costAmount: cost,
    costUnit: "kg",
    reorderPoint: "",
    parLevel: "",
    levelUnit: "kg",
    category: "",
    storageArea,
  });

test.beforeAll(async () => {
  testDb = createTestDb();
  [owner, staff] = await Promise.all([createTestUser("e2e-count-owner"), createTestUser("e2e-count-staff")]);
  restaurant = await createTestRestaurant(testDb.db, owner, "E2E Count");
  await addTestMember(testDb.db, restaurant, staff, "staff");
  await runAsUser(testDb.db, owner.id, async (tx) => {
    const mozzarella = await createIngredient(tx, restaurant.locationId, ingredient("Mozzarella", "8", "Walk-in fridge"));
    const basil = await createIngredient(tx, restaurant.locationId, ingredient("Basil", "25", "Walk-in fridge"));
    await createIngredient(tx, restaurant.locationId, ingredient("Flour", "1.10", "Dry store"));
    await addPackSize(tx, restaurant.locationId, mozzarella, packSizeFormSchema.parse({ label: "Bag 1 kg", amount: "1", unit: "kg", isDefault: true }));
    // Yesterday's opening stock: 3 kg of mozzarella, 500 g of basil.
    const yesterday = new Date(Date.now() - 24 * 3_600_000);
    await appendMovements(tx, restaurant.locationId, [
      { ingredientId: mozzarella, qtyDelta: "3000", type: "count_adjust", occurredAt: yesterday, createdBy: owner.id },
      { ingredientId: basil, qtyDelta: "500", type: "count_adjust", occurredAt: yesterday, createdBy: owner.id },
    ]);
  });
});

test.afterAll(async () => {
  await deleteTestRestaurants(testDb.db, [restaurant]);
  await Promise.all([owner, staff].map(deleteTestUser));
  await testDb.close();
});

async function logIn(browser: Browser, user: TestUser, phone = false): Promise<Page> {
  const context = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true } : {});
  const page = await context.newPage();
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill(user.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return page;
}

test("staff count on a phone, the owner approves, and unexplained usage shows the difference", async ({ browser }) => {
  const phone = await logIn(browser, staff, true);

  await test.step("staff start a count and enter it by pack and by kg", async () => {
    await phone.goto("/count");
    await shown(phone.getByRole("button", { name: "Start a count" })).click();
    await expect(phone).toHaveURL(/\/count\/[0-9a-f-]{36}$/);
    await expect(phone.getByText("0 of 3 counted")).toBeVisible();
    await expect(phone.getByRole("heading", { name: "Walk-in fridge" })).toBeVisible();
    await expect(phone.getByRole("heading", { name: "Dry store" })).toBeVisible();

    // Mozzarella: the default pack is preselected. 2 bags = 2,000 g.
    const mozzarella = phone.getByRole("textbox", { name: "Mozzarella", exact: true });
    await mozzarella.fill("2");
    await expect(phone.getByText("= 2,000 g")).toBeVisible();
    await mozzarella.blur();

    // The next figure is entered while the first save may still be running.
    // Basil in kg: 0,4 kg = 400 g.
    await phone.getByRole("combobox", { name: "Unit for Basil" }).click();
    await phone.getByRole("option", { name: "kg", exact: true }).click();
    const basil = phone.getByRole("textbox", { name: "Basil", exact: true });
    await basil.fill("0,4");
    await expect(phone.getByText("= 400 g")).toBeVisible();
    await basil.blur();
    await expect(phone.getByText("2 of 3 counted")).toBeVisible();
    // Both figures saved before leaving: a reload during the save would lose it.
    // Exact: the page description also contains the word "saved".
    await expect(phone.getByText("Saved", { exact: true })).toHaveCount(2);

    // Leaving and coming back keeps what was saved.
    await phone.goto("/count");
    await shown(phone.getByRole("button", { name: "Continue your count" })).click();
    await expect(phone.getByRole("textbox", { name: "Mozzarella", exact: true })).toHaveValue("2000");
    await expect(phone.getByRole("textbox", { name: "Basil", exact: true })).toHaveValue("400");
  });

  await test.step("staff submit; they see no euros", async () => {
    await phone.getByRole("button", { name: "Submit count" }).click();
    await expect(phone.getByRole("button", { name: "Submit and approve" })).toHaveCount(0);
    await phone.getByRole("alertdialog").getByRole("button", { name: "Submit count" }).click();
    await expect(phone).toHaveURL(/\/count$/);
    await expect(shown(phone.getByText("Waiting for approval"))).toBeVisible();
    await shown(phone.locator('a[href^="/count/"]')).click();
    await expect(phone.getByText("Waiting for a manager to approve it")).toBeVisible();
    await expect(phone.getByText(/€/)).toHaveCount(0);
  });

  const desk = await logIn(browser, owner);

  await test.step("the owner reviews: expected, counted, difference in units and euros", async () => {
    await desk.goto("/count");
    await expect(shown(desk.getByText("Waiting for approval"))).toBeVisible();
    await shown(desk.locator('a[href^="/count/"]')).click();
    await expect(desk).toHaveURL(/\/count\/[0-9a-f-]{36}$/);
    // Mozzarella: 3,000 expected, 2,000 counted: -1,000 g, -EUR 8.00. Basil: -100 g at EUR 25 / kg: -EUR 2.50.
    await expect(shown(desk.getByText("−1,000 g"))).toBeVisible();
    await expect(shown(desk.getByText("−€8.00"))).toBeVisible();
    await expect(shown(desk.getByText("−€2.50"))).toBeVisible();
    await expect(shown(desk.getByText(/Unexplained usage: −€10\.50/))).toBeVisible();
  });

  await test.step("the owner approves; stock becomes what was counted", async () => {
    await desk.getByRole("button", { name: "Approve" }).click();
    await expect(desk).toHaveURL(/\/count$/);
    await desk.goto("/ingredients");
    await expect(shown(desk.getByText("2,000 g"))).toBeVisible();
    await expect(shown(desk.getByText("400 g", { exact: true }))).toBeVisible();
  });

  await test.step("unexplained usage shows the count", async () => {
    await desk.goto("/unexplained-usage");
    await expect(shown(desk.getByText(/Last count: −€10\.50/))).toBeVisible();
    await shown(desk.getByRole("link", { name: "See details" })).click();
    await expect(shown(desk.getByText("−€8.00"))).toBeVisible();
    await expect(shown(desk.getByText("Mozzarella"))).toBeVisible();
  });
});
