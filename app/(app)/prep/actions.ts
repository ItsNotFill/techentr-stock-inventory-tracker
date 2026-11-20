"use server";

import { refresh } from "next/cache";
import { checkRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import { saveSubRecipe, setSubRecipeActive, SubRecipeError } from "@/lib/sub-recipes";
import { formError, invalidForm, PERMISSION_DENIED, type FormState } from "@/lib/validation/form";
import { idSchema } from "@/lib/validation/ingredients";
import { prepLinesInputSchema, subRecipeFormSchema } from "@/lib/validation/sub-recipes";

// Server Actions for the prep recipe screens (DECISIONS.md 96). Owners and
// managers only. Each checks the role again, validates with the shared Zod
// schemas and writes through the RLS client.

function toFormState(error: unknown): FormState {
  if (error instanceof SubRecipeError) {
    return error.field
      ? { ok: false, message: "Please check the highlighted fields.", errors: { [error.field]: [error.message] } }
      : formError(error.message);
  }
  if (isUniqueViolation(error)) return formError("Someone saved this prep recipe at the same moment. Reload the page and try again.");
  throw error;
}

/**
 * Creates (`id` null) or saves a prep recipe with all its lines.
 *
 * - `values`: `{ name, baseUnit, yieldAmount, yieldUnit, category }`: what it
 *   makes, e.g. "5" "l" of a prep recipe counted in ml.
 * - `lines`: `[{ ingredientId | subRecipeId, amount, unit }]`, one per
 *   ingredient or prep recipe used by one batch; they replace what was there.
 *
 * Field errors come back under the form field names and `lines.<index>.<field>`.
 */
export async function savePrepRecipeAction(id: string | null, values: unknown, lines: unknown): Promise<FormState & { id?: string }> {
  const membership = await checkRole(MANAGER_ROLES);
  if (!membership) return PERMISSION_DENIED;
  const parsedId = id === null ? null : idSchema.safeParse(id);
  if (parsedId && !parsedId.success) return formError("This prep recipe no longer exists.");
  const form = subRecipeFormSchema.safeParse(values);
  if (!form.success) return invalidForm(form.error);
  const parsedLines = prepLinesInputSchema.safeParse(lines);
  if (!parsedLines.success) {
    const state = invalidForm(parsedLines.error, "Please check the highlighted lines.");
    // Zod paths for an array are "0.amount"; the editor expects "lines.0.amount".
    return {
      ...state,
      errors: Object.fromEntries(Object.entries(state.errors ?? {}).map(([key, value]) => [key === "_form" ? "lines" : `lines.${key}`, value])),
    };
  }
  try {
    const savedId = await withUser((tx) => saveSubRecipe(tx, membership.locationId, parsedId ? parsedId.data : null, form.data, parsedLines.data));
    refresh();
    return { ok: true, id: savedId, message: id ? "Prep recipe saved." : "Prep recipe added." };
  } catch (error) {
    return toFormState(error);
  }
}

/** Archives a prep recipe (recipes that use it keep working) or brings it back. */
export async function setPrepRecipeActiveAction(id: string, active: boolean): Promise<FormState> {
  const membership = await checkRole(MANAGER_ROLES);
  if (!membership) return PERMISSION_DENIED;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return formError("This prep recipe no longer exists.");
  try {
    await withUser((tx) => setSubRecipeActive(tx, membership.locationId, parsed.data, active === true));
    refresh();
    return { ok: true, message: active ? "Prep recipe restored." : "Prep recipe archived. Recipes that use it keep working." };
  } catch (error) {
    return toFormState(error);
  }
}
