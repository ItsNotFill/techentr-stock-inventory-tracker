import { expect, test, type Locator, type Page } from "@playwright/test";
import { runAsUser } from "../lib/db/rls";
import { createIngredient } from "../lib/ingredients";
import { appendMovements } from "../lib/ledger";
import { createMenuItem, saveRecipe } from "../lib/menu";
import { ingredientFormSchema } from "../lib/validation/ingredients";
import { menuItemFormSchema, recipeInputSchema } from "../lib/validation/menu";
import {
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
 * Stage 3 through the real screens: upload a sales CSV, check the columns,
 * preview (with a bad row), import, see stock and the "Needs recipe" queue,
 * upload the same file again (nothing changes), undo.
 */

const SALES_CSV = [
  "Order ID,Date,Time,Item,Quantity",
  "9001,16/11/2026,12:05,Margherita,3",
  "9002,16/11/2026,12:30,Margherita,2",
  "9002,16/11/2026,12:30,Tiramisu,2",
  "9003,16/11/2026,19:00,Margherita,lots",
].join("\n");

const shown = (locator: Locator) => locator.filter({ visible: true }).first();

let testDb: TestDb;
let owner: TestUser;
let restaurant: TestRestaurant;

test.beforeAll(async () => {
  testDb = createTestDb();
  owner = await createTestUser("e2e-import");
  restaurant = await createTestRestaurant(testDb.db, owner, "E2E Import");
  await runAsUser(testDb.db, owner.id, async (tx) => {
    const mozzarella = await createIngredient(
      tx,
      restaurant.locationId,
      ingredientFormSchema.parse({
        name: "Mozzarella",
        baseUnit: "g",
        costAmount: "8",
        costUnit: "kg",
        reorderPoint: "1.5",
        parLevel: "",
        levelUnit: "kg",
        category: "",
        storageArea: "",
      }),
    );
    const margherita = await createMenuItem(
      tx,
      restaurant.locationId,
      menuItemFormSchema.parse({ posName: "Margherita", posItemId: "", displayName: "", kind: "item", category: "", price: "" }),
    );
    await saveRecipe(tx, restaurant.locationId, owner.id, margherita, recipeInputSchema.parse([{ ingredientId: mozzarella, amount: "120", unit: "g" }]));
    await appendMovements(tx, restaurant.locationId, [
      { ingredientId: mozzarella, qtyDelta: "2000", type: "count_adjust", occurredAt: new Date("2026-11-16T07:00:00Z"), createdBy: owner.id },
    ]);
  });
});

test.afterAll(async () => {
  await deleteTestRestaurants(testDb.db, [restaurant]);
  await deleteTestUser(owner);
  await testDb.close();
});

async function logIn(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill(owner.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(owner.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function upload(page: Page, name: string, content: string) {
  await page.goto("/import");
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="file"]').filter({ visible: true }).first().setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(content),
  });
}

test("a manager imports a sales file, sees stock move, re-uploads it safely and undoes it", async ({ page }) => {
  await logIn(page);

  await test.step("upload: the columns are guessed from the headers", async () => {
    await upload(page, "lunch.csv", SALES_CSV);
    await expect(page.getByText("We guessed the columns from the file")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Order or receipt number" })).toContainText("Order ID");
    await expect(page.getByRole("combobox", { name: "Item name" })).toContainText("Item");
    await expect(page.getByRole("combobox", { name: "Time (optional)" })).toContainText("Time");
    await expect(page.getByRole("combobox", { name: "Date format" })).toContainText("day first");
  });

  await test.step("preview: what will happen, and the row with a problem", async () => {
    await page.getByRole("button", { name: "Check file" }).click();
    await expect(page.getByText("2 orders to import")).toBeVisible();
    await expect(page.getByText("1 row has problems")).toBeVisible();
    await expect(page.getByText('"lots" is not a number.')).toBeVisible();
    await expect(page.getByText("Tiramisu")).toBeVisible(); // a new item, added without a recipe
  });

  await test.step("import: stock goes down by 5 x 120 g", async () => {
    await page.getByRole("button", { name: "Import 2 orders" }).click();
    await expect(page.getByText("Imported 2 orders").first()).toBeVisible();
    await page.goto("/ingredients");
    // 2,000 g - 5 x 120 g = 1,400 g, below the 1.5 kg reorder point.
    await expect(shown(page.getByText("1,400 g"))).toBeVisible();
    await expect(shown(page.getByText("Low", { exact: true }))).toBeVisible();
  });

  await test.step("the new item waits in Needs recipe", async () => {
    await page.goto("/unmapped");
    await expect(shown(page.getByText("Tiramisu"))).toBeVisible();
    await expect(shown(page.getByText("1 line, 2 sold"))).toBeVisible();
  });

  await test.step("the same file again imports nothing", async () => {
    await upload(page, "lunch.csv", SALES_CSV);
    await expect(page.getByText("Using the columns from your last import")).toBeVisible();
    await page.getByRole("button", { name: "Check file" }).click();
    await expect(page.getByText(/nothing new to import/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Import \d+ orders?$/ })).toHaveCount(0);
    await page.goto("/ingredients");
    await expect(shown(page.getByText("1,400 g"))).toBeVisible();
  });

  await test.step("undo: the sales go and the stock comes back", async () => {
    await page.goto("/import");
    await shown(page.getByRole("button", { name: "Undo" })).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /undo/i }).click();
    await expect(shown(page.getByText("Undone", { exact: true }))).toBeVisible();
    await page.goto("/ingredients");
    await expect(shown(page.getByText("2,000 g"))).toBeVisible();
  });
});
