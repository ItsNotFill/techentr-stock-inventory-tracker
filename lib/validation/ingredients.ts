import { z } from "zod";
import { DISPLAY_UNITS } from "@/lib/units";
import { decimalInput, optionalDecimalInput, optionalText } from "./quantity";

export const BASE_UNITS = ["g", "ml", "unit"] as const;

const displayUnit = z.string().min(1);

function unitFitsBaseUnit(baseUnit: (typeof BASE_UNITS)[number], unit: string): boolean {
  return DISPLAY_UNITS[baseUnit].some((entry) => entry.unit === unit);
}

/**
 * The ingredient form. Amounts are typed in a readable unit (per kg, per l)
 * and converted to base units on the server with lib/units:
 *   costAmount   price in euros for one `costUnit`      (8 per kg)
 *   reorderPoint / parLevel   in `levelUnit`            (2 kg)
 */
export const ingredientFormSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name.").max(80, "Use at most 80 characters."),
    baseUnit: z.enum(BASE_UNITS, "Choose a unit."),
    costAmount: decimalInput({ min: "0", label: "The cost" }),
    costUnit: displayUnit,
    reorderPoint: optionalDecimalInput({ min: "0" }),
    parLevel: optionalDecimalInput({ min: "0" }),
    levelUnit: displayUnit,
    category: optionalText(60),
    storageArea: optionalText(60),
    /**
     * Who it is ordered from (stage 7). "" clears it; left out (undefined), an
     * update keeps what is there, so callers that do not know suppliers change nothing.
     */
    supplierId: z
      .union([z.literal(""), z.uuid("Choose a supplier.")])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === "" ? null : value)),
  })
  .superRefine((value, context) => {
    if (!unitFitsBaseUnit(value.baseUnit, value.costUnit)) {
      context.addIssue({ code: "custom", path: ["costUnit"], message: "This unit does not match the ingredient's unit." });
    }
    if (!unitFitsBaseUnit(value.baseUnit, value.levelUnit)) {
      context.addIssue({ code: "custom", path: ["levelUnit"], message: "This unit does not match the ingredient's unit." });
    }
  });

export type IngredientFormValues = z.infer<typeof ingredientFormSchema>;

/**
 * A pack size: "Case 12x1 L" holding `amount` of `unit` (12 l), stored as
 * base units (12,000 ml).
 */
export const packSizeFormSchema = z.object({
  label: z.string().trim().min(1, "Enter a label, for example Case 12x1 L.").max(60, "Use at most 60 characters."),
  amount: decimalInput({ min: "0", minExclusive: true, label: "The amount" }),
  unit: displayUnit,
  isDefault: z.boolean(),
});

export type PackSizeFormValues = z.infer<typeof packSizeFormSchema>;

export const idSchema = z.uuid();
