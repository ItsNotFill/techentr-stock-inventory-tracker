/**
 * Smoke test over HTTP against a running server (default http://localhost:3000):
 * signed-out redirect, sign-in, onboarding redirect, dashboard after bootstrap,
 * the ingredient screens with data, and any extra paths given as arguments.
 * Creates a throwaway user and restaurant and removes them again.
 *
 *   npm run dev            (in another terminal)
 *   npx tsx scripts/smoke-auth.ts [base-url] [extra paths...]
 */
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createRestaurantForUser } from "../lib/auth/bootstrap";
import { deleteRestaurantData } from "../tests/helpers/db";
import * as schema from "../lib/db/schema";

config({ path: ".env.local", quiet: true });

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
}

async function get(path: string, cookie = "") {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual", headers: cookie ? { cookie } : {} });
  return { status: response.status, location: response.headers.get("location") ?? "", body: await response.text() };
}

async function main() {
  const admin = createClient(supabaseUrl, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const pool = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const db = drizzle(pool, { schema });

  const email = `test-smoke-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) throw new Error(`Could not create the smoke user: ${error?.message}`);
  const userId = created.user.id;
  let restaurant: { organizationId: string | null; locationId: string } | undefined;

  try {
    // Sign in the way the server does, and keep the cookies it would set.
    const jar = new Map<string, string>();
    const supabase = createServerClient(supabaseUrl, publishableKey, {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (cookies) => cookies.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
      },
    });
    const signIn = await supabase.auth.signInWithPassword({ email, password });
    if (signIn.error) throw new Error(`Sign-in failed: ${signIn.error.message}`);
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");

    const home = await get("/");
    check("landing page is public", home.status === 200 && home.body.includes("Restaurant Inventory"));

    const signedOut = await get("/dashboard");
    check("signed-out /dashboard redirects to /login", signedOut.status === 307 && signedOut.location.endsWith("/login"), `${signedOut.status} ${signedOut.location}`);

    const loginWhileSignedIn = await get("/login", cookie);
    check("signed-in /login redirects to /dashboard", loginWhileSignedIn.status === 307 && loginWhileSignedIn.location.endsWith("/dashboard"), `${loginWhileSignedIn.status} ${loginWhileSignedIn.location}`);

    const beforeOnboarding = await get("/dashboard", cookie);
    check("no restaurant yet: /dashboard sends the user to /onboarding", beforeOnboarding.body.includes("/onboarding"), `${beforeOnboarding.status}`);

    const onboarding = await get("/onboarding", cookie);
    check("onboarding page renders the form", onboarding.status === 200 && onboarding.body.includes("restaurantName"));

    const name = `Smoke Pizzeria ${randomUUID().slice(0, 8)}`;
    restaurant = await createRestaurantForUser(db, { userId, restaurantName: name, timezone: "Europe/Amsterdam" });

    const dashboard = await get("/dashboard", cookie);
    check("dashboard shows the restaurant", dashboard.status === 200 && dashboard.body.includes(name), `${dashboard.status}`);
    check("dashboard shows the owner role", dashboard.body.includes("Owner"));

    // An ingredient with a pack size, to see the ingredient screens with data.
    const [ingredient] = await db
      .insert(schema.ingredients)
      .values({
        locationId: restaurant.locationId,
        name: "Smoke Mozzarella",
        baseUnit: "g",
        costPerBaseUnit: "0.008000",
        reorderPoint: "2000.000",
        storageArea: "Walk-in fridge",
      })
      .returning({ id: schema.ingredients.id });
    await db.insert(schema.packSizes).values({
      locationId: restaurant.locationId,
      ingredientId: ingredient.id,
      label: "Smoke bag 1 kg",
      qtyInBaseUnit: "1000.000",
      isDefault: true,
    });

    const list = await get("/ingredients", cookie);
    check(
      "ingredients list shows the ingredient with cost per kg and reorder point",
      list.status === 200 &&
        list.body.includes("Smoke Mozzarella") &&
        list.body.includes("€8.00 per kg") &&
        list.body.includes("2,000 g") &&
        list.body.includes("Smoke bag 1 kg"),
      `${list.status}`,
    );
    const edit = await get(`/ingredients/${ingredient.id}`, cookie);
    check(
      "ingredient page shows the form prefilled in kg and the pack size",
      edit.status === 200 && edit.body.includes('value="8"') && edit.body.includes("Smoke bag 1 kg") && edit.body.includes("1,000 g"),
      `${edit.status}`,
    );
    const missing = await get("/ingredients/00000000-0000-4000-8000-000000000000", cookie);
    check("an unknown ingredient id is not found", missing.body.includes("404") || missing.body.includes("not be found"), `${missing.status}`);
    const malformed = await get("/ingredients/not-a-uuid", cookie);
    check("a malformed ingredient id is not found", malformed.body.includes("404") || malformed.body.includes("not be found"), `${malformed.status}`);

    // A menu item with a recipe: 120 g of the ingredient above.
    const [menuItem] = await db
      .insert(schema.menuItems)
      .values({ locationId: restaurant.locationId, posName: "SMOKE MARGHERITA", displayName: "Smoke Margherita", price: "9.50", isMapped: true })
      .returning({ id: schema.menuItems.id });
    await db.insert(schema.recipeLines).values({
      locationId: restaurant.locationId,
      menuItemId: menuItem.id,
      ingredientId: ingredient.id,
      qtyBaseUnit: "120.000",
      confirmedAt: new Date(),
    });
    await db.insert(schema.menuItems).values({ locationId: restaurant.locationId, posName: "Smoke Tiramisu", displayName: "Smoke Tiramisu" });

    const menu = await get("/menu", cookie);
    check(
      "menu list shows items, status counts, price and ingredient cost",
      menu.status === 200 &&
        menu.body.includes("Smoke Margherita") &&
        menu.body.includes("SMOKE MARGHERITA") &&
        menu.body.includes("€9.50") &&
        menu.body.includes("€0.96") && // 120 g at EUR 8 per kg
        /Needs recipe(<!-- -->)? \((<!-- -->)?1(<!-- -->)?\)/.test(menu.body) &&
        /Has recipe(<!-- -->)? \((<!-- -->)?1(<!-- -->)?\)/.test(menu.body),
      `${menu.status}`,
    );
    const needsRecipe = await get("/menu?status=unmapped", cookie);
    check(
      "menu filter shows only items that need a recipe",
      needsRecipe.body.includes("Smoke Tiramisu") && !needsRecipe.body.includes("SMOKE MARGHERITA"),
    );
    const menuItemPage = await get(`/menu/${menuItem.id}`, cookie);
    check(
      "menu item page shows the recipe line (120 g) and its cost",
      menuItemPage.status === 200 && menuItemPage.body.includes('value="120"') && menuItemPage.body.includes("€0.96") && menuItemPage.body.includes("Has recipe"),
      `${menuItemPage.status}`,
    );
    const menuMissing = await get("/menu/not-a-uuid", cookie);
    check("a malformed menu item id is not found", menuMissing.body.includes("404") || menuMissing.body.includes("not be found"));

    for (const path of process.argv.slice(3)) {
      const page = await get(path, cookie);
      check(`${path} renders for the owner`, page.status === 200 && !page.body.includes("Application error"), `${page.status}`);
    }
  } finally {
    if (restaurant) {
      await deleteRestaurantData(db, [restaurant.locationId], restaurant.organizationId ? [restaurant.organizationId] : []);
    }
    await admin.auth.admin.deleteUser(userId);
    await pool.end();
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
