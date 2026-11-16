/**
 * Seeds the pizzeria example from SPEC.md. Safe to run again: it updates the
 * same rows (fixed ids, names and labels) and never deletes anything.
 *
 *   npm run db:seed
 *
 * Stage 1 (v1): organization, location, three test users, ingredients, pack sizes.
 * Stage 2 (v2): the menu with a confirmed recipe for every item.
 *
 * The three test users share one password. It is read from SEED_USER_PASSWORD
 * in `.env.seed.local` (git-ignored); the first run creates that file with a
 * random password. Open the file to see it. It is never printed.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/db/schema";
import { ingredients, locations, memberships, menuItems, organizations, packSizes, recipeLines } from "../lib/db/schema";
import { costPerBaseUnit, toDbQty, toDbUnitCost } from "../lib/units";
import { SEED_INGREDIENTS, SEED_LOCATION, SEED_MENU, SEED_ORGANIZATION, SEED_USERS } from "./seed/data";

config({ path: ".env.local", quiet: true });

const SEED_ENV_FILE = ".env.seed.local";

function seedPassword(): string {
  if (existsSync(SEED_ENV_FILE)) {
    const match = readFileSync(SEED_ENV_FILE, "utf8").match(/^SEED_USER_PASSWORD=(.+)$/m);
    if (match) return match[1].trim();
  }
  const password = randomBytes(12).toString("base64url");
  writeFileSync(
    SEED_ENV_FILE,
    `# Password of the three seed users (see scripts/seed/data.ts). Not committed.\nSEED_USER_PASSWORD=${password}\n`,
    { mode: 0o600 },
  );
  console.log(`Created ${SEED_ENV_FILE} with a new password for the seed users.`);
  return password;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. See .env.example.`);
  return value;
}

async function main() {
  // The seed needs a session, so it uses the session pooler like migrations do.
  const pool = postgres(required("DATABASE_URL_MIGRATIONS"), { max: 1, onnotice: () => {} });
  const db = drizzle(pool, { schema });
  const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1. Organization and location
    await db
      .insert(organizations)
      .values(SEED_ORGANIZATION)
      .onConflictDoUpdate({ target: organizations.id, set: { name: SEED_ORGANIZATION.name } });
    await db
      .insert(locations)
      .values({ ...SEED_LOCATION, orgId: SEED_ORGANIZATION.id })
      .onConflictDoUpdate({
        target: locations.id,
        set: { name: SEED_LOCATION.name, timezone: SEED_LOCATION.timezone, posProvider: SEED_LOCATION.posProvider },
      });
    console.log(`Restaurant: ${SEED_LOCATION.name}`);

    // 2. Test users and their roles
    const password = seedPassword();
    let ownerId: string | undefined;
    for (const user of SEED_USERS) {
      const [existing] = await db.execute<{ id: string }>(
        sql`select id from auth.users where lower(email) = ${user.email} limit 1`,
      );
      let userId = existing?.id;
      if (userId) {
        const { error } = await supabase.auth.admin.updateUserById(userId, { password, email_confirm: true });
        if (error) throw new Error(`Could not update ${user.email}: ${error.message}`);
      } else {
        const { data, error } = await supabase.auth.admin.createUser({
          email: user.email,
          password,
          email_confirm: true,
        });
        if (error || !data.user) throw new Error(`Could not create ${user.email}: ${error?.message}`);
        userId = data.user.id;
      }
      await db
        .insert(memberships)
        .values({ userId, locationId: SEED_LOCATION.id, role: user.role })
        .onConflictDoUpdate({ target: [memberships.userId, memberships.locationId], set: { role: user.role } });
      if (user.role === "owner") ownerId = userId;
      console.log(`User: ${user.email} (${user.role})`);
    }

    // 3. Ingredients and pack sizes
    const ingredientIdByName = new Map<string, string>();
    for (const item of SEED_INGREDIENTS) {
      const columns = {
        baseUnit: item.baseUnit,
        costPerBaseUnit: toDbUnitCost(costPerBaseUnit(item.cost.price, item.cost.per)),
        reorderPoint: item.reorderPoint ? toDbQty(item.reorderPoint) : null,
        parLevel: item.parLevel ? toDbQty(item.parLevel) : null,
        category: item.category,
        storageArea: item.storageArea,
        isActive: true,
      };
      // Names are unique per location without regard to case, so match the same way.
      const [existing] = await db
        .select({ id: ingredients.id })
        .from(ingredients)
        .where(sql`${ingredients.locationId} = ${SEED_LOCATION.id} and lower(${ingredients.name}) = lower(${item.name})`);
      const [saved] = existing
        ? await db.update(ingredients).set(columns).where(sql`${ingredients.id} = ${existing.id}`).returning({ id: ingredients.id })
        : await db
            .insert(ingredients)
            .values({ locationId: SEED_LOCATION.id, name: item.name, ...columns })
            .returning({ id: ingredients.id });

      ingredientIdByName.set(item.name, saved.id);

      // Clear the default first, so the one-default-per-ingredient index never trips.
      await db.execute(
        sql`update public.pack_sizes set is_default = false where ingredient_id = ${saved.id} and is_default`,
      );
      for (const [index, pack] of item.packs.entries()) {
        const packColumns = { qtyInBaseUnit: toDbQty(pack.qtyInBaseUnit), isDefault: index === 0 };
        await db
          .insert(packSizes)
          .values({ locationId: SEED_LOCATION.id, ingredientId: saved.id, label: pack.label, ...packColumns })
          .onConflictDoUpdate({ target: [packSizes.ingredientId, packSizes.label], set: packColumns });
      }
    }
    console.log(`Ingredients: ${SEED_INGREDIENTS.length}, with their pack sizes`);

    // 4. Menu items and their recipes. Lines are confirmed, so the items are mapped.
    for (const item of SEED_MENU) {
      const recipe = Object.entries(item.recipe ?? {});
      const columns = {
        displayName: item.displayName ?? item.posName,
        kind: item.kind ?? ("item" as const),
        category: item.category,
        price: item.price ?? null,
        isMapped: recipe.length > 0,
        isIgnored: item.ignored ?? false,
      };
      const [existing] = await db
        .select({ id: menuItems.id })
        .from(menuItems)
        .where(
          sql`${menuItems.locationId} = ${SEED_LOCATION.id} and ${menuItems.posItemId} is null and lower(${menuItems.posName}) = lower(${item.posName})`,
        );
      const [saved] = existing
        ? await db.update(menuItems).set(columns).where(sql`${menuItems.id} = ${existing.id}`).returning({ id: menuItems.id })
        : await db
            .insert(menuItems)
            .values({ locationId: SEED_LOCATION.id, posName: item.posName, ...columns })
            .returning({ id: menuItems.id });

      await db.delete(recipeLines).where(sql`${recipeLines.menuItemId} = ${saved.id}`);
      for (const [ingredientName, qtyBaseUnit] of recipe) {
        const ingredientId = ingredientIdByName.get(ingredientName);
        if (!ingredientId) throw new Error(`Recipe of ${item.posName}: unknown ingredient "${ingredientName}"`);
        await db.insert(recipeLines).values({
          locationId: SEED_LOCATION.id,
          menuItemId: saved.id,
          ingredientId,
          qtyBaseUnit: toDbQty(qtyBaseUnit),
          source: "manual",
          confirmedAt: new Date(),
          confirmedBy: ownerId ?? null,
        });
      }
    }
    console.log(`Menu: ${SEED_MENU.length} items, each with a recipe or ignored`);
    console.log(`\nDone. Log in as one of the users above; the password is in ${SEED_ENV_FILE}.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
