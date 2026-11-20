import { expect, test, type Browser, type Page } from "@playwright/test";
import { runAsUser } from "../lib/db/rls";
import { addPackSize, createIngredient } from "../lib/ingredients";
import { appendMovements, stockNow } from "../lib/ledger";
import { toDecimal } from "../lib/units";
import { saveSupplier } from "../lib/purchasing";
import { ingredientFormSchema, packSizeFormSchema } from "../lib/validation/ingredients";
import { supplierFormSchema } from "../lib/validation/purchasing";
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
 * Orders: Rossi is suggested 7 bags of mozzarella, the owner creates the
 * order, changes it to 6, marks it sent, receives 5 and stock goes up by 5 kg.
 */

test.describe.configure({ mode: "serial" });

let testDb: TestDb;
let owner: TestUser;
let staff: TestUser;
let restaurant: TestRestaurant;
let mozzarellaId = "";

test.beforeAll(async () => {
  testDb = createTestDb();
  [owner, staff] = await Promise.all([createTestUser("e2e-orders-owner"), createTestUser("e2e-orders-staff")]);
  restaurant = await createTestRestaurant(testDb.db, owner, "E2E Orders");
  await addTestMember(testDb.db, restaurant, staff, "staff");
  const loc = restaurant.locationId;
  await runAsUser(testDb.db, owner.id, async (tx) => {
    const supplierId = await saveSupplier(tx, loc, null, supplierFormSchema.parse({ name: "Caseificio Rossi", contactName: "", email: "", phone: "", notes: "" }));
    const make = (name: string, reorder: string, par: string, supplier: string) =>
      ingredientFormSchema.parse({
        name,
        baseUnit: "g",
        costAmount: "8",
        costUnit: "kg",
        reorderPoint: reorder,
        parLevel: par,
        levelUnit: "kg",
        category: "",
        storageArea: "",
        supplierId: supplier,
      });
    mozzarellaId = await createIngredient(tx, loc, make("Mozzarella", "2", "8", supplierId));
    const basilId = await createIngredient(tx, loc, make("Basil", "0.1", "0.3", ""));
    await addPackSize(tx, loc, mozzarellaId, packSizeFormSchema.parse({ label: "Bag 1 kg", amount: "1", unit: "kg", isDefault: true }));
    await appendMovements(tx, loc, [
      { ingredientId: mozzarellaId, qtyDelta: "1900", type: "count_adjust", occurredAt: new Date(Date.now() - 3_600_000), createdBy: owner.id },
      { ingredientId: basilId, qtyDelta: "50", type: "count_adjust", occurredAt: new Date(Date.now() - 3_600_000), createdBy: owner.id },
    ]);
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

test("suggest, create, edit, send, receive", async ({ browser }) => {
  const page = await logIn(browser, owner);
  await page.goto("/orders");
  const main = page.getByRole("main");
  const rossi = main.getByText("Caseificio Rossi").filter({ visible: true }).first();
  await expect(rossi).toBeVisible();
  await expect(main.getByText("7 × Bag 1 kg (7,000 g)").filter({ visible: true })).toBeVisible();
  await expect(main.getByText("No supplier").filter({ visible: true })).toBeVisible();
  await expect(main.getByText("Set a supplier on these ingredients to order them.").filter({ visible: true })).toBeVisible();
  await expect(main.getByText("250 g").filter({ visible: true })).toBeVisible();

  await main.getByRole("button", { name: "Create order" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Order for Caseificio Rossi" })).toBeVisible();
  await expect(main.getByText("Draft", { exact: true }).filter({ visible: true })).toBeVisible();

  const amount = main.getByRole("textbox", { name: "Amount" }).filter({ visible: true });
  await expect(amount).toHaveValue("7");
  await amount.fill("6");
  await main.getByRole("button", { name: "Save", exact: true }).click();
  await expect(main.getByRole("textbox", { name: "Order as text" }).filter({ visible: true })).toHaveValue(/6 × Bag 1 kg \(6,000 g\)/);

  await main.getByRole("button", { name: "Mark as sent" }).click();
  await expect(main.getByText("Waiting for delivery").filter({ visible: true }).first()).toBeVisible();

  await main.getByRole("button", { name: "Receive delivery" }).click();
  const arrived = main.getByRole("form", { name: "Receive delivery" }).getByRole("textbox", { name: "Amount" });
  await expect(arrived).toHaveValue("6");
  await arrived.fill("5");
  await main.getByRole("button", { name: "Confirm delivery" }).click();
  await expect(main.getByText(/Received .*The delivery is logged/).filter({ visible: true })).toBeVisible();
  await expect(main.getByRole("link", { name: "See the delivery" })).toBeVisible();

  const stock = await runAsUser(testDb.db, owner.id, async (tx) => (await stockNow(tx, restaurant.locationId, [mozzarellaId])).get(mozzarellaId));
  expect(toDecimal(stock ?? "0").toFixed()).toBe("6900");

  await page.goto("/orders");
  await expect(page.getByRole("main").getByText("7 × Bag 1 kg").filter({ visible: true })).toHaveCount(0);
  // Only Basil (no supplier) is still low, so no supplier card is left to create an order from.
  await expect(page.getByRole("main").getByText("No supplier").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: "Create order" })).toHaveCount(0);
  await expect(page.getByRole("main").getByText("Received", { exact: false }).filter({ visible: true }).first()).toBeVisible();
  await page.context().close();
});

test("staff opening /orders land on the dashboard", async ({ browser }) => {
  const page = await logIn(browser, staff);
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.context().close();
});
