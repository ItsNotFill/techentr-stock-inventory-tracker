import type { ColumnMap, DateFormat } from "@/lib/validation/imports";
import type { ParsedCsv } from "./csv";

/**
 * A first guess at which column is which, from the header names (English,
 * Dutch, Italian, German and common POS wording) and a look at the values.
 * The user checks it once; after that the saved mapping is used.
 */

const normalise = (header: string) => header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

type Field = "orderId" | "itemId" | "itemName" | "quantity" | "soldAtTime" | "soldAt";

// Ordered: the first field whose pattern matches a header claims it.
const PATTERNS: [Field, RegExp][] = [
  ["orderId", /\b(order|receipt|ticket|check|bill|invoice|transaction|bon|rekening|scontrino|ordine|beleg|bestellung)\b.*\b(id|no|nr|number|nummer|numero|num)\b|^(order|receipt|ticket|check|bon|transaction|scontrino|ordine|beleg)$|\b(order ?id|receipt ?id|bonnummer|ordernummer)\b/],
  ["itemId", /\b(sku|plu|barcode|ean|artikelnummer|artikelnr|artikelcode|productcode|productid|productnummer|itemid|itemcode|itemnumber)\b|\b(item|product|article|artikel|articolo|prodotto)\b.*\b(id|code|nr|no|number|nummer|codice)\b|\b(codice)\b.*\b(articolo|prodotto)\b/],
  ["itemName", /\b(item|product|article|artikel|articolo|prodotto|produkt|description|omschrijving|descrizione|name|naam|nome|menu)\b/],
  ["quantity", /\b(qty|quantity|aantal|quantita|quantit|menge|anzahl|units|count|pcs|stuks)\b/],
  ["soldAtTime", /^(time|tijd|ora|orario|uhrzeit|zeit)$|\b(time|tijd|ora|uhrzeit)\b(?!.*\bdate\b)(?!.*\bstamp\b)/],
  ["soldAt", /\b(date|datum|data|datetime|timestamp|sold|created|closed|paid|time|tijd)\b/],
];

/** Day first, month first, year first or ISO: read off the first values. */
export function guessDateFormat(samples: string[]): DateFormat {
  for (const sample of samples) {
    if (/^\d{4}-\d{2}-\d{2}/.test(sample)) return "iso";
    if (/^\d{4}[/.]\d{1,2}[/.]\d{1,2}/.test(sample)) return "ymd";
  }
  for (const sample of samples) {
    const match = /^(\d{1,2})[/.\-](\d{1,2})[/.\-]\d{2,4}/.exec(sample);
    if (!match) continue;
    if (Number(match[1]) > 12) return "dmy";
    if (Number(match[2]) > 12) return "mdy";
  }
  return "dmy";
}

/** "1,5" somewhere and never "1.5": the file writes decimals with a comma. */
export function guessDecimalSeparator(samples: string[]): "." | "," {
  const comma = samples.some((sample) => /^-?\d+,\d{1,3}$/.test(sample));
  const dot = samples.some((sample) => /^-?\d+\.\d+$/.test(sample));
  return comma && !dot ? "," : ".";
}

export function guessColumnMap(csv: ParsedCsv): Partial<ColumnMap> {
  const claimed = new Map<Field, string>();
  for (const [field, pattern] of PATTERNS) {
    const header = csv.headers.find(
      (candidate) => ![...claimed.values()].includes(candidate) && pattern.test(normalise(candidate)),
    );
    if (header) claimed.set(field, header);
  }

  const sample = csv.rows.slice(0, 50);
  const valuesOf = (header: string | undefined) => (header ? sample.map((row) => row[header] ?? "") : []);
  return {
    orderId: claimed.get("orderId"),
    itemName: claimed.get("itemName"),
    itemId: claimed.get("itemId") ?? null,
    quantity: claimed.get("quantity"),
    soldAt: claimed.get("soldAt"),
    soldAtTime: claimed.get("soldAtTime") ?? null,
    dateFormat: guessDateFormat(valuesOf(claimed.get("soldAt"))),
    decimalSeparator: guessDecimalSeparator(valuesOf(claimed.get("quantity"))),
  };
}

/** A saved mapping is only usable when the file still has the columns it names. */
export function mapFitsHeaders(map: ColumnMap, headers: string[]): boolean {
  const needed = [map.orderId, map.itemName, map.quantity, map.soldAt, map.itemId, map.soldAtTime].filter(
    (header): header is string => Boolean(header),
  );
  return needed.every((header) => headers.includes(header));
}
