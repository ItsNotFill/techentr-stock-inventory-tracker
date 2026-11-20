import { describe, expect, it } from "vitest";
import { composition, costPerUnit, createsCycle, depthWith, MAX_DEPTH, PrepRecipeError, type PrepGraph } from "@/lib/sub-recipes/compose";

// Ingredient ids, readable.
const FLOUR = "flour";
const WATER = "water";
const SALT = "salt";
const TOMATOES = "tomatoes";
const OIL = "oil";
const GARLIC = "garlic";

/** The pizzeria's prep: dough (10 kg), garlic oil (1 l), and tomato sauce (5 l) that uses the garlic oil. */
function pizzeriaPreps(): PrepGraph {
  return new Map([
    [
      "dough",
      {
        id: "dough",
        name: "Pizza dough",
        yieldQty: "10000",
        lines: [
          { ingredientId: FLOUR, childId: null, qty: "6000" },
          { ingredientId: WATER, childId: null, qty: "3900" },
          { ingredientId: SALT, childId: null, qty: "100" },
        ],
      },
    ],
    [
      "garlic-oil",
      {
        id: "garlic-oil",
        name: "Garlic oil",
        yieldQty: "1000",
        lines: [
          { ingredientId: OIL, childId: null, qty: "900" },
          { ingredientId: GARLIC, childId: null, qty: "100" },
        ],
      },
    ],
    [
      "sauce",
      {
        id: "sauce",
        name: "Tomato sauce",
        yieldQty: "5000",
        lines: [
          { ingredientId: TOMATOES, childId: null, qty: "4000" },
          { ingredientId: null, childId: "garlic-oil", qty: "200" },
        ],
      },
    ],
  ]);
}

const asStrings = (map: Map<string, { toFixed: () => string }>) => Object.fromEntries([...map].map(([id, qty]) => [id, qty.toFixed()]));

describe("prep recipes: composition", () => {
  it("splits one unit of dough into its ingredients", () => {
    expect(asStrings(composition(pizzeriaPreps(), "dough"))).toEqual({ flour: "0.6", water: "0.39", salt: "0.01" });
  });

  it("goes through a prep recipe inside another one", () => {
    // 1 ml sauce = 0.8 g tomatoes + 0.04 ml garlic oil = 0.036 ml oil + 0.004 g garlic.
    expect(asStrings(composition(pizzeriaPreps(), "sauce"))).toEqual({ tomatoes: "0.8", oil: "0.036", garlic: "0.004" });
  });

  it("adds up an ingredient that comes in twice", () => {
    const graph = pizzeriaPreps();
    graph.get("sauce")!.lines.push({ ingredientId: OIL, childId: null, qty: "50" });
    // 0.036 through the garlic oil + 50 / 5000 directly.
    expect(composition(graph, "sauce").get(OIL)?.toFixed()).toBe("0.046");
  });

  it("refuses a cycle, a recipe that makes nothing, and one that is gone", () => {
    const graph = pizzeriaPreps();
    graph.get("garlic-oil")!.lines.push({ ingredientId: null, childId: "sauce", qty: "1" });
    expect(() => composition(graph, "sauce")).toThrow(PrepRecipeError);
    expect(() => composition(new Map([["x", { id: "x", name: "X", yieldQty: "0", lines: [] }]]), "x")).toThrow("makes nothing");
    expect(() => composition(pizzeriaPreps(), "nope")).toThrow("no longer exists");
  });
});

describe("prep recipes: rules for saving", () => {
  it("spots a cycle before it is saved", () => {
    const graph = pizzeriaPreps();
    // Putting the sauce into the garlic oil: the sauce already uses the garlic oil.
    expect(createsCycle(graph, "garlic-oil", ["sauce"])).toBe(true);
    expect(createsCycle(graph, "dough", ["garlic-oil"])).toBe(false);
  });

  it("measures how deep prep recipes would be nested", () => {
    const graph = pizzeriaPreps();
    expect(depthWith(graph, [])).toBe(1);
    expect(depthWith(graph, ["garlic-oil"])).toBe(2);
    expect(depthWith(graph, ["sauce"])).toBe(3);
    // A chain longer than the limit.
    const chain: PrepGraph = new Map();
    for (let level = 0; level <= MAX_DEPTH; level += 1) {
      chain.set(`p${level}`, { id: `p${level}`, name: `P${level}`, yieldQty: "1", lines: level === 0 ? [] : [{ ingredientId: null, childId: `p${level - 1}`, qty: "1" }] });
    }
    expect(depthWith(chain, [`p${MAX_DEPTH}`])).toBeGreaterThan(MAX_DEPTH);
  });
});

describe("prep recipes: cost", () => {
  it("costs one unit from its ingredients", () => {
    const costs = new Map([
      [FLOUR, "0.0011"],
      [WATER, "0"],
      [SALT, "0.0005"],
      [TOMATOES, "0.002"],
      [OIL, "0.009"],
      [GARLIC, "0.006"],
    ]);
    // Dough: 0.6 x 0.0011 + 0.01 x 0.0005 = 0.000665 per g.
    expect(costPerUnit(pizzeriaPreps(), "dough", costs).toFixed()).toBe("0.000665");
    // Sauce: 0.8 x 0.002 + 0.036 x 0.009 + 0.004 x 0.006 = 0.001948 per ml.
    expect(costPerUnit(pizzeriaPreps(), "sauce", costs).toFixed()).toBe("0.001948");
  });
});
