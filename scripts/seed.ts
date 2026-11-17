/**
 * Seeds the pizzeria example from SPEC.md. Safe to run again: it updates the
 * same rows (fixed ids, names and labels) and never deletes anything.
 *
 *   npm run db:seed
 *
 * Stage 1 (v1): organization, location, three test users, ingredients, pack sizes.
 * Stage 2 (v2): the menu with a confirmed recipe for every item.
 * Stage 3 (v3): opening stock and a delivery as ledger movements, and the
 *               worked example's day of sales imported from a sample CSV.
 * Stage 4 (v4): the dropped tray (waste) and the closing count, submitted by
 *               staff and approved by the manager: mozzarella -500 g, -EUR 4.00.
 *
 * The ledger is append-only, so stock is seeded once: when the demo restaurant
 * already has movements, that part is skipped. Sales are imported through the
 * same code as the import screen, which skips orders that are already there.
 *
 * The three test users share one password. It is read from SEED_USER_PASSWORD
 * in `.env.seed.local` (git-ignored); the first run creates that file with a
 * random password. Open the file to see it. It is never printed.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/db/schema";
import { ingredients, locations, memberships, menuItems, organizations, packSizes, recipeLines, stockMovements } from "../lib/db/schema";
import { confirmImport, parseCsv, prepareImport, previewImport } from "../lib/imports";
import { zonedTimeToUtc } from "../lib/imports/time";
import { approveCount, saveCountEntries, startCount, submitCount } from "../lib/counts";
import { runAsUser } from "../lib/db/rls";
import { appendMovements, stockAt, stockOf, type NewMovement } from "../lib/ledger";
import { countSessions } from "../lib/db/schema";
import { costPerBaseUnit, toDbQty, toDbUnitCost } from "../lib/units";
import {
  SEED_COLUMN_MAP,
  SEED_DAY,
  SEED_INGREDIENTS,
  SEED_LOCATION,
  SEED_MENU,
  SEED_ORGANIZATION,
  SEED_USERS,
} from "./seed/data";

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
    const userIdByRole = new Map<string, string>();
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
      userIdByRole.set(user.role, userId);
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

    // 5. Stock for the worked example's day. All movements go through lib/ledger.
    const at = (hour: number) => zonedTimeToUtc({ ...SEED_DAY.date, hour, minute: 0, second: 0 }, SEED_LOCATION.timezone);
    const [anyMovement] = await db
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(sql`${stockMovements.locationId} = ${SEED_LOCATION.id}`)
      .limit(1);
    if (anyMovement) {
      console.log("Stock: the demo restaurant already has movements, so opening stock was not added again");
    } else {
      const movements: NewMovement[] = [];
      for (const item of SEED_INGREDIENTS) {
        const ingredientId = ingredientIdByName.get(item.name)!;
        const isMozzarella = item.name === SEED_DAY.mozzarella.name;
        const opening = isMozzarella ? SEED_DAY.mozzarella.openingQty : item.parLevel;
        if (opening) {
          movements.push({
            ingredientId,
            qtyDelta: opening,
            type: "count_adjust",
            note: "Opening stock (seed)",
            occurredAt: at(SEED_DAY.openingHour),
            createdBy: ownerId ?? null,
          });
        }
        if (isMozzarella) {
          movements.push({
            ingredientId,
            qtyDelta: SEED_DAY.mozzarella.deliveryQty,
            type: "delivery",
            note: "5 × Bag 1 kg (seed)",
            occurredAt: at(SEED_DAY.deliveryHour),
            createdBy: ownerId ?? null,
          });
        }
      }
      await db.transaction((tx) => appendMovements(tx, SEED_LOCATION.id, movements));
      console.log(`Stock: opening stock for ${SEED_INGREDIENTS.length} ingredients and the mozzarella delivery`);
    }

    // 6. The day's sales, through the same import code as the screen.
    if (!ownerId) throw new Error("The seed owner is missing");
    const csv = parseCsv(readFileSync(path.resolve(SEED_DAY.salesFile), "utf8"));
    const prepared = prepareImport(csv, { ...SEED_COLUMN_MAP }, SEED_LOCATION.timezone);
    if (prepared.invalidRows.length > 0) throw new Error(`The sample sales file has ${prepared.invalidRows.length} invalid rows`);
    const imported = await db.transaction(async (tx) => {
      const preview = await previewImport(tx, SEED_LOCATION.id, prepared);
      if (preview.orders.new === 0) return null;
      return confirmImport(tx, SEED_LOCATION.id, ownerId!, { fileName: path.basename(SEED_DAY.salesFile), prepared });
    });
    console.log(
      imported
        ? `Sales: ${imported.ordersImported} orders imported (${imported.linesImported} lines, ${imported.linesWaiting} waiting for a recipe)`
        : "Sales: the sample day was already imported",
    );

    // 7. The dropped tray and the closing count. Done as the demo users, through
    //    the same code as the screens, so RLS and the ledger rules apply.
    const staffId = userIdByRole.get("staff")!;
    const managerId = userIdByRole.get("manager")!;
    const mozzarellaId = ingredientIdByName.get(SEED_DAY.mozzarella.name)!;
    const minuteAt = (hour: number, minute: number) =>
      zonedTimeToUtc({ ...SEED_DAY.date, hour, minute, second: 0 }, SEED_LOCATION.timezone);

    const [existingCount] = await db
      .select({ id: countSessions.id })
      .from(countSessions)
      .where(sql`${countSessions.clientId} = ${SEED_DAY.closingCount.clientId}`);
    if (existingCount) {
      console.log("Count: the closing count is already there");
    } else {
      await runAsUser(db, staffId, (tx) =>
        appendMovements(tx, SEED_LOCATION.id, [
          {
            ingredientId: mozzarellaId,
            qtyDelta: SEED_DAY.waste.qty,
            type: "waste",
            wasteReason: SEED_DAY.waste.reason,
            note: SEED_DAY.waste.note,
            occurredAt: minuteAt(SEED_DAY.waste.hour, SEED_DAY.waste.minute),
            createdBy: staffId,
          },
        ]),
      );

      const countTime = at(SEED_DAY.closingCount.hour);
      const sessionId = await runAsUser(db, staffId, async (tx) => {
        const expected = await stockAt(tx, SEED_LOCATION.id, countTime);
        const id = await startCount(tx, SEED_LOCATION.id, staffId, SEED_DAY.closingCount.clientId);
        await saveCountEntries(
          tx,
          SEED_LOCATION.id,
          staffId,
          id,
          SEED_INGREDIENTS.map((item) => {
            const ingredientId = ingredientIdByName.get(item.name)!;
            const counted = SEED_DAY.closingCount.counted[item.name] ?? stockOf(expected, ingredientId);
            // A shelf never holds less than nothing.
            return { ingredientId, amount: counted.startsWith("-") ? "0" : counted, unit: item.baseUnit };
          }),
        );
        await submitCount(tx, SEED_LOCATION.id, staffId, id, countTime);
        return id;
      });
      await runAsUser(db, managerId, (tx) => approveCount(tx, SEED_LOCATION.id, managerId, sessionId));
      console.log("Count: dropped tray logged; closing count submitted by staff and approved by the manager");
    }
    console.log(`\nDone. Log in as one of the users above; the password is in ${SEED_ENV_FILE}.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
