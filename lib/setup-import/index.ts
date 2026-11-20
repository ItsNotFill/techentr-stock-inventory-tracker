import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { ingredients, packSizes, recipeLines, type BaseUnit } from "@/lib/db/schema";
import { CsvError, parseCsv } from "@/lib/imports/csv";
import { menuItemMatcher } from "@/lib/imports";
import { addPackSize, createIngredient } from "@/lib/ingredients";
import { createMenuItem, saveRecipe } from "@/lib/menu";
import { toBaseUnits, toDbQty, toDecimal } from "@/lib/units";
import { ingredientFormSchema, packSizeFormSchema } from "@/lib/validation/ingredients";
import { MAX_RECIPE_LINES, menuItemFormSchema, recipeInputSchema } from "@/lib/validation/menu";
import {
  fitsBaseUnit,
  hasErrors,
  menuItemKey,
  readIngredientSheet,
  readRecipeSheet,
  type SheetIngredient,
  type SheetIssue,
  type SheetMenuItem,
  type SheetName,
} from "./parse";

export { hasErrors, MAX_SETUP_ROWS } from "./parse";
export type { SheetIssue, SheetName } from "./parse";

/**
 * The setup import (DECISIONS.md 92): a restaurant's ingredients, pack sizes,
 * menu items and recipes from two CSV files, so a pilot is set up in an hour.
 *
 * - The files are read and checked on the server at every step, so the
 *   preview is exactly what is imported (as for sales, DECISIONS.md 64).
 * - All or nothing: any error and nothing is written. Fix the file, upload again.
 * - Existing ingredients and menu items are matched (ingredients by name,
 *   items as the sales import matches them) and never duplicated or changed;
 *   the file may add pack sizes to them.
 * - A recipe in the file replaces the item's recipe as a whole, through the
 *   same code as the recipe editor (confirmed lines, is_mapped, back-fill of
 *   sales that waited for a recipe).
 *
 * Owners and managers only: RLS refuses anyone else's writes.
 */

export class SetupImportError extends Error {
  constructor(
    message: string,
    readonly issues: SheetIssue[] = [],
  ) {
    super(message);
    this.name = "SetupImportError";
  }
}

export type SetupFiles = {
  /** The text of ingredients.csv, or null when only recipes are imported. */
  ingredients: string | null;
  /** The text of recipes.csv, or null. */
  recipes: string | null;
};

export type PlannedPack = { label: string; amount: string; unit: string };

export type IngredientPlan = {
  name: string;
  baseUnit: BaseUnit;
  line: number;
  /** create: new; keep: already in the app, left as it is (packs may be added). */
  action: "create" | "keep";
  archived: boolean;
  packsToAdd: PlannedPack[];
};

export type PlannedLine = { ingredientName: string; amount: string; unit: string; qtyBaseUnit: string; baseUnit: BaseUnit };

export type MenuItemPlan = {
  posName: string;
  posItemId: string | null;
  line: number;
  action: "create" | "keep";
  /** none: the file gives no recipe; new: first recipe; replace: a different recipe; same: nothing changes. */
  recipe: "none" | "new" | "replace" | "same";
  previousLineCount: number;
  lines: PlannedLine[];
};

export type SetupPlan = {
  ingredients: IngredientPlan[];
  menuItems: MenuItemPlan[];
  /** Errors stop the import; warnings do not. */
  issues: SheetIssue[];
  counts: {
    ingredientsCreated: number;
    ingredientsKept: number;
    packsAdded: number;
    menuItemsCreated: number;
    menuItemsKept: number;
    recipesSaved: number;
  };
};

export type SetupResult = SetupPlan["counts"] & { backfilledLines: number };

type Internal = {
  plan: SetupPlan;
  sheetIngredients: Map<string, SheetIngredient>;
  existingIngredientIds: Map<string, string>;
  menuItemIds: Map<string, string>;
  sheetItems: Map<string, SheetMenuItem>;
};

const nameKey = (name: string) => name.trim().toLowerCase();

function readFile(text: string | null, sheet: SheetName, issues: SheetIssue[]) {
  if (text === null) return null;
  try {
    return parseCsv(text);
  } catch (error) {
    if (error instanceof CsvError) {
      issues.push({ sheet, line: null, message: error.message });
      return null;
    }
    throw error;
  }
}

/** Formats Zod messages of one schema check as issues on a line. */
function schemaIssues(sheet: SheetName, line: number, label: string, messages: string[]): SheetIssue[] {
  return messages.map((message) => ({ sheet, line, message: `${label}: ${message}` }));
}

async function buildPlan(tx: Tx, locationId: string, files: SetupFiles): Promise<Internal> {
  const issues: SheetIssue[] = [];
  if (files.ingredients === null && files.recipes === null) {
    throw new SetupImportError("Choose at least one file: ingredients, recipes, or both.");
  }
  const ingredientCsv = readFile(files.ingredients, "ingredients", issues);
  const recipeCsv = readFile(files.recipes, "recipes", issues);
  const ingredientSheet = ingredientCsv ? readIngredientSheet(ingredientCsv) : { ingredients: [], issues: [] };
  const recipeSheet = recipeCsv ? readRecipeSheet(recipeCsv) : { items: [], issues: [] };
  issues.push(...ingredientSheet.issues, ...recipeSheet.issues);

  // What the restaurant already has.
  const existing = await tx
    .select({ id: ingredients.id, name: ingredients.name, baseUnit: ingredients.baseUnit, isActive: ingredients.isActive })
    .from(ingredients)
    .where(eq(ingredients.locationId, locationId));
  const existingByName = new Map(existing.map((row) => [nameKey(row.name), row]));
  const existingPacks = await tx
    .select({ ingredientId: packSizes.ingredientId, label: packSizes.label })
    .from(packSizes)
    .where(eq(packSizes.locationId, locationId));

  // ---- Ingredients -------------------------------------------------------
  const ingredientPlans: IngredientPlan[] = [];
  const sheetIngredients = new Map<string, SheetIngredient>();
  for (const ingredient of ingredientSheet.ingredients) {
    const key = nameKey(ingredient.name);
    sheetIngredients.set(key, ingredient);
    const known = existingByName.get(key);
    const label = ingredient.name;
    const packIssues = (pack: PlannedPack, line: number) => {
      const checked = packSizeFormSchema.safeParse({ label: pack.label, amount: pack.amount, unit: pack.unit, isDefault: false });
      return checked.success ? [] : schemaIssues("ingredients", line, `${label}, pack "${pack.label}"`, checked.error.issues.map((issue) => issue.message));
    };

    if (known) {
      if (known.baseUnit !== ingredient.baseUnit) {
        issues.push({
          sheet: "ingredients",
          line: ingredient.line,
          message: `${label} already exists and is counted in ${known.baseUnit}; the file says ${ingredient.baseUnit}. Change the file, or the ingredient in the app.`,
        });
        continue;
      }
      const labels = new Set(existingPacks.filter((pack) => pack.ingredientId === known.id).map((pack) => pack.label.toLowerCase()));
      const packsToAdd = ingredient.packs.filter((pack) => !labels.has(pack.label.toLowerCase()));
      for (const pack of packsToAdd) issues.push(...packIssues(pack, pack.line));
      ingredientPlans.push({
        name: known.name,
        baseUnit: known.baseUnit,
        line: ingredient.line,
        action: "keep",
        archived: !known.isActive,
        packsToAdd: packsToAdd.map(({ label: packLabel, amount, unit }) => ({ label: packLabel, amount, unit })),
      });
      continue;
    }

    const checked = ingredientFormSchema.safeParse(ingredientValues(ingredient));
    if (!checked.success) {
      issues.push(...schemaIssues("ingredients", ingredient.line, label, checked.error.issues.map((issue) => issue.message)));
      continue;
    }
    for (const pack of ingredient.packs) issues.push(...packIssues(pack, pack.line));
    ingredientPlans.push({
      name: ingredient.name,
      baseUnit: ingredient.baseUnit,
      line: ingredient.line,
      action: "create",
      archived: false,
      packsToAdd: ingredient.packs.map(({ label: packLabel, amount, unit }) => ({ label: packLabel, amount, unit })),
    });
  }

  // ---- Menu items and recipes -------------------------------------------
  const findItem = await menuItemMatcher(tx, locationId);
  const matched = new Map<string, string>();
  const itemPlans: MenuItemPlan[] = [];
  const menuItemIds = new Map<string, string>();
  const sheetItems = new Map<string, SheetMenuItem>();

  const knownItems = recipeSheet.items.map((item) => ({ item, known: findItem(item) }));
  const knownIds = knownItems.flatMap(({ known }) => (known ? [known.id] : []));
  const currentLines = knownIds.length
    ? await tx
        .select({ menuItemId: recipeLines.menuItemId, ingredientId: recipeLines.ingredientId, qtyBaseUnit: recipeLines.qtyBaseUnit })
        .from(recipeLines)
        .where(and(eq(recipeLines.locationId, locationId), inArray(recipeLines.menuItemId, knownIds), isNotNull(recipeLines.confirmedAt)))
    : [];

  for (const { item, known } of knownItems) {
    const key = menuItemKey(item);
    sheetItems.set(key, item);
    if (known) {
      const other = matched.get(known.id);
      if (other) {
        issues.push({ sheet: "recipes", line: item.line, message: `${item.posName} is the same menu item as "${other}" in the app. Use one name or POS id for it.` });
        continue;
      }
      matched.set(known.id, item.posName);
      menuItemIds.set(key, known.id);
    } else {
      const checked = menuItemFormSchema.safeParse({
        posName: item.posName,
        posItemId: item.posItemId ?? "",
        displayName: "",
        kind: item.kind,
        category: item.category ?? "",
        price: item.price ?? "",
      });
      if (!checked.success) {
        issues.push(...schemaIssues("recipes", item.line, item.posName, checked.error.issues.map((issue) => issue.message)));
        continue;
      }
    }

    const lines: PlannedLine[] = [];
    for (const line of item.lines) {
      const resolved = resolveIngredient(line.ingredientName, existingByName, sheetIngredients);
      if (!resolved) {
        issues.push({
          sheet: "recipes",
          line: line.line,
          message: `${item.posName}: "${line.ingredientName}" is not an ingredient. Add it to the ingredients file or the Ingredients screen.`,
        });
        continue;
      }
      if (resolved.archived) {
        issues.push({ sheet: "recipes", line: line.line, message: `${item.posName}: ${resolved.name} is archived. Restore it first, or leave it out.` });
        continue;
      }
      if (!fitsBaseUnit(resolved.baseUnit, line.unit)) {
        issues.push({
          sheet: "recipes",
          line: line.line,
          message: `${item.posName}: ${resolved.name} is counted in ${resolved.baseUnit}, so its amount cannot be in ${line.unit}.`,
        });
        continue;
      }
      const qtyBaseUnit = toDbQty(toBaseUnits(line.amount, line.unit, resolved.baseUnit));
      if (!toDecimal(qtyBaseUnit).gt(0)) {
        issues.push({ sheet: "recipes", line: line.line, message: `${item.posName}: the amount of ${resolved.name} is too small to store.` });
        continue;
      }
      lines.push({ ingredientName: resolved.name, amount: line.amount, unit: line.unit, qtyBaseUnit, baseUnit: resolved.baseUnit });
    }
    if (item.lines.length > MAX_RECIPE_LINES) {
      issues.push({ sheet: "recipes", line: item.line, message: `${item.posName}: a recipe can have at most ${MAX_RECIPE_LINES} lines.` });
    }

    const previous = known ? currentLines.filter((row) => row.menuItemId === known.id) : [];
    let recipe: MenuItemPlan["recipe"] = "none";
    if (item.lines.length > 0) {
      if (previous.length === 0) recipe = "new";
      else recipe = sameRecipe(previous, lines, existingByName) ? "same" : "replace";
    }
    itemPlans.push({
      posName: item.posName,
      posItemId: item.posItemId,
      line: item.line,
      action: known ? "keep" : "create",
      recipe,
      previousLineCount: previous.length,
      lines,
    });
  }

  const plan: SetupPlan = {
    ingredients: ingredientPlans,
    menuItems: itemPlans,
    issues: issues.sort((a, b) => (a.sheet === b.sheet ? (a.line ?? 0) - (b.line ?? 0) : a.sheet === "ingredients" ? -1 : 1)),
    counts: {
      ingredientsCreated: ingredientPlans.filter((row) => row.action === "create").length,
      ingredientsKept: ingredientPlans.filter((row) => row.action === "keep").length,
      packsAdded: ingredientPlans.reduce((total, row) => total + row.packsToAdd.length, 0),
      menuItemsCreated: itemPlans.filter((row) => row.action === "create").length,
      menuItemsKept: itemPlans.filter((row) => row.action === "keep").length,
      recipesSaved: itemPlans.filter((row) => row.recipe === "new" || row.recipe === "replace").length,
    },
  };
  return {
    plan,
    sheetIngredients,
    existingIngredientIds: new Map(existing.map((row) => [nameKey(row.name), row.id])),
    menuItemIds,
    sheetItems,
  };
}

/** A new ingredient as the ingredient form would send it. */
function ingredientValues(ingredient: SheetIngredient) {
  return {
    name: ingredient.name,
    baseUnit: ingredient.baseUnit,
    costAmount: ingredient.costAmount,
    costUnit: ingredient.costUnit,
    reorderPoint: ingredient.reorderPoint ?? "",
    parLevel: ingredient.parLevel ?? "",
    levelUnit: ingredient.levelUnit,
    category: ingredient.category ?? "",
    storageArea: ingredient.storageArea ?? "",
  };
}

function resolveIngredient(
  name: string,
  existingByName: Map<string, { name: string; baseUnit: BaseUnit; isActive: boolean }>,
  sheetIngredients: Map<string, SheetIngredient>,
): { name: string; baseUnit: BaseUnit; archived: boolean } | null {
  const key = nameKey(name);
  const known = existingByName.get(key);
  if (known) return { name: known.name, baseUnit: known.baseUnit, archived: !known.isActive };
  const fromSheet = sheetIngredients.get(key);
  return fromSheet ? { name: fromSheet.name, baseUnit: fromSheet.baseUnit, archived: false } : null;
}

/** True when the file's lines are exactly the item's confirmed recipe. */
function sameRecipe(
  previous: { ingredientId: string | null; qtyBaseUnit: string }[],
  lines: PlannedLine[],
  existingByName: Map<string, { id: string }>,
): boolean {
  if (previous.length !== lines.length) return false;
  const wanted = new Map(lines.map((line) => [existingByName.get(nameKey(line.ingredientName))?.id ?? `new:${line.ingredientName}`, line.qtyBaseUnit]));
  return previous.every((row) => row.ingredientId !== null && wanted.get(row.ingredientId) !== undefined && toDecimal(wanted.get(row.ingredientId)!).eq(toDecimal(row.qtyBaseUnit)));
}

/** Reads and checks the files and says what an import would do. Writes nothing. */
export async function planSetupImport(tx: Tx, locationId: string, files: SetupFiles): Promise<SetupPlan> {
  return (await buildPlan(tx, locationId, files)).plan;
}

/**
 * Imports the files in the caller's transaction: checks them again first,
 * and writes nothing when anything is wrong (SetupImportError with the issues).
 */
export async function confirmSetupImport(tx: Tx, locationId: string, userId: string, files: SetupFiles): Promise<SetupResult> {
  const { plan, sheetIngredients, existingIngredientIds, menuItemIds, sheetItems } = await buildPlan(tx, locationId, files);
  if (hasErrors(plan.issues)) {
    throw new SetupImportError("The files have problems. Fix them and check again.", plan.issues);
  }

  const ingredientIds = new Map(existingIngredientIds);
  for (const planned of plan.ingredients) {
    const key = nameKey(planned.name);
    let id = ingredientIds.get(key);
    if (planned.action === "create") {
      id = await createIngredient(tx, locationId, ingredientFormSchema.parse(ingredientValues(sheetIngredients.get(key)!)));
      ingredientIds.set(key, id);
    }
    for (const pack of planned.packsToAdd) {
      // The first pack size of an ingredient becomes its default (lib/ingredients).
      await addPackSize(tx, locationId, id!, packSizeFormSchema.parse({ ...pack, isDefault: false }));
    }
  }

  let backfilledLines = 0;
  for (const planned of plan.menuItems) {
    const key = menuItemKey(planned);
    let id = menuItemIds.get(key);
    if (planned.action === "create") {
      const item = sheetItems.get(key)!;
      id = await createMenuItem(
        tx,
        locationId,
        menuItemFormSchema.parse({
          posName: item.posName,
          posItemId: item.posItemId ?? "",
          displayName: "",
          kind: item.kind,
          category: item.category ?? "",
          price: item.price ?? "",
        }),
      );
    }
    if (planned.recipe === "new" || planned.recipe === "replace") {
      const lines = recipeInputSchema.parse(
        planned.lines.map((line) => ({ ingredientId: ingredientIds.get(nameKey(line.ingredientName))!, amount: line.amount, unit: line.unit })),
      );
      const saved = await saveRecipe(tx, locationId, userId, id!, lines);
      backfilledLines += saved.backfilledLines;
    }
  }
  return { ...plan.counts, backfilledLines };
}
