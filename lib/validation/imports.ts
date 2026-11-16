import { z } from "zod";

export const DATE_FORMATS = ["iso", "dmy", "mdy", "ymd"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  iso: "2026-11-16 19:30 (ISO)",
  dmy: "16/11/2026 19:30 (day first)",
  mdy: "11/16/2026 7:30 PM (month first)",
  ymd: "2026/11/16 19:30 (year first)",
};

export const DECIMAL_SEPARATORS = [".", ","] as const;

/**
 * Which CSV column is which, plus how dates and numbers are written.
 * Column values are the header names of the file. Remembered per POS in
 * `pos_import_mappings.column_map`.
 */
export const columnMapSchema = z.object({
  orderId: z.string().min(1, "Choose the column with the order or receipt number."),
  itemName: z.string().min(1, "Choose the column with the item name."),
  /** Optional: the POS's own id per item. */
  itemId: z.string().min(1).nullable(),
  quantity: z.string().min(1, "Choose the column with the quantity."),
  /** The date, or date and time together. */
  soldAt: z.string().min(1, "Choose the column with the date."),
  /** Optional: a separate time column. */
  soldAtTime: z.string().min(1).nullable(),
  dateFormat: z.enum(DATE_FORMATS),
  decimalSeparator: z.enum(DECIMAL_SEPARATORS),
});

export type ColumnMap = z.infer<typeof columnMapSchema>;

/** One file is one Server Action call; Vercel accepts request bodies up to about 4.5 MB. */
export const MAX_CSV_BYTES = 4_000_000;
export const MAX_CSV_ROWS = 50_000;
