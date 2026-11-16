import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/db/schema";

/**
 * Stages 1 and 2 through the real screens: log in, set up a restaurant, add an
 * ingredient with a pack size, enter a menu item with its recipe, invite a
 * team member by link. Everything it creates is removed afterwards.
 */

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const run = randomUUID().slice(0, 8);
const owner = { email: `test-e2e-owner-${run}@example.com`, password: randomUUID(), id: "" };
const invited = { email: `test-e2e-staff-${run}@example.com`, password: randomUUID() };
const restaurantName = `E2E Pizzeria ${run}`;

/** A text field by its exact label. */
const field = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });

/** Both the phone and the desktop layout are in the page; only one is shown. */
const shown = (locator: Locator) => locator.filter({ visible: true }).first();

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `sideways scroll on ${page.url()}`).toBeLessThanOrEqual(1);
}

test.beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: owner.email,
    password: owner.password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Could not create the e2e user: ${error?.message}`);
  owner.id = data.user.id;
});

test.afterAll(async () => {
  const pool = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1, onnotice: () => {} });
  const db = drizzle(pool, { schema });
  try {
    const memberships = owner.id
      ? await db
          .select({ locationId: schema.memberships.locationId, orgId: schema.locations.orgId })
          .from(schema.memberships)
          .innerJoin(schema.locations, eq(schema.locations.id, schema.memberships.locationId))
          .where(eq(schema.memberships.userId, owner.id))
      : [];
    const locationIds = memberships.map((row) => row.locationId);
    if (locationIds.length > 0) {
      await db.delete(schema.menuItems).where(inArray(schema.menuItems.locationId, locationIds));
      await db.delete(schema.locations).where(inArray(schema.locations.id, locationIds));
      await db.delete(schema.organizations).where(
        inArray(
          schema.organizations.id,
          memberships.map((row) => row.orgId),
        ),
      );
    }
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const user of data?.users ?? []) {
      if (user.email === owner.email || user.email === invited.email) await admin.auth.admin.deleteUser(user.id);
    }
  } finally {
    await pool.end();
  }
});

test("an owner sets up a restaurant, ingredients, a menu with recipes, and invites staff", async ({ page, browser }) => {
  // Signed out, the app sends you to the login screen.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);

  await test.step("wrong password is refused", async () => {
    await field(page, "E-mail").fill(owner.email);
    await field(page, "Password").fill("not-the-password");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Wrong e-mail address or password.")).toBeVisible();
  });

  await test.step("log in and create the restaurant", async () => {
    await field(page, "Password").fill(owner.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await field(page, "Restaurant name").fill(restaurantName);
    await page.getByRole("button", { name: "Create restaurant" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(shown(page.getByText(restaurantName))).toBeVisible();
  });

  await test.step("add an ingredient: mozzarella at EUR 8 per kg", async () => {
    await shown(page.getByRole("link", { name: "Ingredients" })).click();
    await expect(page.getByText("No ingredients yet")).toBeVisible();
    await shown(page.getByRole("link", { name: "Add ingredient" })).click();
    await expect(page).toHaveURL(/\/ingredients\/new$/);

    // Empty form: the server says what is missing.
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await expect(page.getByText("Enter a name.")).toBeVisible();

    await field(page, "Name").fill("Mozzarella");
    await field(page, "Cost (€)").fill("8");
    await field(page, "Reorder point").fill("2");
    await field(page, "Storage area").fill("Walk-in fridge");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await expect(page).toHaveURL(/\/ingredients\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Mozzarella" })).toBeVisible();
    // Saved in grams, shown again per kg.
    await expect(field(page, "Cost (€)")).toHaveValue("8");
    await expect(field(page, "Reorder point")).toHaveValue("2");
  });

  await test.step("add a pack size: bag of 1 kg", async () => {
    await field(page, "Label").fill("Bag 1 kg");
    await field(page, "Amount in one pack").fill("1");
    await page.getByRole("button", { name: "Add pack size" }).click();
    await expect(page.getByText("1,000 g")).toBeVisible();
    await expect(page.getByText("Default", { exact: true })).toBeVisible();
    // With a pack size, the unit is locked.
    await expect(page.getByText("The unit cannot change while this ingredient has pack sizes.")).toBeVisible();
  });

  await test.step("the ingredient list shows it in readable units", async () => {
    await page.getByRole("link", { name: "Back to ingredients" }).click();
    await expect(page).toHaveURL(/\/ingredients$/);
    await expect(shown(page.getByText("€8.00 per kg"))).toBeVisible();
    await expect(shown(page.getByText("2,000 g"))).toBeVisible();
    await expect(shown(page.getByText("Bag 1 kg"))).toBeVisible();
  });

  await test.step("add a menu item and give it a recipe: 120 g of mozzarella", async () => {
    await shown(page.getByRole("link", { name: "Menu" })).click();
    await expect(page.getByText("No menu items yet")).toBeVisible();
    await shown(page.getByRole("link", { name: "Add item" })).click();
    await field(page, "POS name").fill("MARGHERITA");
    await field(page, "Display name (optional)").fill("Margherita");
    await field(page, "Price (€)").fill("9,50");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page).toHaveURL(/\/menu\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Margherita" })).toBeVisible();
    await expect(shown(page.getByText("Needs recipe"))).toBeVisible();

    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByLabel("Ingredient, line 1").click();
    await page.getByRole("option", { name: "Mozzarella" }).click();
    await field(page, "Amount, line 1").fill("120");
    // 120 g at EUR 8 per kg, worked out in the browser.
    await expect(shown(page.getByText("€0.96"))).toBeVisible();
    await expect(page.getByText("Unsaved changes")).toBeVisible();
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(shown(page.getByText("Has recipe"))).toBeVisible();
    await expect(page.getByText("Unsaved changes")).toBeHidden();
    await expect(field(page, "Amount, line 1")).toHaveValue("120");
  });

  await test.step("the menu list shows the item with its status and ingredient cost", async () => {
    await page.getByRole("link", { name: "Back to menu" }).click();
    await expect(page).toHaveURL(/\/menu$/);
    await expect(page.getByRole("link", { name: "Has recipe (1)" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Needs recipe (0)" })).toBeVisible();
    await expect(shown(page.getByText("€9.50"))).toBeVisible();
    await expect(shown(page.getByText("€0.96"))).toBeVisible();
  });

  await test.step("an item that uses no stock can be ignored", async () => {
    await shown(page.getByRole("link", { name: "Add item" })).click();
    await field(page, "POS name").fill("Service charge");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page).toHaveURL(/\/menu\/[0-9a-f-]{36}$/);
    await page.getByRole("button", { name: "Ignore this item" }).click();
    await expect(shown(page.getByText("Ignored"))).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop ignoring" })).toBeVisible();
  });

  await test.step("screens fit a phone without sideways scrolling", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/dashboard", "/ingredients", "/menu", "/settings"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await noSidewaysScroll(page);
    }
    await page.goto("/menu");
    await shown(page.getByRole("link", { name: "Margherita" })).click();
    await expect(field(page, "Amount, line 1")).toHaveValue("120");
    await noSidewaysScroll(page);
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  let inviteLink = "";
  await test.step("settings: rename the restaurant and add a team member by link", async () => {
    await page.goto("/settings");
    await field(page, "Name").fill(`${restaurantName} Renamed`);
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByText("Restaurant details saved.")).toBeVisible();
    await expect(shown(page.getByText(`${owner.email}`))).toBeVisible();

    await field(page, "E-mail").fill(invited.email);
    await page.getByRole("button", { name: "Add to team" }).click();
    const linkField = page.getByLabel("One-time link");
    await expect(linkField).toBeVisible();
    inviteLink = await linkField.inputValue();
    expect(inviteLink).toContain("/auth/confirm?token_hash=");
    // The new person is in the team list straight away.
    await expect(shown(page.getByText(invited.email, { exact: true }))).toBeVisible();
  });

  await test.step("the invited person opens the link, chooses a password and is in as staff", async () => {
    const context = await browser.newContext();
    const staffPage = await context.newPage();
    await staffPage.goto(inviteLink);
    await expect(staffPage).toHaveURL(/\/set-password$/);
    await field(staffPage, "New password").fill(invited.password);
    await staffPage.getByRole("button", { name: "Save password" }).click();
    await expect(staffPage).toHaveURL(/\/dashboard$/);
    await expect(shown(staffPage.getByText("Staff"))).toBeVisible();
    // Staff do not get the manager screens.
    await expect(staffPage.getByRole("link", { name: "Ingredients" })).toHaveCount(0);
    await staffPage.goto("/ingredients");
    await expect(staffPage).toHaveURL(/\/dashboard$/);
    await staffPage.goto("/settings");
    await expect(staffPage).toHaveURL(/\/dashboard$/);

    // The link works once.
    const second = await browser.newContext();
    const secondPage = await second.newPage();
    await secondPage.goto(inviteLink);
    await expect(secondPage).toHaveURL(/\/login\?notice=link-failed$/);
    await second.close();
    await context.close();
  });

  await test.step("log out", async () => {
    await shown(page.getByRole("button", { name: "Log out" })).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/menu");
    await expect(page).toHaveURL(/\/login$/);
  });
});
