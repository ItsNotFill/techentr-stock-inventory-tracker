import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { approveCount, saveCountEntries, startCount, submitCount } from "../lib/counts";
import { runAsUser } from "../lib/db/rls";
import { logDelivery } from "../lib/deliveries";
import { addPackSize, createIngredient } from "../lib/ingredients";
import { depleteSaleLines } from "../lib/ledger/depletion";
import { createMenuItem, saveRecipe } from "../lib/menu";
import { ingredientFormSchema, packSizeFormSchema } from "../lib/validation/ingredients";
import { menuItemFormSchema, recipeInputSchema } from "../lib/validation/menu";
import { logWaste } from "../lib/waste";
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
import { insertTestSales } from "../tests/helpers/sales";

/**
 * The dashboard on the SPEC worked example: opening count 2 kg, a delivery of
 * 5 bags, 30 + 10 pizzas, 200 g dropped, a closing count of 1.9 kg of
 * mozzarella. Unexplained usage: -500 g, -EUR 4.00. Owners see the euros and
 * the chart; staff see the low-stock list and no euro sign.
 */

const shown = (locator: Locator) => locator.filter({ visible: true }).first();
const HOUR = 3_600_000;

let testDb: TestDb;
let owner: TestUser;
let staff: TestUser;
let restaurant: TestRestaurant;

test.beforeAll(async () => {
  testDb = createTestDb();
  [owner, staff] = await Promise.all([createTestUser("e2e-dash-owner"), createTestUser("e2e-dash-staff")]);
  restaurant = await createTestRestaurant(testDb.db, owner, "E2E Dashboard");
  await addTestMember(testDb.db, restaurant, staff, "staff");
  const loc = restaurant.locationId;
  const as = <T>(user: TestUser, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(testDb.db, user.id, fn);
  const start = Date.now() - 10 * HOUR;
  const at = (hours: number) => new Date(start + hours * HOUR);
  const item = (posName: string) =>
    menuItemFormSchema.parse({ posName, posItemId: "", displayName: "", kind: "item", category: "", price: "" });

  async function count(ingredientId: string, amount: string, time: Date) {
    const id = await as(staff, async (tx) => {
      const sessionId = await startCount(tx, loc, staff.id, randomUUID());
      await saveCountEntries(tx, loc, staff.id, sessionId, [{ ingredientId, amount, unit: "g" }]);
      await submitCount(tx, loc, staff.id, sessionId, time);
      return sessionId;
    });
    await as(owner, (tx) => approveCount(tx, loc, owner.id, id));
  }

  const [mozzarella, bag, margherita, quattro] = await as(owner, async (tx) => {
    // EUR 8 per kg, reorder at 3 kg, par 6 kg.
    const cheese = await createIngredient(
      tx,
      loc,
      ingredientFormSchema.parse({
        name: "Mozzarella",
        baseUnit: "g",
        costAmount: "8",
        costUnit: "kg",
        reorderPoint: "3",
        parLevel: "6",
        levelUnit: "kg",
        category: "",
        storageArea: "Walk-in fridge",
      }),
    );
    const bagId = await addPackSize(tx, loc, cheese, packSizeFormSchema.parse({ label: "Bag 1 kg", amount: "1", unit: "kg", isDefault: true }));
    const pizza = await createMenuItem(tx, loc, item("Margherita"));
    const quattroId = await createMenuItem(tx, loc, item("Quattro Formaggi"));
    await saveRecipe(tx, loc, owner.id, pizza, recipeInputSchema.parse([{ ingredientId: cheese, amount: "120", unit: "g" }]));
    await saveRecipe(tx, loc, owner.id, quattroId, recipeInputSchema.parse([{ ingredientId: cheese, amount: "80", unit: "g" }]));
    return [cheese, bagId, pizza, quattroId];
  });

  await count(mozzarella, "2000", at(0));
  await as(staff, (tx) =>
    logDelivery(tx, loc, staff.id, {
      clientId: randomUUID(),
      supplierName: "Caseificio Rossi",
      deliveredAt: at(1),
      lines: [{ ingredientId: mozzarella, amount: "5", unit: `pack:${bag}` }],
    }),
  );
  const { saleIds } = await insertTestSales(testDb.db, owner.id, loc, [
    { posOrderId: "L-1", soldAt: at(3), lines: [{ menuItemId: margherita, qty: "30" }] },
    { posOrderId: "D-1", soldAt: at(6), lines: [{ menuItemId: quattro, qty: "10" }] },
  ]);
  await as(owner, (tx) => depleteSaleLines(tx, loc, owner.id, { saleIds }));
  await as(staff, (tx) =>
    logWaste(tx, loc, staff.id, {
      clientId: randomUUID(),
      ingredientId: mozzarella,
      amount: "200",
      unit: "g",
      reason: "dropped",
      note: "dropped tray",
      occurredAt: at(7),
    }),
  );
  await count(mozzarella, "1900", at(8));
});

test.afterAll(async () => {
  await deleteTestRestaurants(testDb.db, [restaurant]);
  await Promise.all([owner, staff].map(deleteTestUser));
  await testDb.close();
});

async function logIn(browser: Browser, user: TestUser, phone: boolean): Promise<Page> {
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

test("the owner sees the last count's unexplained usage, the chart and the low-stock list", async ({ browser }) => {
  const page = await logIn(browser, owner, false);
  await expect(shown(page.getByText("Unexplained usage, last count"))).toBeVisible();
  await expect(shown(page.getByText("−€4.00", { exact: true }))).toBeVisible();
  await expect(shown(page.getByText("Top 5 unexplained usage, last count"))).toBeVisible();
  await expect(page.getByRole("img", { name: /Mozzarella −€4\.00 · −500 g/ })).toBeVisible();
  const chartTable = page.getByRole("table", { name: /Euros lost and units missing/ });
  await expect(chartTable.getByRole("row", { name: /Mozzarella.*−€4\.00.*−500 g/ })).toBeVisible();
  const lowStock = shown(page.getByRole("heading", { name: "Low stock" })).locator("xpath=..");
  await expect(lowStock.getByRole("link", { name: "Mozzarella" }).first()).toBeVisible();
  await expect(shown(lowStock.getByText("1,900 g"))).toBeVisible();
  await page.context().close();
});

test("staff see the low-stock list and no euros", async ({ browser }) => {
  const phone = await logIn(browser, staff, true);
  await expect(shown(phone.getByRole("heading", { name: "Low stock" }))).toBeVisible();
  await expect(shown(phone.getByText("Mozzarella"))).toBeVisible();
  await expect(phone.getByRole("link", { name: "Mozzarella" })).toHaveCount(0);
  await expect(shown(phone.getByRole("link", { name: "Log delivery" }))).toBeVisible();
  await expect(phone.getByText(/€/)).toHaveCount(0);
  await phone.context().close();
});
