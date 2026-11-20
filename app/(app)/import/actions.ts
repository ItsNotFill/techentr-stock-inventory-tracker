"use server";

import { refresh } from "next/cache";
import { checkRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import {
  confirmImport,
  CsvError,
  getSavedColumnMap,
  guessColumnMap,
  ImportError,
  mapFitsHeaders,
  parseCsv,
  posProviderKey,
  prepareImport,
  previewImport,
  saveColumnMap,
  undoImport,
  type ImportPreview,
  type ImportResult,
  type InvalidRow,
} from "@/lib/imports";
import { LedgerError } from "@/lib/ledger";
import { getRestaurantDetails } from "@/lib/team";
import { formError, PERMISSION_DENIED, type FormState } from "@/lib/validation/form";
import { columnMapSchema, type ColumnMap } from "@/lib/validation/imports";
import { idSchema } from "@/lib/validation/ingredients";

// Server Actions for the sales import screen. The file travels as text: the
// server parses and validates it again on every step, so what is previewed is
// exactly what is imported. Owners and managers only.

const DENIED = { ok: false as const, message: PERMISSION_DENIED.message! };
/** Bad rows shown in the preview. The count of all of them is returned as well. */
const INVALID_ROWS_SHOWN = 100;

export type AnalyzeResult =
  | {
      ok: true;
      /** Column names of the file, in order. */
      headers: string[];
      /** The first rows, as written, to show next to the mapping. */
      sampleRows: Record<string, string>[];
      rowCount: number;
      /** A mapping to start from; fields that could not be guessed are missing. */
      map: Partial<ColumnMap>;
      /** `saved`: the mapping used last time fits this file. `guessed`: worked out from the headers. */
      mapSource: "saved" | "guessed";
    }
  | { ok: false; message: string };

export type PreviewResult =
  | {
      ok: true;
      preview: ImportPreview;
      /** The first bad rows, with their line numbers. */
      invalidRows: InvalidRow[];
      invalidRowCount: number;
    }
  | { ok: false; message: string; errors?: Record<string, string[] | undefined> };

export type ConfirmResult = { ok: true; result: ImportResult } | { ok: false; message: string };

function failure(error: unknown): { ok: false; message: string } {
  if (error instanceof CsvError || error instanceof ImportError || error instanceof LedgerError) return { ok: false, message: error.message };
  throw error;
}

function parseMap(map: unknown) {
  const parsed = columnMapSchema.safeParse(map);
  if (parsed.success) return { ok: true as const, map: parsed.data };
  const errors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    (errors[issue.path.join(".") || "_form"] ??= []).push(issue.message);
  }
  return { ok: false as const, message: "Choose a column for every required field.", errors };
}

/** Step 1: read the file's columns and propose a mapping. */
export async function analyzeSalesCsv(csvText: string): Promise<AnalyzeResult> {
  const membership = await checkRole(MANAGER_ROLES);
  if (!membership) return DENIED;
  if (typeof csvText !== "string") return { ok: false, message: "No file was received." };

  try {
    const csv = parseCsv(csvText);
    const saved = await withUser(async (tx) => {
      const details = await getRestaurantDetails(tx, membership.locationId);
      return getSavedColumnMap(tx, membership.locationId, posProviderKey(details?.posProvider));
    });
    const useSaved = saved !== null && mapFitsHeaders(saved, csv.headers);
    return {
      ok: true,
      headers: csv.headers,
      sampleRows: csv.rows.slice(0, 5),
      rowCount: csv.rows.length,
      map: useSaved ? saved : guessColumnMap(csv),
      mapSource: useSaved ? "saved" : "guessed",
    };
  } catch (error) {
    return failure(error);
  }
}

/** Step 2: validate every row with the chosen mapping and say what an import would do. Writes nothing. */
export async function previewSalesImport(csvText: string, map: unknown): Promise<PreviewResult> {
  const membership = await checkRole(MANAGER_ROLES);
  if (!membership) return DENIED;
  if (typeof csvText !== "string") return { ok: false, message: "No file was received." };
  const parsedMap = parseMap(map);
  if (!parsedMap.ok) return parsedMap;

  try {
    const csv = parseCsv(csvText);
    if (!mapFitsHeaders(parsedMap.map, csv.headers)) {
      return { ok: false, message: "The chosen columns are not in this file. Choose them again." };
    }
    const prepared = prepareImport(csv, parsedMap.map, membership.timezone);
    const preview = await withUser((tx) => previewImport(tx, membership.locationId, prepared));
    return {
      ok: true,
      preview,
      invalidRows: prepared.invalidRows.slice(0, INVALID_ROWS_SHOWN),
      invalidRowCount: prepared.invalidRows.length,
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Step 3: import. One transaction: sales, lines and stock movements are all
 * written or none are. Orders already imported are skipped. The mapping is
 * remembered for the next file.
 */
export async function confirmSalesImport(csvText: string, map: unknown, fileName: string): Promise<ConfirmResult> {
  const membership = await checkRole(MANAGER_ROLES);
  if (!membership) return DENIED;
  if (typeof csvText !== "string") return { ok: false, message: "No file was received." };
  const parsedMap = parseMap(map);
  if (!parsedMap.ok) return { ok: false, message: parsedMap.message };
  const safeFileName = typeof fileName === "string" && fileName.trim() !== "" ? fileName.trim().slice(0, 200) : null;

  try {
    const csv = parseCsv(csvText);
    if (!mapFitsHeaders(parsedMap.map, csv.headers)) {
      return { ok: false, message: "The chosen columns are not in this file. Choose them again." };
    }
    const prepared = prepareImport(csv, parsedMap.map, membership.timezone);
    const result = await withUser(async (tx) => {
      const imported = await confirmImport(tx, membership.locationId, membership.userId, {
        fileName: safeFileName,
        prepared,
      });
      const details = await getRestaurantDetails(tx, membership.locationId);
      await saveColumnMap(tx, membership.locationId, posProviderKey(details?.posProvider), membership.userId, parsedMap.map);
      return imported;
    });
    refresh();
    return { ok: true, result };
  } catch (error) {
    return failure(error);
  }
}

/** Removes an import's sales and gives the stock back. The same file can be imported again afterwards. */
export async function undoSalesImport(importId: string): Promise<FormState> {
  const membership = await checkRole(MANAGER_ROLES);
  if (!membership) return PERMISSION_DENIED;
  const id = idSchema.safeParse(importId);
  if (!id.success) return formError("This import no longer exists.");

  try {
    const removed = await withUser((tx) => undoImport(tx, id.data));
    refresh();
    return {
      ok: true,
      message: `Import undone: ${removed.sales} ${removed.sales === 1 ? "order" : "orders"} removed and the stock they used is back.`,
    };
  } catch (error) {
    if (error instanceof ImportError || error instanceof LedgerError) return formError(error.message);
    throw error;
  }
}
