import { asc, eq } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { subRecipeLines, subRecipes } from "@/lib/db/schema";
import type { PrepGraph } from "./compose";

/** Every prep recipe of the location (archived ones too: existing recipes may still use them), with its lines. */
export async function loadPrepGraph(tx: Tx, locationId: string): Promise<PrepGraph> {
  const recipes = await tx
    .select({ id: subRecipes.id, name: subRecipes.name, yieldQty: subRecipes.yieldQty })
    .from(subRecipes)
    .where(eq(subRecipes.locationId, locationId));
  const graph: PrepGraph = new Map(recipes.map((recipe) => [recipe.id, { ...recipe, lines: [] }]));
  if (recipes.length === 0) return graph;
  const lines = await tx
    .select({
      subRecipeId: subRecipeLines.subRecipeId,
      ingredientId: subRecipeLines.ingredientId,
      childId: subRecipeLines.childSubRecipeId,
      qty: subRecipeLines.qtyBaseUnit,
    })
    .from(subRecipeLines)
    .where(eq(subRecipeLines.locationId, locationId))
    .orderBy(asc(subRecipeLines.createdAt), asc(subRecipeLines.id));
  for (const line of lines) graph.get(line.subRecipeId)?.lines.push({ ingredientId: line.ingredientId, childId: line.childId, qty: line.qty });
  return graph;
}
