import Decimal from "decimal.js";
import { toDecimal } from "@/lib/units";

/**
 * Prep recipes as plain data, without the database (DECISIONS.md 96), so the
 * maths can be tested on its own. Used by depletion and for costs.
 *
 *   Tomato sauce makes 5,000 ml from 4,000 g tomatoes and 100 ml olive oil.
 *   One ml of sauce is 0.8 g tomatoes and 0.02 ml oil.
 */

export type PrepLine = { ingredientId: string | null; childId: string | null; qty: string };
export type PrepRecipe = { id: string; name: string; yieldQty: string; lines: PrepLine[] };
export type PrepGraph = Map<string, PrepRecipe>;

/** How much of each ingredient one base unit of a prep recipe is made of. */
export type Composition = Map<string, Decimal>;

export class PrepRecipeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrepRecipeError";
  }
}

/** The most prep recipes nested in one another (sauce in a filling in a dish). */
export const MAX_DEPTH = 5;

/**
 * The composition of a prep recipe, through any prep recipes it uses. Results
 * are kept in `memo`. Throws when the recipes form a cycle or nest too deep;
 * lib/sub-recipes refuses to save either, so this guards against bad data.
 */
export function composition(graph: PrepGraph, id: string, memo: Map<string, Composition> = new Map(), path: string[] = []): Composition {
  const cached = memo.get(id);
  if (cached) return cached;
  const recipe = graph.get(id);
  if (!recipe) throw new PrepRecipeError("A prep recipe used here no longer exists.");
  if (path.includes(id)) throw new PrepRecipeError(`${recipe.name} contains itself.`);
  if (path.length >= MAX_DEPTH) throw new PrepRecipeError(`Prep recipes are nested more than ${MAX_DEPTH} deep.`);

  const yieldQty = toDecimal(recipe.yieldQty);
  if (!yieldQty.gt(0)) throw new PrepRecipeError(`${recipe.name} makes nothing.`);
  const result: Composition = new Map();
  const add = (ingredientId: string, qty: Decimal) => result.set(ingredientId, (result.get(ingredientId) ?? new Decimal(0)).plus(qty));

  for (const line of recipe.lines) {
    const perUnit = toDecimal(line.qty).dividedBy(yieldQty);
    if (line.ingredientId) add(line.ingredientId, perUnit);
    else if (line.childId) {
      for (const [ingredientId, qty] of composition(graph, line.childId, memo, [...path, id])) add(ingredientId, qty.times(perUnit));
    }
  }
  memo.set(id, result);
  return result;
}

/**
 * Would saving these lines for `id` create a cycle? True when one of the
 * children is `id` or uses it, directly or further down.
 */
export function createsCycle(graph: PrepGraph, id: string, childIds: string[]): boolean {
  const seen = new Set<string>();
  const stack = [...childIds];
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (next === id) return true;
    if (seen.has(next)) continue;
    seen.add(next);
    for (const line of graph.get(next)?.lines ?? []) if (line.childId) stack.push(line.childId);
  }
  return false;
}

/** How deep the nesting under `id` would go with these children (1 = no prep recipe inside). */
export function depthWith(graph: PrepGraph, childIds: string[]): number {
  const depth = (id: string, seen: Set<string>): number => {
    if (seen.has(id)) return Infinity;
    const children = (graph.get(id)?.lines ?? []).flatMap((line) => (line.childId ? [line.childId] : []));
    return 1 + children.reduce((max, child) => Math.max(max, depth(child, new Set([...seen, id]))), 0);
  };
  return 1 + childIds.reduce((max, child) => Math.max(max, depth(child, new Set())), 0);
}

/** Euros per base unit of a prep recipe, from today's ingredient costs (euros per base unit). */
export function costPerUnit(graph: PrepGraph, id: string, ingredientCosts: Map<string, string>, memo?: Map<string, Composition>): Decimal {
  let total = new Decimal(0);
  for (const [ingredientId, qty] of composition(graph, id, memo)) {
    total = total.plus(qty.times(toDecimal(ingredientCosts.get(ingredientId) ?? "0")));
  }
  return total;
}
