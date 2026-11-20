import { z } from "zod";
import { optionalText } from "./quantity";
import { stockEntrySchema } from "./stock-entry";

/** A supplier (DECISIONS.md 97). Only the name is required. */
export const supplierFormSchema = z.object({
  name: z.string().trim().min(1, "Enter the supplier's name.").max(80, "Use at most 80 characters."),
  contactName: optionalText(80),
  email: z
    .string()
    .trim()
    .max(120, "Use at most 120 characters.")
    .transform((value) => (value === "" ? null : value))
    .pipe(z.email("Enter an e-mail address, or leave it empty.").nullable()),
  phone: optionalText(40),
  notes: optionalText(500),
});

export type SupplierFormValues = z.infer<typeof supplierFormSchema>;

export const MAX_ORDER_LINES = 100;

/**
 * A purchase order's lines as typed: an ingredient, an amount and a unit or a
 * pack ("pack:<id>"), as on the delivery screen. An empty list is a draft
 * with nothing on it yet.
 */
export const purchaseOrderInputSchema = z.object({
  notes: optionalText(500),
  lines: z.array(stockEntrySchema).max(MAX_ORDER_LINES, `An order can have at most ${MAX_ORDER_LINES} lines.`),
});

export type PurchaseOrderInput = z.infer<typeof purchaseOrderInputSchema>;
