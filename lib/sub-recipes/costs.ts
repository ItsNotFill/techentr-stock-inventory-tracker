import Decimal from "decimal.js";
import { eq } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { ingredients } from "@/lib/db/schema";
import { toDbUnitCost } from "@/lib/units";
import { costPerUnit, PrepRecipeError, type Composition, type PrepGraph } from "./compose";
import { loadPrepGraph } from "./graph";

/** Today's cost in euros per base unit of each prep recipe asked for (six decimals, like ingredient costs). */
export async function prepCostsPerUnit(tx: Tx, locationId: string, ids: string[], graph?: PrepGraph): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const prepGraph = graph ?? (await loadPrepGraph(tx, locationId));
  const costs = await tx
    .select({ id: ingredients.id, cost: ingredients.costPerBaseUnit })
    .from(ingredients)
    .where(eq(ingredients.locationId, locationId));
  const ingredientCosts = new Map(costs.map((row) => [row.id, row.cost]));
  const memo = new Map<string, Composition>();
  const result = new Map<string, string>();
  for (const id of new Set(ids)) {
    let cost: Decimal;
    try {
      cost = costPerUnit(prepGraph, id, ingredientCosts, memo);
    } catch (error) {
      // A broken prep recipe has no cost rather than breaking the screen that shows it.
      if (error instanceof PrepRecipeError) continue;
      throw error;
    }
    result.set(id, toDbUnitCost(cost));
  }
  return result;
}
