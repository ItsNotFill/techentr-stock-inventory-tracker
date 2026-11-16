import Decimal from "decimal.js";
import { z } from "zod";
import { toDbQty } from "@/lib/units";
import type { ColumnMap, DateFormat } from "@/lib/validation/imports";
import type { ParsedCsv } from "./csv";
import { isValidLocalDateTime, zonedTimeToUtc, type LocalDateTime } from "./time";

/**
 * CSV rows -> validated sale rows -> orders. Pure: no database here.
 *
 * Rules:
 * - Every row is checked with Zod. A bad row is reported with its line number.
 * - An order is imported whole or not at all: if one of its rows is bad, the
 *   whole order is held back ("blocked"), so a later upload of the corrected
 *   file can still bring it in. Importing half an order would make the
 *   idempotency rule skip the corrected rows for ever.
 * - A negative quantity is a refund.
 */

export type SaleRow = {
  /** Line number in the file (the header is line 1). */
  rowNumber: number;
  orderId: string;
  itemName: string;
  itemId: string | null;
  /** numeric(14, 3) string; never zero. */
  qty: string;
  soldAt: Date;
};

export type InvalidRow = {
  rowNumber: number;
  /** The order the row belongs to, when it could be read. */
  orderId: string | null;
  itemName: string | null;
  errors: string[];
};

export type ImportOrder = {
  posOrderId: string;
  /** The earliest time among the order's rows. */
  soldAt: Date;
  lines: SaleRow[];
};

export type PreparedImport = {
  totalRows: number;
  orders: ImportOrder[];
  invalidRows: InvalidRow[];
  /** Orders held back because at least one of their rows is invalid. */
  blockedOrderIds: string[];
};

const MAX_QUANTITY = new Decimal(100_000);

/** "1.234,5" with a decimal comma, "1,234.5" with a decimal point. Returns null when it is not a number. */
export function parseCsvQuantity(value: string, decimalSeparator: "." | ","): Decimal | null {
  let text = value.replace(/\s/g, "");
  text = decimalSeparator === "," ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(text)) return null;
  return new Decimal(text);
}

const TIME = String.raw`(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\.\d+)?\s*([AaPp]\.?[Mm]\.?)?`;
const TIME_ONLY = new RegExp(`^${TIME}$`);
const SEPARATOR = String.raw`[/.\-]`;
const DATE_PATTERNS: Record<DateFormat, RegExp> = {
  iso: new RegExp(String.raw`^(\d{4})-(\d{2})-(\d{2})(?:[T ]+${TIME})?\s*(Z|[+-]\d{2}:?\d{2})?$`),
  ymd: new RegExp(String.raw`^(\d{4})${SEPARATOR}(\d{1,2})${SEPARATOR}(\d{1,2})(?:[T ,]+${TIME})?$`),
  dmy: new RegExp(String.raw`^(\d{1,2})${SEPARATOR}(\d{1,2})${SEPARATOR}(\d{2}|\d{4})(?:[T ,]+${TIME})?$`),
  mdy: new RegExp(String.raw`^(\d{1,2})${SEPARATOR}(\d{1,2})${SEPARATOR}(\d{2}|\d{4})(?:[T ,]+${TIME})?$`),
};

function to24Hour(hour: number, meridiem: string | undefined): number | null {
  if (!meridiem) return hour;
  if (hour < 1 || hour > 12) return null;
  const pm = meridiem.toLowerCase().startsWith("p");
  return (hour % 12) + (pm ? 12 : 0);
}

/**
 * Reads a date (and time) as written in the file and returns the UTC instant.
 * Without a time the sale is put at 12:00 in the restaurant's timezone, which
 * keeps it on the right day. Returns null when the text is not a valid date.
 */
export function parseCsvDate(value: string, time: string | null, format: DateFormat, timeZone: string): Date | null {
  const match = DATE_PATTERNS[format].exec(value.trim());
  if (!match) return null;

  const numbers = match.slice(1, 4).map(Number);
  const [year, month, day] =
    format === "iso" || format === "ymd"
      ? numbers
      : format === "dmy"
        ? [numbers[2], numbers[1], numbers[0]]
        : [numbers[2], numbers[0], numbers[1]];
  const fullYear = year < 100 ? 2000 + year : year;

  let hourText = match[4];
  let minuteText = match[5];
  let secondText = match[6];
  let meridiem = match[7];
  const offset = format === "iso" ? match[8] : undefined;

  if (time !== null && time.trim() !== "") {
    const timeMatch = TIME_ONLY.exec(time.trim());
    if (!timeMatch) return null;
    [, hourText, minuteText, secondText, meridiem] = timeMatch;
  }

  const hasTime = hourText !== undefined;
  const hour = hasTime ? to24Hour(Number(hourText), meridiem) : 12;
  if (hour === null) return null;
  const local: LocalDateTime = {
    year: fullYear,
    month,
    day,
    hour,
    minute: hasTime ? Number(minuteText) : 0,
    second: secondText ? Number(secondText) : 0,
  };
  if (!isValidLocalDateTime(local)) return null;

  if (offset) {
    // The file states its own offset: that is an exact instant.
    const sign = offset.startsWith("-") ? -1 : 1;
    const digits = offset === "Z" ? "0000" : offset.slice(1).replace(":", "");
    const offsetMinutes = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
    return new Date(Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) - offsetMinutes * 60_000);
  }
  return zonedTimeToUtc(local, timeZone);
}

function rowSchema(map: ColumnMap, timeZone: string) {
  // Every check runs in one pass, so a row with several problems reports them all.
  return z
    .object({
      orderId: z.string(),
      itemName: z.string(),
      itemId: z.string(),
      quantity: z.string(),
      soldAt: z.string(),
      soldAtTime: z.string(),
    })
    .transform((raw, context) => {
      const problem = (message: string) => context.addIssue({ code: "custom", message });
      let ok = true;
      const require = (value: string, missing: string, maxLength: number, tooLong: string) => {
        if (value === "") {
          problem(missing);
          ok = false;
        } else if (value.length > maxLength) {
          problem(tooLong);
          ok = false;
        }
      };
      require(raw.orderId, "The order number is missing.", 200, "The order number is too long.");
      require(raw.itemName, "The item name is missing.", 200, "The item name is too long.");
      if (raw.itemId.length > 100) {
        problem("The item id is too long.");
        ok = false;
      }
      if (raw.quantity === "") problem("The quantity is missing.");
      if (raw.soldAt === "") problem("The date is missing.");

      let qty: string | null = null;
      if (raw.quantity !== "") {
        const parsed = parseCsvQuantity(raw.quantity, map.decimalSeparator);
        if (!parsed) {
          context.addIssue({ code: "custom", message: `"${raw.quantity}" is not a number.` });
        } else if (parsed.abs().gt(MAX_QUANTITY)) {
          context.addIssue({ code: "custom", message: `The quantity ${raw.quantity} is too large.` });
        } else if (parsed.toDecimalPlaces(3, Decimal.ROUND_HALF_UP).isZero()) {
          context.addIssue({ code: "custom", message: "The quantity is zero." });
        } else {
          qty = toDbQty(parsed);
        }
      }

      let soldAt: Date | null = null;
      if (raw.soldAt !== "") {
        soldAt = parseCsvDate(raw.soldAt, map.soldAtTime ? raw.soldAtTime : null, map.dateFormat, timeZone);
        if (!soldAt) {
          const shown = map.soldAtTime && raw.soldAtTime ? `${raw.soldAt} ${raw.soldAtTime}` : raw.soldAt;
          context.addIssue({ code: "custom", message: `"${shown}" is not a date in the chosen format.` });
        }
      }

      if (!ok || qty === null || soldAt === null) return z.NEVER;
      return { orderId: raw.orderId, itemName: raw.itemName, itemId: raw.itemId === "" ? null : raw.itemId, qty, soldAt };
    });
}

/** Validates every row of the file and groups the good ones into orders. */
export function prepareImport(csv: ParsedCsv, map: ColumnMap, timeZone: string): PreparedImport {
  const schema = rowSchema(map, timeZone);
  const cell = (row: Record<string, string>, header: string | null) => (header ? (row[header] ?? "").trim() : "");

  const valid: SaleRow[] = [];
  const invalidRows: InvalidRow[] = [];
  csv.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const raw = {
      orderId: cell(row, map.orderId),
      itemName: cell(row, map.itemName),
      itemId: cell(row, map.itemId),
      quantity: cell(row, map.quantity),
      soldAt: cell(row, map.soldAt),
      soldAtTime: cell(row, map.soldAtTime),
    };
    const parsed = schema.safeParse(raw);
    if (parsed.success) {
      valid.push({ rowNumber, ...parsed.data });
    } else {
      invalidRows.push({
        rowNumber,
        orderId: raw.orderId || null,
        itemName: raw.itemName || null,
        errors: parsed.error.issues.map((issue) => issue.message),
      });
    }
  });

  const blocked = new Set(invalidRows.map((row) => row.orderId).filter((id): id is string => id !== null));
  const byOrder = new Map<string, ImportOrder>();
  for (const row of valid) {
    if (blocked.has(row.orderId)) continue;
    const order = byOrder.get(row.orderId);
    if (!order) {
      byOrder.set(row.orderId, { posOrderId: row.orderId, soldAt: row.soldAt, lines: [row] });
    } else {
      order.lines.push(row);
      if (row.soldAt < order.soldAt) order.soldAt = row.soldAt;
    }
  }

  return { totalRows: csv.rows.length, orders: [...byOrder.values()], invalidRows, blockedOrderIds: [...blocked] };
}
