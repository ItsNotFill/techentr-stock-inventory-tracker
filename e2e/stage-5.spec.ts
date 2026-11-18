import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { runAsUser } from "../lib/db/rls";
import { addPackSize, createIngredient } from "../lib/ingredients";
import { stockNow } from "../lib/ledger";
import { toDecimal } from "../lib/units";
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
 * Stage 5 through the real screens: staff log a delivery on a phone, in a
 * pack and in kg, and the stock goes up by exactly that.
 */

const shown = (locator: Locator) => locator.filter({ visible: true }).first();

let testDb: TestDb;
let owner: TestUser;
let staff: TestUser;
let restaurant: TestRestaurant;
let mozzarellaId = "";
let basilId = "";

const ingredient = (name: string, storageArea: string) =>
  ingredientFormSchema.parse({
    name,
    baseUnit: "g",
    costAmount: "8",
    costUnit: "kg",
    reorderPoint: "",
    parLevel: "",
    levelUnit: "kg",
    category: "",
    storageArea,
  });

test.beforeAll(async () => {
  testDb = createTestDb();
  [owner, staff] = await Promise.all([createTestUser("e2e-deliv-owner"), createTestUser("e2e-deliv-staff")]);
  restaurant = await createTestRestaurant(testDb.db, owner, "E2E Deliveries");
  await addTestMember(testDb.db, restaurant, staff, "staff");
  await runAsUser(testDb.db, owner.id, async (tx) => {
    mozzarellaId = await createIngredient(tx, restaurant.locationId, ingredient("Mozzarella", "Walk-in fridge"));
    basilId = await createIngredient(tx, restaurant.locationId, ingredient("Basil", "Walk-in fridge"));
    await addPackSize(tx, restaurant.locationId, mozzarellaId, packSizeFormSchema.parse({ label: "Bag 1 kg", amount: "1", unit: "kg", isDefault: true }));
  });
});

test.afterAll(async () => {
  await deleteTestRestaurants(testDb.db, [restaurant]);
  await Promise.all([owner, staff].map(deleteTestUser));
  await testDb.close();
});

async function logIn(browser: Browser, user: TestUser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill(user.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return page;
}

const stockOf = (id: string) =>
  runAsUser(testDb.db, owner.id, async (tx) => toDecimal((await stockNow(tx, restaurant.locationId, [id])).get(id) ?? "0"));

test("staff log a delivery on a phone and stock goes up", async ({ browser }) => {
  const phone = await logIn(browser, staff);
  const before = await stockOf(mozzarellaId);

  await test.step("an empty amount shows the error and writes nothing", async () => {
    await shown(phone.getByRole("link", { name: "Deliveries" })).click();
    await expect(phone).toHaveURL(/\/deliveries$/);
    await expect(shown(phone.getByRole("heading", { name: "Log delivery" }))).toBeVisible();
    await shown(phone.getByLabel("Ingredient")).selectOption({ label: "Mozzarella" });
    await shown(phone.getByRole("button", { name: "Log delivery" })).click();
    await expect(shown(phone.getByText("Enter how much."))).toBeVisible();
    expect((await stockOf(mozzarellaId)).eq(before)).toBe(true);
    await expect(shown(phone.getByText("No deliveries yet"))).toBeVisible();
  });

  await test.step("5 bags of mozzarella and 2,5 kg of basil", async () => {
    const amounts = phone.getByRole("textbox", { name: "Amount" }).filter({ visible: true });
    await amounts.first().fill("5");
    await expect(shown(phone.getByText("= 5,000 g"))).toBeVisible();

    await shown(phone.getByRole("button", { name: "Add another item" })).click();
    await phone.getByLabel("Ingredient").filter({ visible: true }).nth(1).selectOption({ label: "Basil" });
    await phone.getByLabel("Unit", { exact: true }).filter({ visible: true }).nth(1).selectOption("kg");
    await amounts.nth(1).fill("2,5");
    await expect(shown(phone.getByText("= 2,500 g"))).toBeVisible();

    await shown(phone.getByRole("textbox", { name: "Supplier (optional)" })).fill("Fresh Dairy Co");
    await shown(phone.getByRole("button", { name: "Log delivery" })).click();
    await expect(shown(phone.getByText("Delivery logged: 2 items added to stock."))).toBeVisible();
  });

  await test.step("the delivery is listed, the form is empty, no euros", async () => {
    await expect(shown(phone.getByText("Fresh Dairy Co"))).toBeVisible();
    await expect(shown(phone.getByText("5 × Bag 1 kg (5,000 g)"))).toBeVisible();
    await expect(shown(phone.getByText("2,500 g", { exact: true }))).toBeVisible();
    await expect(shown(phone.getByRole("textbox", { name: "Amount" }))).toHaveValue("");
    await expect(phone.getByText(/€/)).toHaveCount(0);
  });

  await test.step("stock went up by exactly that", async () => {
    expect((await stockOf(mozzarellaId)).eq(before.plus(5000))).toBe(true);
    expect((await stockOf(basilId)).eq(2500)).toBe(true);
  });

  await phone.context().close();
});

test("staff log waste on a phone: reason required, then stock goes down", async ({ browser }) => {
  const phone = await logIn(browser, staff);
  const before = await stockOf(mozzarellaId);

  await shown(phone.getByRole("link", { name: "Waste" })).click();
  await expect(phone).toHaveURL(/\/waste$/);
  await expect(shown(phone.getByRole("heading", { name: "Log waste" }))).toBeVisible();

  await test.step("no reason: the error shows and nothing is written", async () => {
    await shown(phone.getByLabel("Ingredient")).selectOption({ label: "Mozzarella" });
    await shown(phone.getByLabel("Unit", { exact: true })).selectOption("g");
    await shown(phone.getByRole("textbox", { name: "Amount" })).fill("200");
    await shown(phone.getByRole("button", { name: "Log waste" })).click();
    await expect(shown(phone.getByText("Choose why it was thrown away."))).toBeVisible();
    expect((await stockOf(mozzarellaId)).eq(before)).toBe(true);
    await expect(shown(phone.getByText("No waste logged yet"))).toBeVisible();
  });

  await test.step("200 g dropped, with a note", async () => {
    await shown(phone.getByRole("button", { name: "Dropped" })).click();
    await shown(phone.getByRole("textbox", { name: "Note (optional)" })).fill("dropped tray");
    await shown(phone.getByRole("button", { name: "Log waste" })).click();
    await expect(shown(phone.getByText("Waste logged: 200 g of Mozzarella."))).toBeVisible();
    await expect(shown(phone.getByText("dropped tray"))).toBeVisible();
    await expect(shown(phone.getByText("−200 g"))).toBeVisible();
    await expect(shown(phone.getByRole("textbox", { name: "Amount" }))).toHaveValue("");
    await expect(phone.getByText(/€/)).toHaveCount(0);
  });

  await test.step("stock went down by exactly 200 g", async () => {
    expect((await stockOf(mozzarellaId)).eq(before.minus(200))).toBe(true);
  });

  await phone.context().close();
});
