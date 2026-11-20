import { z } from "zod";
import { DISPLAY_UNITS } from "@/lib/units";
import { BASE_UNITS } from "./ingredients";
import { decimalInput, optionalText } from "./quantity";

/**
 * A prep recipe as typed (DECISIONS.md 96): what it is, the unit it is
 * measured in, and how much one batch makes, in a readable unit ("5" "l").
 */
export const subRecipeFormSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name, for example Tomato sauce.").max(80, "Use at most 80 characters."),
    baseUnit: z.enum(BASE_UNITS, "Choose a unit."),
    yieldAmount: decimalInput({ min: "0", minExclusive: true, label: "How much it makes" }),
    yieldUnit: z.string().min(1, "Choose a unit."),
    category: optionalText(60),
  })
  .superRefine((value, context) => {
    if (!DISPLAY_UNITS[value.baseUnit].some((entry) => entry.unit === value.yieldUnit)) {
      context.addIssue({ code: "custom", path: ["yieldUnit"], message: "This unit does not match the prep recipe's unit." });
    }
  });

export type SubRecipeFormValues = z.infer<typeof subRecipeFormSchema>;

export const MAX_PREP_LINES = 60;

/** One line of a prep recipe: an ingredient or another prep recipe, and how much one batch uses. */
export const prepLineInputSchema = z
  .object({
    ingredientId: z.uuid().nullish().transform((value) => value ?? null),
    subRecipeId: z.uuid().nullish().transform((value) => value ?? null),
    amount: decimalInput({ min: "0", minExclusive: true, label: "The amount" }),
    unit: z.string().min(1, "Choose a unit."),
  })
  .refine((line) => (line.ingredientId === null) !== (line.subRecipeId === null), {
    message: "Choose an ingredient or a prep recipe.",
    path: ["ingredientId"],
  });

export const prepLinesInputSchema = z
  .array(prepLineInputSchema)
  .min(1, "Add at least one ingredient.")
  .max(MAX_PREP_LINES, `A prep recipe can have at most ${MAX_PREP_LINES} lines.`);

export type PrepLineInput = z.infer<typeof prepLineInputSchema>;
