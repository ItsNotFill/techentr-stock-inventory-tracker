import Papa from "papaparse";
import { MAX_CSV_BYTES, MAX_CSV_ROWS } from "@/lib/validation/imports";

/** A parsed file: header names and every row as text, exactly as written. */
export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
};

export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvError";
  }
}

/**
 * Parses a POS export. The delimiter (comma, semicolon, tab) is detected,
 * headers are trimmed, empty lines are skipped, and nothing is converted:
 * numbers and dates stay text until the column mapping says what they are.
 * When two columns share a name, the parser renames the later one ("Item_1").
 */
export function parseCsv(text: string): ParsedCsv {
  if (new TextEncoder().encode(text).length > MAX_CSV_BYTES) {
    throw new CsvError("This file is too large. Split it into smaller periods, for example one week per file.");
  }
  const cleaned = text.replace(/^﻿/, "");
  if (cleaned.trim() === "") throw new CsvError("This file is empty.");

  const result = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim(),
  });

  const headers = (result.meta.fields ?? []).filter((header) => header !== "");
  if (headers.length < 2) {
    throw new CsvError("This does not look like a table: no columns were found in the first line.");
  }
  if (result.data.length === 0) throw new CsvError("This file has a header line but no rows.");
  if (result.data.length > MAX_CSV_ROWS) {
    throw new CsvError(`This file has more than ${MAX_CSV_ROWS.toLocaleString("en")} rows. Split it into smaller periods.`);
  }
  return { headers, rows: result.data, delimiter: result.meta.delimiter };
}
