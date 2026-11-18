import { z } from "zod";
import { optionalText } from "./quantity";

/**
 * Forms of the phone screens that add or remove stock: Log delivery and
 * Log waste. One entry is an ingredient, an amount as typed ("1,5") and a
 * unit: a display unit of the ingredient (g, kg, ml, cl, l, unit) or a pack,
 * "pack:<pack size id>". lib/units/entry.ts converts it to base units.
 */

export const stockEntrySchema = z.object({
  ingredientId: z.uuid("Choose an ingredient."),
  amount: z.string().trim().min(1, "Enter how much.").max(20, "That number is too long."),
  unit: z.string().min(1, "Choose a unit or pack.").max(60),
});

export type StockEntry = z.infer<typeof stockEntrySchema>;

export const MAX_DELIVERY_LINES = 100;

/** How far back a delivery or waste may be dated (DECISIONS.md 84). */
export const MAX_DAYS_BACK = 31;

/**
 * "" means now; otherwise an `<input type="datetime-local">` value, read in
 * the restaurant's timezone.
 */
const enteredTime = z.string().trim().max(25);

export const deliveryInputSchema = z.object({
  /** crypto.randomUUID() made when the form opens: a retried submit stays one delivery. */
  clientId: z.uuid(),
  supplierName: optionalText(120),
  deliveredAt: enteredTime,
  lines: z
    .array(stockEntrySchema)
    .min(1, "Add at least one item.")
    .max(MAX_DELIVERY_LINES, `A delivery can have at most ${MAX_DELIVERY_LINES} items.`),
});

export type DeliveryInput = z.infer<typeof deliveryInputSchema>;
