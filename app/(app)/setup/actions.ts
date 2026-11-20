"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { checkRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import { IngredientError } from "@/lib/ingredients";
import { MenuError } from "@/lib/menu";
import {
  confirmSetupImport,
  hasErrors,
  planSetupImport,
  SetupImportError,
  type SetupPlan,
  type SetupResult,
  type SheetIssue,
} from "@/lib/setup-import";
import { PERMISSION_DENIED } from "@/lib/validation/form";

// Server Actions for the setup import screen (owners and managers). The files
// travel as text and are read and checked again on every step, so what the
// preview shows is exactly what is imported (DECISIONS.md 92).

/** Each file at most 1 MB: two thousand rows are far smaller. */
const MAX_SETUP_BYTES = 1_000_000;

const fileText = z
  .string()
  .nullable()
  .refine((text) => text === null || new TextEncoder().encode(text).length <= MAX_SETUP_BYTES, "This file is larger than 1 MB.");

/**
 * `{ ingredients, recipes }`: the text of each CSV file, or null when that
 * file is not given. At least one is needed.
 */
const setupFilesSchema = z.object({ ingredients: fileText, recipes: fileText });

export type SetupCheckResult =
  | { ok: true; plan: SetupPlan }
  | { ok: false; message: string; issues?: SheetIssue[] };

export type SetupImportResult =
  | { ok: true; result: SetupResult; message: string }
  | { ok: false; message: string; issues?: SheetIssue[] };

function readInput(input: unknown) {
  const parsed = setupFilesSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Could not read the files. Choose them again." };
  if (parsed.data.ingredients === null && parsed.data.recipes === null) return { error: "Choose at least one file." };
  return { files: parsed.data };
}

/** Reads and checks the files and says what an import would do. Writes nothing. */
export async function checkSetupFilesAction(input: unknown): Promise<SetupCheckResult> {
  const membership = await checkRole(MANAGER_ROLES);
  if (!membership) return { ok: false, message: PERMISSION_DENIED.message! };
  const read = readInput(input);
  if ("error" in read) return { ok: false, message: read.error! };
  try {
    const plan = await withUser((tx) => planSetupImport(tx, membership.locationId, read.files));
    return { ok: true, plan };
  } catch (error) {
    if (error instanceof SetupImportError) return { ok: false, message: error.message, issues: error.issues };
    throw error;
  }
}

/** Imports the files in one transaction, or nothing when anything is wrong. */
export async function importSetupFilesAction(input: unknown): Promise<SetupImportResult> {
  const membership = await checkRole(MANAGER_ROLES);
  if (!membership) return { ok: false, message: PERMISSION_DENIED.message! };
  const read = readInput(input);
  if ("error" in read) return { ok: false, message: read.error! };
  try {
    const result = await withUser((tx) => confirmSetupImport(tx, membership.locationId, membership.userId, read.files));
    refresh();
    const parts = [
      `${result.ingredientsCreated} ${result.ingredientsCreated === 1 ? "ingredient" : "ingredients"} added`,
      result.packsAdded > 0 ? `${result.packsAdded} pack ${result.packsAdded === 1 ? "size" : "sizes"}` : null,
      `${result.menuItemsCreated} menu ${result.menuItemsCreated === 1 ? "item" : "items"}`,
      `${result.recipesSaved} ${result.recipesSaved === 1 ? "recipe" : "recipes"} saved`,
      result.backfilledLines > 0 ? `${result.backfilledLines} waiting sale ${result.backfilledLines === 1 ? "line" : "lines"} now use stock` : null,
    ].filter(Boolean);
    return { ok: true, result, message: `Imported: ${parts.join(", ")}.` };
  } catch (error) {
    if (error instanceof SetupImportError) {
      return { ok: false, message: error.message, issues: hasErrors(error.issues) ? error.issues : undefined };
    }
    // Someone changed the same ingredients or items at the same moment.
    if (error instanceof IngredientError || error instanceof MenuError || isUniqueViolation(error)) {
      return { ok: false, message: "Something changed while importing. Check the files again." };
    }
    throw error;
  }
}
