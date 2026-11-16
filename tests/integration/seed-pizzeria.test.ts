import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAsUser } from "@/lib/db/rls";
import { zonedTimeToUtc } from "@/lib/imports/time";
import { listIngredients } from "@/lib/ingredients";
import { stockAt, stockOf } from "@/lib/ledger";
import { getMenuItem, listMenuItems } from "@/lib/menu";
import { menuItemStatus } from "@/lib/menu/status";
import { SEED_DAY, SEED_INGREDIENTS, SEED_LOCATION, SEED_MENU, SEED_USERS } from "../../scripts/seed/data";
import { createTestDb, hasDatabase, type TestDb } from "../helpers/db";

/**
 * Checks the seeded pizzeria (npm run db:seed) through the same code the
 * screens use, as the seeded owner. Skipped when the seed has not been run.
 *
 * Stage 2 done check: a real pizzeria's menu is entered with a recipe for every item.
 */
describe.skipIf(!hasDatabase)("seeded pizzeria", () => {
  let testDb: TestDb;
  let ownerId: string | undefined;

  beforeAll(async () => {
    testDb = createTestDb();
    const ownerEmail = SEED_USERS.find((user) => user.role === "owner")!.email;
    const [row] = await testDb.db.execute<{ id: string }>(
      sql`select m.user_id as id from public.memberships m join auth.users u on u.id = m.user_id
          where m.location_id = ${SEED_LOCATION.id} and lower(u.email) = ${ownerEmail}`,
    );
    ownerId = row?.id;
    if (!ownerId) console.warn("The seed has not been run (npm run db:seed): seeded pizzeria checks are skipped.");
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("has every seed ingredient with a default pack size", async (context) => {
    if (!ownerId) return context.skip();
    const ingredients = await runAsUser(testDb.db, ownerId, (tx) => listIngredients(tx, SEED_LOCATION.id));
    const byName = new Map(ingredients.map((ingredient) => [ingredient.name, ingredient]));
    for (const seed of SEED_INGREDIENTS) {
      const saved = byName.get(seed.name);
      expect(saved, seed.name).toBeDefined();
      expect(saved!.packSizes.filter((pack) => pack.isDefault), seed.name).toHaveLength(1);
    }
    expect(byName.get("Mozzarella")?.costPerBaseUnit).toBe("0.008000"); // EUR 8 per kg
  });

  it("has a confirmed recipe for every menu item that uses stock", async (context) => {
    if (!ownerId) return context.skip();
    const menu = await runAsUser(testDb.db, ownerId, (tx) => listMenuItems(tx, SEED_LOCATION.id));
    const byName = new Map(menu.map((item) => [item.posName, item]));

    for (const seed of SEED_MENU) {
      const saved = byName.get(seed.posName);
      expect(saved, seed.posName).toBeDefined();
      if (seed.ignored) {
        expect(menuItemStatus(saved!), seed.posName).toBe("ignored");
        expect(saved!.lineCount).toBe(0);
      } else {
        expect(menuItemStatus(saved!), seed.posName).toBe("mapped");
        expect(saved!.lineCount, seed.posName).toBe(Object.keys(seed.recipe ?? {}).length);
        expect(saved!.draftLineCount).toBe(0);
      }
    }
    // Nothing from the seed is left waiting for a recipe.
    const seedNames = new Set(SEED_MENU.map((item) => item.posName));
    expect(menu.filter((item) => seedNames.has(item.posName) && menuItemStatus(item) === "unmapped")).toEqual([]);
  });

  it("the worked example's day leaves 2,600 g of mozzarella (stage 3 done check)", async (context) => {
    if (!ownerId) return context.skip();
    const ingredients = await runAsUser(testDb.db, ownerId, (tx) => listIngredients(tx, SEED_LOCATION.id));
    const mozzarella = ingredients.find((ingredient) => ingredient.name === SEED_DAY.mozzarella.name)!;
    const at = (hour: number) => zonedTimeToUtc({ ...SEED_DAY.date, hour, minute: 0, second: 0 }, SEED_LOCATION.timezone);
    const stockAtHour = async (hour: number) =>
      stockOf(await runAsUser(testDb.db, ownerId!, (tx) => stockAt(tx, SEED_LOCATION.id, at(hour))), mozzarella.id);

    expect(await stockAtHour(SEED_DAY.openingHour)).toBe("2000.000"); // opening count
    expect(await stockAtHour(SEED_DAY.deliveryHour)).toBe("7000.000"); // + 5 x 1 kg
    expect(await stockAtHour(15)).toBe("5000.000"); // after lunch: 14 Margherita (1,680 g), 4 Quattro Formaggi (320 g)
    // After the last order of the day: 7,000 - 30 x 120 - 10 x 80. Later movements do not change this.
    expect(await stockAtHour(22)).toBe("2600.000");
  });

  it("uses the SPEC amounts: Margherita 120 g and Quattro Formaggi 80 g of mozzarella", async (context) => {
    if (!ownerId) return context.skip();
    const mozzarellaIn = async (posName: string) => {
      const menu = await runAsUser(testDb.db, ownerId!, (tx) => listMenuItems(tx, SEED_LOCATION.id));
      const item = menu.find((entry) => entry.posName === posName)!;
      const detail = await runAsUser(testDb.db, ownerId!, (tx) => getMenuItem(tx, SEED_LOCATION.id, item.id));
      const line = detail!.lines.find((entry) => entry.ingredientName === "Mozzarella");
      return [line?.qtyBaseUnit, line?.confirmed];
    };
    expect(await mozzarellaIn("Margherita")).toEqual(["120.000", true]);
    expect(await mozzarellaIn("Quattro Formaggi")).toEqual(["80.000", true]);
  });
});
