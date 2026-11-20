import type { ParsedCsv } from "@/lib/imports/csv";
import type { BaseUnit } from "@/lib/db/schema/enums";
import { DISPLAY_UNITS, parseQuantityInput, toDecimal } from "@/lib/units";

/**
 * The setup import's two spreadsheets, read from CSV text without the
 * database (DECISIONS.md 92). One row per ingredient (a second row with the
 * same name adds another pack size) and one row per recipe line (rows of the
 * same menu item make its recipe).
 *
 *   ingredients.csv  name, unit, cost, cost_per, pack, pack_size, pack_unit,
 *                    reorder_point, par_level, level_unit, category, storage_area
 *   recipes.csv      menu_item, pos_item_id, kind, category, price,
 *                    ingredient, amount, unit
 *
 * Headers are matched without regard to case, spaces or a few common
 * synonyms. Numbers may use a decimal comma. Every problem names the file
 * and the line, counting the header as line 1.
 */

export const MAX_SETUP_ROWS = 2_000;

export type SheetName = "ingredients" | "recipes";

export type SheetIssue = {
  sheet: SheetName;
  /** The line in the file (header = 1); null for a problem with the whole file. */
  line: number | null;
  message: string;
  /** A note that does not stop the import (an ignored column, a missing cost). */
  warning?: boolean;
};

/** True when the issues stop the import. */
export const hasErrors = (issues: SheetIssue[]) => issues.some((issue) => !issue.warning);

export type SheetPack = { label: string; amount: string; unit: string; line: number };

export type SheetIngredient = {
  name: string;
  baseUnit: BaseUnit;
  /** Euros per `costUnit`, as a decimal string. "0" when the file gives none. */
  costAmount: string;
  costUnit: string;
  reorderPoint: string | null;
  parLevel: string | null;
  levelUnit: string;
  category: string | null;
  storageArea: string | null;
  packs: SheetPack[];
  line: number;
};

export type SheetRecipeLine = { ingredientName: string; amount: string; unit: string; line: number };

export type SheetMenuItem = {
  posName: string;
  posItemId: string | null;
  kind: "item" | "modifier";
  category: string | null;
  price: string | null;
  /** Empty: the file names the item but gives it no recipe. */
  lines: SheetRecipeLine[];
  line: number;
};

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

const normalise = (header: string) =>
  header
    .trim()
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const INGREDIENT_COLUMNS = {
  name: ["name", "ingredient", "ingredient_name"],
  unit: ["unit", "base_unit"],
  cost: ["cost", "price", "cost_eur"],
  cost_per: ["cost_per", "price_per", "per"],
  pack: ["pack", "pack_label", "pack_name"],
  pack_size: ["pack_size", "pack_amount"],
  pack_unit: ["pack_unit"],
  reorder_point: ["reorder_point", "reorder_at", "min_stock", "minimum"],
  par_level: ["par_level", "par"],
  level_unit: ["level_unit", "reorder_unit"],
  category: ["category"],
  storage_area: ["storage_area", "storage", "area", "location"],
} as const;

const RECIPE_COLUMNS = {
  menu_item: ["menu_item", "item", "item_name", "product", "dish", "pos_name"],
  pos_item_id: ["pos_item_id", "item_id", "pos_id", "plu", "sku"],
  kind: ["kind", "type"],
  category: ["category", "menu_category"],
  price: ["price", "sale_price"],
  ingredient: ["ingredient", "ingredient_name"],
  amount: ["amount", "quantity", "qty"],
  unit: ["unit"],
} as const;

type ColumnSpec = Record<string, readonly string[]>;

/** Maps each known column to the file's header that holds it. */
function findColumns<Spec extends ColumnSpec>(
  csv: ParsedCsv,
  spec: Spec,
  sheet: SheetName,
  required: (keyof Spec)[],
): { columns: Partial<Record<keyof Spec, string>>; issues: SheetIssue[] } {
  const columns: Partial<Record<keyof Spec, string>> = {};
  const used = new Set<string>();
  for (const key of Object.keys(spec) as (keyof Spec)[]) {
    const header = csv.headers.find((candidate) => !used.has(candidate) && spec[key].includes(normalise(candidate)));
    if (header) {
      columns[key] = header;
      used.add(header);
    }
  }
  const issues: SheetIssue[] = [];
  const missing = required.filter((key) => !columns[key]);
  if (missing.length > 0) {
    issues.push({
      sheet,
      line: null,
      message: `The file needs the column${missing.length > 1 ? "s" : ""} ${missing.map((key) => `"${String(key)}"`).join(", ")}. Start from the template.`,
    });
  }
  const unknown = csv.headers.filter((header) => !used.has(header));
  if (unknown.length > 0 && missing.length === 0) {
    issues.push({ sheet, line: null, warning: true, message: `Ignored column${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}.` });
  }
  if (csv.rows.length > MAX_SETUP_ROWS) {
    issues.push({ sheet, line: null, message: `The file has more than ${MAX_SETUP_ROWS.toLocaleString("en")} rows. Split it in two.` });
  }
  return { columns, issues };
}

// ---------------------------------------------------------------------------
// Units and numbers
// ---------------------------------------------------------------------------

const BASE_UNIT_ALIASES: Record<string, BaseUnit> = {
  g: "g",
  gr: "g",
  gram: "g",
  grams: "g",
  kg: "g",
  kilo: "g",
  ml: "ml",
  cl: "ml",
  l: "ml",
  lt: "ml",
  ltr: "ml",
  litre: "ml",
  liter: "ml",
  unit: "unit",
  units: "unit",
  pc: "unit",
  pcs: "unit",
  piece: "unit",
  pieces: "unit",
  each: "unit",
  ea: "unit",
  x: "unit",
};

const DISPLAY_UNIT_ALIASES: Record<string, string> = {
  gr: "g",
  gram: "g",
  grams: "g",
  kilo: "kg",
  lt: "l",
  ltr: "l",
  litre: "l",
  liter: "l",
  units: "unit",
  pc: "unit",
  pcs: "unit",
  piece: "unit",
  pieces: "unit",
  each: "unit",
  ea: "unit",
  x: "unit",
};

/** "kg", "Litre", "pcs" -> the base unit of the ingredient (g, ml, unit), or null. */
export function readBaseUnit(text: string): BaseUnit | null {
  return BASE_UNIT_ALIASES[text.trim().toLowerCase()] ?? null;
}

/** "Kg", "litre", "pcs" -> a display unit (kg, l, unit), or null when it is not one. */
export function readDisplayUnit(text: string): string | null {
  const lower = text.trim().toLowerCase();
  const unit = DISPLAY_UNIT_ALIASES[lower] ?? lower;
  return Object.values(DISPLAY_UNITS).some((units) => units.some((entry) => entry.unit === unit)) ? unit : null;
}

/** The unit costs and levels are read in when the file does not say: kg, l, unit. */
export function largerUnit(baseUnit: BaseUnit): string {
  return DISPLAY_UNITS[baseUnit][DISPLAY_UNITS[baseUnit].length - 1].unit;
}

export function fitsBaseUnit(baseUnit: BaseUnit, displayUnit: string): boolean {
  return DISPLAY_UNITS[baseUnit].some((entry) => entry.unit === displayUnit);
}

/** A number as typed ("1,5", "€ 8.00"), kept as a string; null when it is not a number. */
function readNumber(text: string): string | null {
  const parsed = parseQuantityInput(text.replace(/[€\s]/g, ""));
  return parsed ? parsed.toString() : null;
}

const cell = (row: Record<string, string>, header: string | undefined) => (header ? (row[header] ?? "").trim() : "");

// ---------------------------------------------------------------------------
// ingredients.csv
// ---------------------------------------------------------------------------

export function readIngredientSheet(csv: ParsedCsv): { ingredients: SheetIngredient[]; issues: SheetIssue[] } {
  const sheet: SheetName = "ingredients";
  const { columns, issues } = findColumns(csv, INGREDIENT_COLUMNS, sheet, ["name", "unit"]);
  if (hasErrors(issues)) return { ingredients: [], issues };

  const byName = new Map<string, SheetIngredient>();
  const problem = (line: number, message: string) => issues.push({ sheet, line, message });

  csv.rows.forEach((row, index) => {
    const line = index + 2;
    const value = (key: keyof typeof INGREDIENT_COLUMNS) => cell(row, columns[key]);
    const name = value("name");
    if (name === "") {
      if (Object.values(row).some((text) => text.trim() !== "")) problem(line, "The name is empty.");
      return;
    }
    if (name.length > 80) return problem(line, `"${name.slice(0, 30)}…" is longer than 80 characters.`);

    const pack = readPack(value("pack"), value("pack_size"), value("pack_unit"));
    if ("error" in pack) return problem(line, `${name}: ${pack.error}`);
    const key = name.toLowerCase();
    const earlier = byName.get(key);

    if (earlier) {
      // A further row of the same ingredient may only add a pack size.
      const extra = (["unit", "cost", "cost_per", "reorder_point", "par_level", "level_unit", "category", "storage_area"] as const).filter(
        (column) => value(column) !== "",
      );
      const differs = extra.filter((column) => !sameAsEarlier(earlier, column, value(column)));
      if (differs.length > 0) {
        return problem(line, `${name} is already on line ${earlier.line} with other details (${differs.join(", ")}). Use one line per ingredient; further lines may only add a pack.`);
      }
      if (!pack.value) return problem(line, `${name} is already on line ${earlier.line}.`);
      return addPack(earlier, { ...pack.value, line }, problem);
    }

    const baseUnit = readBaseUnit(value("unit"));
    if (!baseUnit) return problem(line, `${name}: the unit "${value("unit")}" is not one of g, ml or unit (kg, l and pcs work too).`);

    const costUnit = value("cost_per") === "" ? largerUnit(baseUnit) : readDisplayUnit(value("cost_per"));
    if (!costUnit || !fitsBaseUnit(baseUnit, costUnit)) {
      return problem(line, `${name}: "cost_per" must be ${DISPLAY_UNITS[baseUnit].map((entry) => entry.unit).join(", ")}.`);
    }
    const costAmount = value("cost") === "" ? "0" : readNumber(value("cost"));
    if (costAmount === null || costAmount.startsWith("-")) return problem(line, `${name}: the cost "${value("cost")}" is not a number of euros.`);
    if (value("cost") === "") {
      issues.push({ sheet, line, warning: true, message: `${name} has no cost: its euro figures stay at €0 until you add one.` });
    }

    const levelUnit = value("level_unit") === "" ? largerUnit(baseUnit) : readDisplayUnit(value("level_unit"));
    if (!levelUnit || !fitsBaseUnit(baseUnit, levelUnit)) {
      return problem(line, `${name}: "level_unit" must be ${DISPLAY_UNITS[baseUnit].map((entry) => entry.unit).join(", ")}.`);
    }
    const level = (column: "reorder_point" | "par_level") => {
      if (value(column) === "") return { value: null };
      const number = readNumber(value(column));
      return number === null || number.startsWith("-") ? { error: `${name}: "${column}" must be a number of ${levelUnit}.` } : { value: number };
    };
    const reorderPoint = level("reorder_point");
    if ("error" in reorderPoint) return problem(line, reorderPoint.error!);
    const parLevel = level("par_level");
    if ("error" in parLevel) return problem(line, parLevel.error!);

    const text = (column: "category" | "storage_area") => {
      const raw = value(column);
      return raw === "" ? null : raw.slice(0, 60);
    };

    const ingredient: SheetIngredient = {
      name,
      baseUnit,
      costAmount,
      costUnit,
      reorderPoint: reorderPoint.value,
      parLevel: parLevel.value,
      levelUnit,
      category: text("category"),
      storageArea: text("storage_area"),
      packs: [],
      line,
    };
    byName.set(key, ingredient);
    if (pack.value) addPack(ingredient, { ...pack.value, line }, problem);
  });

  return { ingredients: [...byName.values()], issues };
}

function readPack(label: string, size: string, unit: string): { value: Omit<SheetPack, "line"> | null } | { error: string } {
  if (label === "" && size === "" && unit === "") return { value: null };
  if (label === "") return { error: 'a pack needs a name in "pack", for example Bag 1 kg.' };
  if (label.length > 60) return { error: "the pack name is longer than 60 characters." };
  const amount = readNumber(size);
  if (amount === null || !toDecimal(amount).gt(0)) return { error: `"pack_size" must be a number above 0 for the pack "${label}".` };
  const displayUnit = unit === "" ? null : readDisplayUnit(unit);
  if (unit !== "" && !displayUnit) return { error: `"pack_unit" "${unit}" is not a unit (g, kg, ml, cl, l, unit).` };
  return { value: { label, amount, unit: displayUnit ?? "" } };
}

function addPack(ingredient: SheetIngredient, pack: SheetPack, problem: (line: number, message: string) => void) {
  const unit = pack.unit === "" ? largerUnit(ingredient.baseUnit) : pack.unit;
  if (!fitsBaseUnit(ingredient.baseUnit, unit)) {
    return problem(pack.line, `${ingredient.name}: the pack "${pack.label}" is in ${unit}, but the ingredient is counted in ${ingredient.baseUnit}.`);
  }
  if (ingredient.packs.some((existing) => existing.label.toLowerCase() === pack.label.toLowerCase())) {
    return problem(pack.line, `${ingredient.name}: the pack "${pack.label}" is listed twice.`);
  }
  ingredient.packs.push({ ...pack, unit });
}

function sameAsEarlier(earlier: SheetIngredient, column: string, text: string): boolean {
  switch (column) {
    case "unit":
      return readBaseUnit(text) === earlier.baseUnit;
    case "cost":
      return readNumber(text) === earlier.costAmount;
    case "cost_per":
      return readDisplayUnit(text) === earlier.costUnit;
    case "reorder_point":
      return readNumber(text) === earlier.reorderPoint;
    case "par_level":
      return readNumber(text) === earlier.parLevel;
    case "level_unit":
      return readDisplayUnit(text) === earlier.levelUnit;
    case "category":
      return text === earlier.category;
    case "storage_area":
      return text === earlier.storageArea;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// recipes.csv
// ---------------------------------------------------------------------------

const KIND_ALIASES: Record<string, "item" | "modifier"> = {
  item: "item",
  dish: "item",
  product: "item",
  modifier: "modifier",
  mod: "modifier",
  extra: "modifier",
  "add-on": "modifier",
  addon: "modifier",
};

/** The key a menu item is grouped and matched by: its POS id when it has one, else its name. */
export const menuItemKey = (item: { posItemId: string | null; posName: string }) =>
  item.posItemId ? `id:${item.posItemId}` : `name:${item.posName.trim().toLowerCase()}`;

export function readRecipeSheet(csv: ParsedCsv): { items: SheetMenuItem[]; issues: SheetIssue[] } {
  const sheet: SheetName = "recipes";
  const { columns, issues } = findColumns(csv, RECIPE_COLUMNS, sheet, ["menu_item"]);
  if (hasErrors(issues)) return { items: [], issues };
  if (!columns.ingredient || !columns.amount || !columns.unit) {
    issues.push({ sheet, line: null, warning: true, message: 'Without the columns "ingredient", "amount" and "unit" the file only adds menu items, not recipes.' });
  }

  const byKey = new Map<string, SheetMenuItem>();
  const problem = (line: number, message: string) => issues.push({ sheet, line, message });

  csv.rows.forEach((row, index) => {
    const line = index + 2;
    const value = (key: keyof typeof RECIPE_COLUMNS) => cell(row, columns[key]);
    const posName = value("menu_item");
    if (posName === "") {
      if (Object.values(row).some((text) => text.trim() !== "")) problem(line, "The menu item is empty.");
      return;
    }
    if (posName.length > 120) return problem(line, `"${posName.slice(0, 30)}…" is longer than 120 characters.`);
    const posItemId = value("pos_item_id") === "" ? null : value("pos_item_id").slice(0, 60);

    const kindText = value("kind").toLowerCase();
    const kind = kindText === "" ? null : KIND_ALIASES[kindText];
    if (kind === undefined) return problem(line, `${posName}: "kind" must be item or modifier.`);
    const price = value("price") === "" ? null : readNumber(value("price"));
    if (value("price") !== "" && (price === null || price.startsWith("-"))) return problem(line, `${posName}: the price "${value("price")}" is not a number.`);
    const category = value("category") === "" ? null : value("category").slice(0, 60);

    const key = menuItemKey({ posItemId, posName });
    let item = byKey.get(key);
    if (!item) {
      item = { posName, posItemId, kind: kind ?? "item", category, price, lines: [], line };
      byKey.set(key, item);
    } else {
      const clashes = [
        kind !== null && kind !== item.kind ? "kind" : null,
        category !== null && item.category !== null && category !== item.category ? "category" : null,
        price !== null && item.price !== null && price !== item.price ? "price" : null,
      ].filter(Boolean);
      if (clashes.length > 0) {
        return problem(line, `${posName}: ${clashes.join(" and ")} ${clashes.length === 1 ? "differs" : "differ"} from line ${item.line}.`);
      }
      item.category ??= category;
      item.price ??= price;
    }

    const ingredientName = value("ingredient");
    const amountText = value("amount");
    const unitText = value("unit");
    if (ingredientName === "" && amountText === "" && unitText === "") return;
    if (ingredientName === "") return problem(line, `${posName}: the ingredient is empty.`);
    const amount = readNumber(amountText);
    if (amount === null || !toDecimal(amount).gt(0)) {
      return problem(line, `${posName}: the amount of ${ingredientName} must be a number above 0.`);
    }
    const unit = readDisplayUnit(unitText);
    if (!unit) return problem(line, `${posName}: the unit "${unitText}" for ${ingredientName} is not one of g, kg, ml, cl, l, unit.`);
    if (item.lines.some((existing) => existing.ingredientName.toLowerCase() === ingredientName.toLowerCase())) {
      return problem(line, `${posName}: ${ingredientName} is listed twice. Put the total on one line.`);
    }
    item.lines.push({ ingredientName, amount, unit, line });
  });

  return { items: [...byKey.values()], issues };
}
