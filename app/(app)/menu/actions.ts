"use server";

import { refresh } from "next/cache";
import { checkRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import {
  createMenuItem,
  deleteMenuItem,
  MenuError,
  saveRecipe as saveRecipeLines,
  setMenuItemIgnored as setIgnored,
  updateMenuItem,
} from "@/lib/menu";
import { formError, invalidForm, PERMISSION_DENIED, type FormState } from "@/lib/validation/form";
import { idSchema } from "@/lib/validation/ingredients";
import { menuItemFormSchema, recipeInputSchema } from "@/lib/validation/menu";

// Server Actions for the menu and recipe screens. Each one checks the role
// again, validates with the shared Zod schema and writes through the RLS client.

type SavedState = FormState & { id?: string };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function toFormState(error: unknown): FormState {
  if (error instanceof MenuError) {
    return error.field
      ? { ok: false, message: "Please check the highlighted fields.", errors: { [error.field]: [error.message] } }
      : formError(error.message);
  }
  // Someone else saved the same name at the same moment; the unique index refused this one.
  if (isUniqueViolation(error)) {
    return formError("Something with the same name was saved a moment ago. Check the list and try again.");
  }
  throw error;
}

/**
 * Create (no `id` field) or update (hidden `id` field) a menu item.
 * Fields: `posName`, `posItemId`, `displayName`, `kind` (item | modifier), `category`, `price`.
 */
export async function saveMenuItem(_previous: FormState, formData: FormData): Promise<SavedState> {
  const membership = await checkRole(MANAGER_ROLES);
  if (!membership) return PERMISSION_DENIED;

  const parsed = menuItemFormSchema.safeParse({
    posName: field(formData, "posName"),
    posItemId: field(formData, "posItemId"),
    displayName: field(formData, "displayName"),
    kind: field(formData, "kind") || "item",
    category: field(formData, "category"),
    price: field(formData, "price"),
  });
  if (!parsed.success) return invalidForm(parsed.error);

  const rawId = field(formData, "id");
  const id = rawId ? idSchema.safeParse(rawId) : null;
  if (id && !id.success) return formError("This item no longer exists.");

  try {
    const savedId = await withUser(async (tx) => {
      if (id) {
        await updateMenuItem(tx, membership.locationId, id.data, parsed.data);
        return id.data;
      }
      return createMenuItem(tx, membership.locationId, parsed.data);
    });
    refresh();
    return { ok: true, message: id ? "Item saved." : "Item added.", id: savedId };
  } catch (error) {
    return toFormState(error);
  }
}

/** Ignore an item that uses no stock (`ignored` true), or stop ignoring it. */
export async function setMenuItemIgnored(menuItemId: string, ignored: boolean): Promise<FormState> {
  const membership = await checkRole(MANAGER_ROLES);
  if (!membership) return PERMISSION_DENIED;
  const id = idSchema.safeParse(menuItemId);
  if (!id.success) return formError("This item no longer exists.");

  try {
    await withUser((tx) => setIgnored(tx, membership.locationId, id.data, ignored));
    refresh();
    return { ok: true, message: ignored ? "Item ignored. It will not use stock." : "Item is no longer ignored." };
  } catch (error) {
    return toFormState(error);
  }
}

/**
 * Saves an item's whole recipe. `lines` is the full list as shown in the
 * editor: `[{ ingredientId, amount, unit }]`, with `amount` as typed ("120",
 * "0,5") and `unit` one of the ingredient's display units. Saving confirms
 * every line; an empty list removes the recipe.
 *
 * Errors for one line come back under `lines.<index>.<field>`.
 */
export async function saveRecipe(menuItemId: string, lines: unknown): Promise<FormState> {
  const membership = await checkRole(MANAGER_ROLES);
  if (!membership) return PERMISSION_DENIED;
  const id = idSchema.safeParse(menuItemId);
  if (!id.success) return formError("This item no longer exists.");

  const parsed = recipeInputSchema.safeParse(lines);
  if (!parsed.success) {
    const state = invalidForm(parsed.error, "Please check the highlighted lines.");
    // Zod paths for an array are "0.amount"; the editor expects "lines.0.amount".
    return {
      ...state,
      errors: Object.fromEntries(
        Object.entries(state.errors ?? {}).map(([key, value]) => [key === "_form" ? key : `lines.${key}`, value]),
      ),
    };
  }

  try {
    const result = await withUser((tx) =>
      saveRecipeLines(tx, membership.locationId, membership.userId, id.data, parsed.data),
    );
    refresh();
    return {
      ok: true,
      message: result.isMapped ? "Recipe saved. Sales of this item now use stock." : "Recipe removed. This item needs a recipe again.",
    };
  } catch (error) {
    return toFormState(error);
  }
}

export async function removeMenuItem(menuItemId: string): Promise<FormState> {
  const membership = await checkRole(MANAGER_ROLES);
  if (!membership) return PERMISSION_DENIED;
  const id = idSchema.safeParse(menuItemId);
  if (!id.success) return formError("This item no longer exists.");

  try {
    await withUser((tx) => deleteMenuItem(tx, membership.locationId, id.data));
    // No refresh(): it would re-render the page of the item that is gone. The screen goes to /menu instead.
    return { ok: true, message: "Item deleted." };
  } catch (error) {
    return toFormState(error);
  }
}
