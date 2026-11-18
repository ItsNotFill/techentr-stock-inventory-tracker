import { z } from "zod";

/**
 * One counted ingredient as typed on the phone. `unit` is a display unit of
 * the ingredient (g, kg, ml, cl, l, unit) or a pack: "pack:<pack size id>".
 * An empty `amount` removes the ingredient from the count.
 */
export const countEntrySchema = z.object({
  ingredientId: z.uuid(),
  amount: z.string().trim().max(20),
  unit: z.string().min(1).max(60),
});

export const countEntriesSchema = z.array(countEntrySchema).max(500);

export type CountEntry = z.infer<typeof countEntrySchema>;

export const reviewNoteSchema = z
  .string()
  .trim()
  .max(500, "Use at most 500 characters.")
  .transform((value) => (value === "" ? null : value));

export { PACK_UNIT_PREFIX } from "@/lib/units/entry";
