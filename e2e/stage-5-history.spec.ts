import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { logDelivery } from "../lib/deliveries";
import { runAsUser } from "../lib/db/rls";
import { addPackSize, createIngredient, getIngredient } from "../lib/ingredients";
import { appendMovements } from "../lib/ledger";
import { ingredientFormSchema, packSizeFormSchema } from "../lib/validation/ingredients";
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

/** Stage 5: the stock history of one ingredient, filtered by type. */

const shown = (locator: Locator) => locator.filter({ visible: true }).first();

let testDb: TestDb;
let owner: TestUser;
let staff: TestUser;
let restaurant: TestRestaurant;
let mozzarellaId: string;

test.beforeAll(async () => {
  testDb = createTestDb();
  [owner, staff] = await Promise.all([createTestUser("e2e-history-owner"), createTestUser("e2e-history-staff")]);
  restaurant = await createTestRestaurant(testDb.db, owner, "E2E History");
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
    await addPackSize(
      tx,
      restaurant.locationId,
      mozzarellaId,
      packSizeFormSchema.parse({ label: "Bag 1 kg", amount: "1", unit: "kg", isDefault: true }),
    );
    const pack = (await getIngredient(tx, restaurant.locationId, mozzarellaId))!.packSizes[0];
    const hoursAgo = (count: number) => new Date(Date.now() - count * 3_600_000);
    await appendMovements(tx, restaurant.locationId, [
      { ingredientId: mozzarellaId, qtyDelta: "3000", type: "count_adjust", occurredAt: hoursAgo(30), createdBy: owner.id },
    ]);
    await logDelivery(tx, restaurant.locationId, owner.id, {
      clientId: randomUUID(),
      supplierName: "Caseificio Rossi",
      deliveredAt: hoursAgo(5),
      lines: [{ ingredientId: mozzarellaId, amount: "5", unit: `pack:${pack.id}` }],
    });
    await logWaste(tx, restaurant.locationId, owner.id, {
      clientId: randomUUID(),
      ingredientId: mozzarellaId,
      amount: "200",
      unit: "g",
      reason: "dropped",
      note: null,
      occurredAt: hoursAgo(1),
    });
  });
});

test.afterAll(async () => {
  await deleteTestRestaurants(testDb.db, [restaurant]);
  await Promise.all([owner, staff].map(deleteTestUser));
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

test("the owner reads an ingredient's movements and filters them", async ({ browser }) => {
  const desk = await logIn(browser, owner);

  await test.step("open the history from the ingredient", async () => {
    await desk.goto(`/ingredients/${mozzarellaId}`);
    await shown(desk.getByRole("link", { name: "Stock history" })).click();
    await expect(desk).toHaveURL(new RegExp(`/history\\?ingredient=${mozzarellaId}$`));
    await expect(shown(desk.getByRole("heading", { name: "Mozzarella" }))).toBeVisible();
  });

  const rows = () => desk.getByRole("row").filter({ visible: true });

  await test.step("newest first, with the stock after each movement", async () => {
    // Header row plus three movements.
    await expect(rows()).toHaveCount(4);
    await expect(rows().nth(1)).toContainText("Waste");
    await expect(rows().nth(1)).toContainText("−200 g");
    await expect(rows().nth(1)).toContainText("7,800 g");
    await expect(rows().nth(1)).toContainText("Dropped");
    await expect(rows().nth(2)).toContainText("Delivery");
    await expect(rows().nth(2)).toContainText("+5,000 g");
    await expect(rows().nth(2)).toContainText("8,000 g");
    await expect(rows().nth(2)).toContainText("From Caseificio Rossi");
    await expect(rows().nth(2)).toContainText("5 × Bag 1 kg");
    await expect(rows().nth(3)).toContainText("Count adjustment");
    await expect(rows().nth(3)).toContainText("3,000 g");
    await expect(shown(desk.getByText("In stock now"))).toBeVisible();
  });

  await test.step("filter to deliveries, then clear", async () => {
    await shown(desk.getByLabel("Type")).selectOption("delivery");
    await shown(desk.getByRole("button", { name: "Show" })).click();
    await expect(desk).toHaveURL(/type=delivery/);
    await expect(rows()).toHaveCount(2);
    await expect(rows().nth(1)).toContainText("Delivery");
    await shown(desk.getByRole("link", { name: "Clear" })).click();
    await expect(rows()).toHaveCount(4);
  });
});

test("staff cannot open the stock history", async ({ browser }) => {
  const phone = await logIn(browser, staff);
  await phone.goto("/history");
  await expect(phone).toHaveURL(/\/dashboard$/);
});
