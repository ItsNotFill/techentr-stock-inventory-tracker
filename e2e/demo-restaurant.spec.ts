import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { SEED_USERS } from "../scripts/seed/data";

/**
 * Read-only check of the seeded demo restaurant, as its owner. Run it against
 * the live site with:
 *   E2E_BASE_URL=https://techentr-stock-inventory-tracker.vercel.app npx playwright test demo-restaurant
 * The password is read from .env.seed.local and never printed.
 */

function seedPassword(): string {
  const match = readFileSync(".env.seed.local", "utf8").match(/^SEED_USER_PASSWORD=(.+)$/m);
  if (!match) throw new Error("Run npm run db:seed first: .env.seed.local has no password");
  return match[1].trim();
}

const owner = SEED_USERS.find((user) => user.role === "owner")!;

async function logIn(page: Page, email: string) {
  await page.goto("/login");
  // Wait until the page is interactive: a click before that does nothing.
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(seedPassword());
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("the demo owner can log in and see the pizzeria's ingredients and menu", async ({ page }) => {
  await logIn(page, owner.email);
  await expect(page.getByText("Pizzeria Demo").filter({ visible: true }).first()).toBeVisible();

  await page.goto("/ingredients");
  await expect(page.getByRole("heading", { name: "Ingredients", level: 1 })).toBeVisible();
  await expect(page.getByText("Mozzarella", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("€8.00 per kg").filter({ visible: true }).first()).toBeVisible();

  await page.goto("/menu");
  await expect(page.getByRole("heading", { name: "Menu", level: 1 })).toBeVisible();
  await expect(page.getByText("Margherita", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Quattro Formaggi", { exact: true }).filter({ visible: true }).first()).toBeVisible();
});
