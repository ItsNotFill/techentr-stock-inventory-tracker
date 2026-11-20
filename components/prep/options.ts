import { withUser } from "@/lib/db/client";
import { listIngredients } from "@/lib/ingredients";
import { listPrepOptions } from "@/lib/sub-recipes";
import type { PrepOption } from "./prep-recipe-form";

/**
 * Everything a prep recipe line can pick, with today's costs: active
 * ingredients, and active prep recipes except the one being edited (it cannot
 * contain itself). Server only.
 */
export async function loadPrepPickerOptions(locationId: string, excludeId: string | null): Promise<PrepOption[]> {
  const { ingredients, preps } = await withUser(async (tx) => ({
    ingredients: await listIngredients(tx, locationId),
    preps: await listPrepOptions(tx, locationId),
  }));
  return [
    ...ingredients.map((ingredient): PrepOption => ({
      value: `i:${ingredient.id}`,
      kind: "ingredient",
      name: ingredient.name,
      baseUnit: ingredient.baseUnit,
      costPerBaseUnit: ingredient.costPerBaseUnit,
    })),
    ...preps
      .filter((prep) => prep.id !== excludeId)
      .map((prep): PrepOption => ({
        value: `p:${prep.id}`,
        kind: "prep",
        name: prep.name,
        baseUnit: prep.baseUnit,
        costPerBaseUnit: prep.costPerUnit,
      })),
  ];
}
