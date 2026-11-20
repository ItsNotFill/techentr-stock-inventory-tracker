import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAsUser } from "@/lib/db/rls";
import { ingredients, menuItems, packSizes, recipeLines, saleLines } from "@/lib/db/schema";
import { createIngredient, listIngredients } from "@/lib/ingredients";
import { stockNow, stockOf } from "@/lib/ledger";
import { createMenuItem, getMenuItem } from "@/lib/menu";
import { confirmSetupImport, planSetupImport, SetupImportError, type SetupFiles } from "@/lib/setup-import";
import { ingredientFormSchema } from "@/lib/validation/ingredients";
import { menuItemFormSchema } from "@/lib/validation/menu";
import { SEED_INGREDIENTS, SEED_MENU } from "../../scripts/seed/data";
import {
  addTestMember,
  createTestDb,
  createTestRestaurant,
  createTestUser,
  deleteTestRestaurants,
  deleteTestUser,
  hasDatabase,
  type TestDb,
  type TestRestaurant,
  type TestUser,
} from "../helpers/db";
import { insertTestSales } from "../helpers/sales";

const csv = (rows: (string | null | undefined)[][]) =>
  rows.map((row) => row.map((value) => (value ?? "").includes(",") ? `"${value}"` : (value ?? "")).join(",")).join("\n");

const largerUnit = { g: "kg", ml: "l", unit: "unit" } as const;

/** The seed's pizzeria as the two setup files, written the way a person would. */
function pizzeriaFiles(): { ingredients: string; recipes: string } {
  const ingredientRows: (string | null)[][] = [
    ["name", "unit", "cost", "cost_per", "pack", "pack_size", "pack_unit", "reorder_point", "par_level", "level_unit", "category", "storage_area"],
  ];
  for (const item of SEED_INGREDIENTS) {
    const costPer = item.cost.per === "1" ? item.baseUnit : largerUnit[item.baseUnit];
    const first = [item.name, item.baseUnit, item.cost.price, costPer];
    const levels = [item.reorderPoint ?? "", item.parLevel ?? "", item.baseUnit, item.category ?? "", item.storageArea ?? ""];
    const [firstPack, ...otherPacks] = item.packs ?? [];
    ingredientRows.push([...first, firstPack?.label ?? "", firstPack?.qtyInBaseUnit ?? "", firstPack ? item.baseUnit : "", ...levels]);
    for (const pack of otherPacks) ingredientRows.push([item.name, "", "", "", pack.label, pack.qtyInBaseUnit, item.baseUnit, "", "", "", "", ""]);
  }
  const unitOf = new Map(SEED_INGREDIENTS.map((item) => [item.name, item.baseUnit]));
  const recipeRows: (string | null)[][] = [["menu_item", "pos_item_id", "kind", "category", "price", "ingredient", "amount", "unit"]];
  for (const item of SEED_MENU) {
    const lines = Object.entries(item.recipe ?? {});
    const head = [item.posName, "", item.kind ?? "item", item.category ?? "", item.price ?? ""];
    if (lines.length === 0) recipeRows.push([...head, "", "", ""]);
    lines.forEach(([ingredient, amount], index) =>
      recipeRows.push([...(index === 0 ? head : [item.posName, "", "", "", ""]), ingredient, amount, unitOf.get(ingredient)!]),
    );
  }
  return { ingredients: csv(ingredientRows), recipes: csv(recipeRows) };
}

const packCount = SEED_INGREDIENTS.reduce((total, item) => total + (item.packs?.length ?? 0), 0);
const itemsWithRecipe = SEED_MENU.filter((item) => Object.keys(item.recipe ?? {}).length > 0).length;

/** The setup import (lib/setup-import) against the real database. */
describe.skipIf(!hasDatabase)("setup import", () => {
  let testDb: TestDb;
  let owner: TestUser;
  let staff: TestUser;
  let otherOwner: TestUser;
  let restaurant: TestRestaurant;
  let otherRestaurant: TestRestaurant;
  const files = pizzeriaFiles();

  const as = <T>(user: TestUser, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(testDb.db, user.id, fn);
  const loc = () => restaurant.locationId;
  const plan = (input: SetupFiles, user = owner, location = loc()) => as(user, (tx) => planSetupImport(tx, location, input));
  const confirm = (input: SetupFiles, user = owner) => as(user, (tx) => confirmSetupImport(tx, loc(), user.id, input));
  const ingredientCount = async () => (await as(owner, (tx) => listIngredients(tx, loc(), { includeArchived: true }))).length;

  beforeAll(async () => {
    testDb = createTestDb();
    [owner, staff, otherOwner] = await Promise.all([
      createTestUser("setup-owner"),
      createTestUser("setup-staff"),
      createTestUser("setup-other"),
    ]);
    restaurant = await createTestRestaurant(testDb.db, owner, "Setup Import");
    otherRestaurant = await createTestRestaurant(testDb.db, otherOwner, "Setup Other");
    await addTestMember(testDb.db, restaurant, staff, "staff");
  });

  afterAll(async () => {
    await deleteTestRestaurants(testDb.db, [restaurant, otherRestaurant]);
    await Promise.all([owner, staff, otherOwner].map(deleteTestUser));
    await testDb.close();
  });

  it("previews the whole pizzeria without writing anything", async () => {
    const preview = await plan(files);
    expect(preview.issues.filter((issue) => !issue.warning)).toEqual([]);
    expect(preview.counts).toEqual({
      ingredientsCreated: SEED_INGREDIENTS.length,
      ingredientsKept: 0,
      packsAdded: packCount,
      menuItemsCreated: SEED_MENU.length,
      menuItemsKept: 0,
      recipesSaved: itemsWithRecipe,
    });
    expect(preview.menuItems.find((item) => item.posName === "Margherita")?.lines).toContainEqual(
      expect.objectContaining({ ingredientName: "Mozzarella", qtyBaseUnit: "120.000", baseUnit: "g" }),
    );
    expect(await ingredientCount()).toBe(0);
  });

  it("refuses staff, whose role cannot write ingredients", async () => {
    await expect(confirm(files, staff)).rejects.toThrow();
    expect(await ingredientCount()).toBe(0);
  });

  it("imports it: ingredients with costs and packs, menu items with confirmed recipes", async () => {
    const result = await confirm(files);
    expect(result).toMatchObject({ ingredientsCreated: SEED_INGREDIENTS.length, packsAdded: packCount, recipesSaved: itemsWithRecipe });

    const [mozzarella] = await testDb.db
      .select()
      .from(ingredients)
      .where(and(eq(ingredients.locationId, loc()), eq(ingredients.name, "Mozzarella")));
    expect(mozzarella).toMatchObject({ baseUnit: "g", costPerBaseUnit: "0.008000", reorderPoint: "2000.000", parLevel: "8000.000", storageArea: "Walk-in fridge" });
    const packs = await testDb.db.select().from(packSizes).where(eq(packSizes.ingredientId, mozzarella.id));
    expect(packs.map((pack) => [pack.label, pack.qtyInBaseUnit, pack.isDefault]).sort()).toEqual([
      ["Bag 1 kg", "1000.000", true],
      ["Case 10×1 kg", "10000.000", false],
    ]);

    const items = await testDb.db.select().from(menuItems).where(eq(menuItems.locationId, loc()));
    expect(items).toHaveLength(SEED_MENU.length);
    const margherita = items.find((item) => item.posName === "Margherita")!;
    expect(margherita).toMatchObject({ isMapped: true, category: "Pizza", price: "9.50" });
    const detail = await as(owner, (tx) => getMenuItem(tx, loc(), margherita.id));
    expect(detail?.lines.find((line) => line.ingredientName === "Mozzarella")).toMatchObject({ qtyBaseUnit: "120.000", confirmed: true });
    expect(items.find((item) => item.posName === "Extra mozzarella")).toMatchObject({ kind: "modifier", isMapped: true });
    // Ignoring is done in the app: an item without a recipe waits under "Needs recipe".
    expect(items.find((item) => item.posName === "Service charge")).toMatchObject({ isMapped: false, isIgnored: false });
  });

  it("changes nothing when the same files are uploaded again", async () => {
    const again = await plan(files);
    expect(again.issues.filter((issue) => !issue.warning)).toEqual([]);
    expect(again.counts).toEqual({
      ingredientsCreated: 0,
      ingredientsKept: SEED_INGREDIENTS.length,
      packsAdded: 0,
      menuItemsCreated: 0,
      menuItemsKept: SEED_MENU.length,
      recipesSaved: 0,
    });
    expect(new Set(again.menuItems.map((item) => item.recipe))).toEqual(new Set(["same", "none"]));
  });

  it("replaces a changed recipe as a whole and adds a new pack to a known ingredient", async () => {
    const recipes = "menu_item,ingredient,amount,unit\nMargherita,Mozzarella,130,g\nMargherita,Tomato passata,80,ml";
    const extraPack = "name,unit,pack,pack_size,pack_unit\nMozzarella,g,Block 2.5 kg,2.5,kg";
    const preview = await plan({ ingredients: extraPack, recipes });
    expect(preview.issues.filter((issue) => !issue.warning)).toEqual([]);
    expect(preview.menuItems).toEqual([expect.objectContaining({ posName: "Margherita", action: "keep", recipe: "replace" })]);
    expect(preview.ingredients).toEqual([expect.objectContaining({ name: "Mozzarella", action: "keep", packsToAdd: [{ label: "Block 2.5 kg", amount: "2.5", unit: "kg" }] })]);

    await confirm({ ingredients: extraPack, recipes });
    const [margherita] = await testDb.db.select().from(menuItems).where(and(eq(menuItems.locationId, loc()), eq(menuItems.posName, "Margherita")));
    const lines = await testDb.db.select().from(recipeLines).where(eq(recipeLines.menuItemId, margherita.id));
    expect(lines.map((line) => line.qtyBaseUnit).sort()).toEqual(["130.000", "80.000"]);
  });

  it("writes nothing when anything is wrong, and says where", async () => {
    const before = await ingredientCount();
    const bad: SetupFiles = {
      ingredients: "name,unit,cost\nTruffle oil,ml,90\nMozzarella,ml,8",
      recipes: "menu_item,ingredient,amount,unit\nTartufo,Truffle oil,5,ml\nTartufo,Black truffle,3,g\nTartufo,Truffle oil,5,ml",
    };
    const preview = await plan(bad);
    expect(preview.issues.filter((issue) => !issue.warning).map((issue) => [issue.sheet, issue.line])).toEqual([
      ["ingredients", 3],
      ["recipes", 3],
      ["recipes", 4],
    ]);
    expect(preview.issues.find((issue) => issue.sheet === "ingredients")?.message).toContain("already exists and is counted in g");
    expect(preview.issues.find((issue) => issue.line === 3 && issue.sheet === "recipes")?.message).toContain('"Black truffle" is not an ingredient');

    const error = await confirm(bad).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SetupImportError);
    expect((error as SetupImportError).issues.length).toBeGreaterThan(0);
    expect(await ingredientCount()).toBe(before);
  });

  it("refuses two new menu items with the same name", async () => {
    const preview = await plan({ ingredients: null, recipes: "menu_item,pos_item_id\nCalzone fritto,P1\nCALZONE FRITTO,P2" });
    expect(preview.issues.filter((issue) => !issue.warning)).toEqual([
      expect.objectContaining({ sheet: "recipes", line: 3, message: expect.stringContaining("same name as the new item on line 2") }),
    ]);
  });

  it("depletes sales that waited for a recipe (the back-fill)", async () => {
    const [calzone, ricotta] = await as(owner, async (tx) => [
      await createMenuItem(tx, loc(), menuItemFormSchema.parse({ posName: "Calzone", posItemId: "", displayName: "", kind: "item", category: "", price: "" })),
      await createIngredient(
        tx,
        loc(),
        ingredientFormSchema.parse({ name: "Ricotta", baseUnit: "g", costAmount: "6", costUnit: "kg", reorderPoint: "", parLevel: "", levelUnit: "kg", category: "", storageArea: "" }),
      ),
    ]);
    await insertTestSales(testDb.db, owner.id, loc(), [
      { posOrderId: "SETUP-1", soldAt: new Date(Date.now() - 3_600_000), lines: [{ menuItemId: calzone, qty: "4" }] },
    ]);
    const result = await confirm({ ingredients: null, recipes: "menu_item,ingredient,amount,unit\ncalzone,ricotta,0.1,kg" });
    expect(result).toMatchObject({ menuItemsKept: 1, recipesSaved: 1, backfilledLines: 1 });
    expect(stockOf(await as(owner, (tx) => stockNow(tx, loc())), ricotta)).toBe("-400.000");
    const waiting = await testDb.db.select().from(saleLines).where(eq(saleLines.menuItemId, calzone));
    expect(waiting.every((line) => line.depletedAt !== null)).toBe(true);
  });

  it("keeps restaurants apart", async () => {
    // Another restaurant matches none of these ingredients or items.
    const preview = await plan(files, otherOwner, otherRestaurant.locationId);
    expect(preview.counts.ingredientsKept).toBe(0);
    expect(preview.counts.menuItemsKept).toBe(0);
  });
});
