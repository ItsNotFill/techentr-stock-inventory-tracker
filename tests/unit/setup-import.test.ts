import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/imports/csv";
import { hasErrors, readBaseUnit, readDisplayUnit, readIngredientSheet, readRecipeSheet } from "@/lib/setup-import/parse";

const ingredients = (text: string) => readIngredientSheet(parseCsv(text));
const recipes = (text: string) => readRecipeSheet(parseCsv(text));
const errors = (issues: { message: string; warning?: boolean; line: number | null }[]) =>
  issues.filter((issue) => !issue.warning).map((issue) => `${issue.line}: ${issue.message}`);

describe("setup import: units", () => {
  it("reads base units and display units people write", () => {
    expect(["g", "kg", "Gram", "ml", "L", "litre", "pcs", "each", "unit"].map(readBaseUnit)).toEqual([
      "g",
      "g",
      "g",
      "ml",
      "ml",
      "ml",
      "unit",
      "unit",
      "unit",
    ]);
    expect(readBaseUnit("box")).toBeNull();
    expect(["KG", "cl", "Liter", "pcs"].map(readDisplayUnit)).toEqual(["kg", "cl", "l", "unit"]);
    expect(readDisplayUnit("dozen")).toBeNull();
  });
});

describe("setup import: ingredients.csv", () => {
  it("reads the template's columns, with defaults for what is left out", () => {
    const { ingredients: rows, issues } = ingredients(
      [
        "name,unit,cost,cost_per,pack,pack_size,pack_unit,reorder_point,par_level,level_unit,category,storage_area",
        "Mozzarella,g,8,kg,Bag 1 kg,1,kg,2,8,kg,Dairy,Walk-in fridge",
        "Mozzarella,,,,Case 10×1 kg,10,kg,,,,,",
        "Olive oil,l,\"9,50\",,Tin 5 l,5,,,,,Oils,Dry store",
        "Pizza box,pcs,0.35,,,,,100,,,Packaging,",
      ].join("\n"),
    );
    expect(errors(issues)).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      name: "Mozzarella",
      baseUnit: "g",
      costAmount: "8",
      costUnit: "kg",
      reorderPoint: "2",
      parLevel: "8",
      levelUnit: "kg",
      category: "Dairy",
      storageArea: "Walk-in fridge",
      packs: [
        { label: "Bag 1 kg", amount: "1", unit: "kg", line: 2 },
        { label: "Case 10×1 kg", amount: "10", unit: "kg", line: 3 },
      ],
    });
    // Decimal comma; cost per and pack unit default to the larger unit (l).
    expect(rows[1]).toMatchObject({ baseUnit: "ml", costAmount: "9.5", costUnit: "l", packs: [{ label: "Tin 5 l", amount: "5", unit: "l" }] });
    expect(rows[2]).toMatchObject({ baseUnit: "unit", costAmount: "0.35", costUnit: "unit", reorderPoint: "100", levelUnit: "unit", packs: [] });
  });

  it("accepts other header spellings, a semicolon file and a byte order mark", () => {
    const { ingredients: rows, issues } = ingredients("﻿Ingredient name;Base unit;Cost (EUR);Storage area;Notes\nBasil;g;25;Walk-in fridge;fresh");
    expect(errors(issues)).toEqual([]);
    expect(issues.map((issue) => issue.message)).toEqual(["Ignored column: Notes."]);
    expect(rows[0]).toMatchObject({ name: "Basil", baseUnit: "g", costAmount: "25", costUnit: "kg", storageArea: "Walk-in fridge" });
  });

  it("warns about a missing cost but still reads the ingredient", () => {
    const { ingredients: rows, issues } = ingredients("name,unit\nSalt,g");
    expect(hasErrors(issues)).toBe(false);
    expect(issues[0]).toMatchObject({ line: 2, warning: true });
    expect(rows[0].costAmount).toBe("0");
  });

  it("names the line and the problem", () => {
    const { issues } = ingredients(
      [
        "name,unit,cost,cost_per,pack,pack_size,pack_unit",
        "Flour,box,1,,,,", // unknown unit
        "Wine,l,8,kg,,,", // cost per a unit of another kind
        "Cream,ml,abc,,,,", // cost not a number
        "Sugar,g,1,,Bag,,kg", // pack without size
        "Rice,g,2,,Bag 1 kg,1,l", // pack in another kind of unit
        "Rice,ml,,,,,", // second line with other details
        "Rice,,,,Bag 1 kg,1,kg", // the same pack twice
        ",,,,,,x", // no name
      ].join("\n"),
    );
    expect(errors(issues)).toEqual([
      '2: Flour: the unit "box" is not one of g, ml or unit (kg, l and pcs work too).',
      '3: Wine: "cost_per" must be ml, cl, l.',
      '4: Cream: the cost "abc" is not a number of euros.',
      '5: Sugar: "pack_size" must be a number above 0 for the pack "Bag".',
      "6: Rice: the pack \"Bag 1 kg\" is in l, but the ingredient is counted in g.",
      "7: Rice is already on line 6 with other details (unit). Use one line per ingredient; further lines may only add a pack.",
      "9: The name is empty.",
    ]);
  });

  it("needs the name and unit columns", () => {
    const { ingredients: rows, issues } = ingredients("ingredient,price\nBasil,25");
    expect(rows).toEqual([]);
    expect(errors(issues)).toEqual(['null: The file needs the column "unit". Start from the template.']);
  });
});

describe("setup import: recipes.csv", () => {
  it("groups lines into menu items, by POS id when there is one", () => {
    const { items, issues } = recipes(
      [
        "menu_item,pos_item_id,kind,category,price,ingredient,amount,unit",
        "Margherita,,item,Pizza,9.50,Mozzarella,120,g",
        "Margherita,,,,,Tomato passata,80,g",
        "margherita,,,,,Basil,2,g",
        "Coca-Cola 33cl,COKE33,,Drinks,3.00,Cola 33 cl can,1,pcs",
        "Extra mozzarella,,modifier,Extras,1.50,Mozzarella,0.05,kg",
        "Service charge,,,Other,,,,",
      ].join("\n"),
    );
    expect(errors(issues)).toEqual([]);
    expect(items.map((item) => [item.posName, item.posItemId, item.kind, item.lines.length])).toEqual([
      ["Margherita", null, "item", 3],
      ["Coca-Cola 33cl", "COKE33", "item", 1],
      ["Extra mozzarella", null, "modifier", 1],
      ["Service charge", null, "item", 0],
    ]);
    expect(items[0]).toMatchObject({ category: "Pizza", price: "9.5" });
    expect(items[1].lines[0]).toMatchObject({ ingredientName: "Cola 33 cl can", amount: "1", unit: "unit" });
    expect(items[2].lines[0]).toMatchObject({ amount: "0.05", unit: "kg" });
  });

  it("names the line and the problem", () => {
    const { issues } = recipes(
      [
        "menu_item,kind,price,ingredient,amount,unit",
        "Diavola,dish,11.50,Mozzarella,100,g",
        "Diavola,modifier,,Salami,50,g", // kind differs
        "Calzone,,abc,,,", // price not a number
        "Calzone,,,Ricotta,0,g", // zero amount
        "Calzone,,,Ricotta,1,spoon", // unknown unit
        "Calzone,,,,5,g", // amount without ingredient
        "Calzone,,,Ham,50,g",
        "Calzone,,,ham,10,g", // the same ingredient twice
        "Calzone,side,,,,", // unknown kind
      ].join("\n"),
    );
    expect(errors(issues)).toEqual([
      "3: Diavola: kind differs from line 2.",
      '4: Calzone: the price "abc" is not a number.',
      "5: Calzone: the amount of Ricotta must be a number above 0.",
      '6: Calzone: the unit "spoon" for Ricotta is not one of g, kg, ml, cl, l, unit.',
      "7: Calzone: the ingredient is empty.",
      "9: Calzone: ham is listed twice. Put the total on one line.",
      '10: Calzone: "kind" must be item or modifier.',
    ]);
  });

  it("can add menu items without recipes, with a note", () => {
    const { items, issues } = recipes("menu_item,category\nTiramisu,Dessert");
    expect(hasErrors(issues)).toBe(false);
    expect(issues.map((issue) => issue.message)).toEqual([
      'Without the columns "ingredient", "amount" and "unit" the file only adds menu items, not recipes.',
    ]);
    expect(items).toEqual([expect.objectContaining({ posName: "Tiramisu", category: "Dessert", lines: [] })]);
  });
});

describe("setup import: the downloadable templates", () => {
  it("read without errors, and every recipe ingredient is in the ingredients template", async () => {
    const { readFileSync } = await import("node:fs");
    const ingredientSheet = ingredients(readFileSync("public/templates/ingredients.csv", "utf8"));
    const recipeSheet = recipes(readFileSync("public/templates/recipes.csv", "utf8"));
    expect(errors(ingredientSheet.issues)).toEqual([]);
    expect(errors(recipeSheet.issues)).toEqual([]);
    const names = new Set(ingredientSheet.ingredients.map((item) => item.name.toLowerCase()));
    for (const item of recipeSheet.items) {
      for (const line of item.lines) expect(names.has(line.ingredientName.toLowerCase()), line.ingredientName).toBe(true);
    }
    expect(ingredientSheet.ingredients.find((item) => item.name === "Mozzarella")?.packs).toHaveLength(2);
  });
});
