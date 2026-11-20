import { z } from "zod";
import { decimalInput, optionalDecimalInput, optionalText } from "./quantity";

export const MENU_ITEM_KINDS = ["item", "modifier"] as const;

/**
 * A menu item as the POS knows it. `displayName` may be left empty and then
 * equals `posName`. Modifiers ("extra cheese") are items of kind `modifier`.
 */
export const menuItemFormSchema = z.object({
  posName: z.string().trim().min(1, "Enter the name as the POS prints it.").max(120, "Use at most 120 characters."),
  posItemId: optionalText(60),
  displayName: optionalText(120),
  kind: z.enum(MENU_ITEM_KINDS, "Choose item or modifier."),
  category: optionalText(60),
  price: optionalDecimalInput({ min: "0", max: "999999" }),
});

export type MenuItemFormValues = z.infer<typeof menuItemFormSchema>;

/**
 * One recipe line as typed: `amount` of `unit` (120 g, 0.5 unit, 2 cl).
 * The server converts to the ingredient's base unit with lib/units.
 */
export const recipeLineInputSchema = z.object({
  ingredientId: z.uuid("Choose an ingredient."),
  amount: decimalInput({ min: "0", minExclusive: true, label: "The amount" }),
  unit: z.string().min(1, "Choose a unit."),
});

export const MAX_RECIPE_LINES = 60;

export const recipeInputSchema = z
  .array(recipeLineInputSchema)
  .max(MAX_RECIPE_LINES, `A recipe can have at most ${MAX_RECIPE_LINES} lines.`);

export type RecipeLineInput = z.infer<typeof recipeLineInputSchema>;
