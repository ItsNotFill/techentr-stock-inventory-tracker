import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { runAsUser } from "../lib/db/rls";
import { saveCountEntries, startCount, submitCount } from "../lib/counts";
import { createIngredient } from "../lib/ingredients";
import { appendMovements } from "../lib/ledger";
import { ingredientFormSchema } from "../lib/validation/ingredients";
import { SEED_USERS } from "../scripts/seed/data";
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
import { randomUUID } from "node:crypto";

/**
 * Screenshots of every screen, desktop and phone, for design reviews.
 * Skipped unless SCREENSHOTS_DIR is set:
 *   SCREENSHOTS_DIR=docs/screenshots/after npx playwright test screenshots
 * Uses the seeded demo restaurant (read only) and, for the manager's review of
 * a submitted count, a throwaway restaurant that is removed afterwards.
 * The demo password comes from SEED_PASSWORD_FILE or .env.seed.local; it is never printed.
 */

const OUT = process.env.SCREENSHOTS_DIR;
test.skip(!OUT, "Set SCREENSHOTS_DIR to take screenshots");
test.describe.configure({ mode: "serial", timeout: 300_000 });

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  phone: { width: 390, height: 844 },
} as const;
type Viewport = keyof typeof VIEWPORTS;

function seedPassword(): string {
  const file = process.env.SEED_PASSWORD_FILE ?? ".env.seed.local";
  const match = readFileSync(file, "utf8").match(/^SEED_USER_PASSWORD=(.+)$/m);
  if (!match) throw new Error("No SEED_USER_PASSWORD found");
  return match[1].trim();
}

const demo = (role: "owner" | "manager" | "staff") => SEED_USERS.find((user) => user.role === role)!.email;

async function newPage(browser: Browser, viewport: Viewport): Promise<Page> {
  const context = await browser.newContext({
    viewport: VIEWPORTS[viewport],
    deviceScaleFactor: viewport === "phone" ? 2 : 1,
    hasTouch: viewport === "phone",
  });
  // Hide the Next.js dev-server badge: it is not part of the app and covers the "Log out" button.
  await context.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { display: none !important; }";
      document.head.appendChild(style);
    });
  });
  return context.newPage();
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  // Wait for streamed content: skeletons carry aria-busy="true", and the
  // page title of a detail screen arrives with its data.
  await page
    .waitForFunction(
      () => ![...document.querySelectorAll('[aria-busy="true"], [data-slot="skeleton"]')].some((element) => {
        const box = (element as HTMLElement).getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      }),
      undefined,
      { timeout: 20_000 },
    )
    .catch(() => {});
  // Let toasts disappear and animations end.
  await page.waitForTimeout(800);
}

async function shot(page: Page, viewport: Viewport, name: string) {
  await settle(page);
  mkdirSync(OUT!, { recursive: true });
  await page.screenshot({ path: path.join(OUT!, `${viewport}-${name}.png`), fullPage: true });
}

async function logIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await settle(page);
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Clicks the first visible link to a detail page and waits for it. */
async function openFirst(page: Page, selector: string, urlPattern: RegExp) {
  await page.locator(selector).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(urlPattern);
}

let testDb: TestDb;
let reviewOwner: TestUser;
let reviewStaff: TestUser;
let reviewRestaurant: TestRestaurant;
let submittedCountId: string;

test.beforeAll(async () => {
  // A throwaway restaurant with one submitted count, for the manager's review screen.
  testDb = createTestDb();
  [reviewOwner, reviewStaff] = await Promise.all([createTestUser("shots-owner"), createTestUser("shots-staff")]);
  reviewRestaurant = await createTestRestaurant(testDb.db, reviewOwner, "Trattoria Review");
  await addTestMember(testDb.db, reviewRestaurant, reviewStaff, "staff");
  const loc = reviewRestaurant.locationId;
  const make = (name: string, cost: string, area: string) =>
    ingredientFormSchema.parse({
      name,
      baseUnit: "g",
      costAmount: cost,
      costUnit: "kg",
      reorderPoint: "",
      parLevel: "",
      levelUnit: "kg",
      category: "",
      storageArea: area,
    });
  const ids = await runAsUser(testDb.db, reviewOwner.id, async (tx) => {
    const mozzarella = await createIngredient(tx, loc, make("Mozzarella", "8", "Walk-in fridge"));
    const basil = await createIngredient(tx, loc, make("Basil", "25", "Walk-in fridge"));
    const flour = await createIngredient(tx, loc, make("Flour tipo 00", "1.10", "Dry store"));
    const yesterday = new Date(Date.now() - 24 * 3_600_000);
    await appendMovements(tx, loc, [
      { ingredientId: mozzarella, qtyDelta: "3000", type: "count_adjust", occurredAt: yesterday, createdBy: reviewOwner.id },
      { ingredientId: basil, qtyDelta: "500", type: "count_adjust", occurredAt: yesterday, createdBy: reviewOwner.id },
      { ingredientId: flour, qtyDelta: "25000", type: "count_adjust", occurredAt: yesterday, createdBy: reviewOwner.id },
    ]);
    return { mozzarella, basil, flour };
  });
  submittedCountId = await runAsUser(testDb.db, reviewStaff.id, async (tx) => {
    const id = await startCount(tx, loc, reviewStaff.id, randomUUID());
    await saveCountEntries(tx, loc, reviewStaff.id, id, [
      { ingredientId: ids.mozzarella, amount: "2.5", unit: "kg" },
      { ingredientId: ids.basil, amount: "420", unit: "g" },
      { ingredientId: ids.flour, amount: "25", unit: "kg" },
    ]);
    await submitCount(tx, loc, reviewStaff.id, id);
    return id;
  });
});

test.afterAll(async () => {
  await deleteTestRestaurants(testDb.db, [reviewRestaurant]);
  await Promise.all([reviewOwner, reviewStaff].map(deleteTestUser));
  await testDb.close();
});

for (const viewport of Object.keys(VIEWPORTS) as Viewport[]) {
  test(`screens on ${viewport}`, async ({ browser }) => {
    const password = seedPassword();

    // Signed out
    const visitor = await newPage(browser, viewport);
    await visitor.goto("/");
    await shot(visitor, viewport, "01-landing");
    await visitor.goto("/login");
    await shot(visitor, viewport, "02-login");
    await visitor.getByRole("button", { name: "Log in" }).click();
    await shot(visitor, viewport, "03-login-errors");
    await visitor.goto("/sign-up");
    await shot(visitor, viewport, "04-sign-up");
    await visitor.context().close();

    // The demo owner
    const page = await newPage(browser, viewport);
    await logIn(page, demo("owner"), password);
    await shot(page, viewport, "10-dashboard");

    await page.goto("/ingredients");
    await shot(page, viewport, "20-ingredients");
    await openFirst(page, 'a[href^="/ingredients/"]:has-text("Mozzarella")', /\/ingredients\/[0-9a-f-]{36}$/);
    await shot(page, viewport, "21-ingredient-edit");
    await page.goto("/ingredients/new");
    await shot(page, viewport, "22-ingredient-new");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await shot(page, viewport, "23-ingredient-new-errors");

    await page.goto("/menu");
    await shot(page, viewport, "30-menu");
    await openFirst(page, 'a[href^="/menu/"]:has-text("Margherita")', /\/menu\/[0-9a-f-]{36}$/);
    await shot(page, viewport, "31-menu-item-recipe");
    await page.goto("/menu/new");
    await shot(page, viewport, "32-menu-item-new");

    await page.goto("/unmapped");
    await shot(page, viewport, "40-needs-recipe");

    await page.goto("/import");
    await shot(page, viewport, "50-import-file");
    await page.locator('input[type="file"]').filter({ visible: true }).first().setInputFiles("scripts/seed/sample-sales-day2.csv");
    await expect(page.getByRole("button", { name: "Check file" })).toBeVisible();
    await shot(page, viewport, "51-import-columns");
    await page.getByRole("button", { name: "Check file" }).click();
    await expect(page.getByRole("button", { name: /^Import \d+ orders?$/ })).toBeVisible();
    await shot(page, viewport, "52-import-check");

    await page.goto("/count");
    await shot(page, viewport, "60-counts");
    await openFirst(page, 'a[href^="/count/"]', /\/count\/[0-9a-f-]{36}$/);
    await shot(page, viewport, "61-count-approved");

    await page.goto("/unexplained-usage");
    await shot(page, viewport, "70-unexplained-usage");
    await page.getByRole("link", { name: "See details" }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/unexplained-usage\/[0-9a-f-]{36}$/);
    await shot(page, viewport, "71-unexplained-usage-count");

    await page.goto("/settings");
    await shot(page, viewport, "80-settings");
    await page.context().close();

    // The demo staff member: dashboard, and a count in progress (deleted afterwards).
    const staff = await newPage(browser, viewport);
    await logIn(staff, demo("staff"), password);
    await shot(staff, viewport, "90-staff-dashboard");
    await staff.goto("/count");
    await shot(staff, viewport, "91-staff-counts");
    await staff.getByRole("button", { name: /Start a count|Continue your count/ }).filter({ visible: true }).first().click();
    await expect(staff).toHaveURL(/\/count\/[0-9a-f-]{36}$/);
    const firstInput = staff.locator('input[inputmode="decimal"]').filter({ visible: true }).first();
    await firstInput.fill("2");
    await firstInput.blur();
    // Wait for the save to finish, so the save bar is not caught mid-transition from its disabled look.
    await expect(staff.getByText("Saved", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(staff.getByRole("button", { name: "Submit count" }).filter({ visible: true })).toBeEnabled();
    await shot(staff, viewport, "92-staff-count-sheet");
    await staff.getByRole("button", { name: "Delete draft" }).click();
    await staff.getByRole("alertdialog").getByRole("button", { name: /delete/i }).click();
    await expect(staff).toHaveURL(/\/count$/);
    await staff.context().close();

    // A manager reviewing a submitted count (throwaway restaurant).
    const reviewer = await newPage(browser, viewport);
    await logIn(reviewer, reviewOwner.email, reviewOwner.password);
    await reviewer.goto(`/count/${submittedCountId}`);
    await shot(reviewer, viewport, "62-count-review");
    await reviewer.context().close();
  });
}
