"use server";

import { refresh } from "next/cache";
import { checkRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import {
  addPackSize,
  createIngredient,
  deletePackSize,
  IngredientError,
  setIngredientActive,
  updateIngredient,
  updatePackSize,
} from "@/lib/ingredients";
import { formError, invalidForm, PERMISSION_DENIED, type FormState } from "@/lib/validation/form";
import { idSchema, ingredientFormSchema, packSizeFormSchema } from "@/lib/validation/ingredients";

// Server Actions for the ingredients screen. Each one checks the role again,
// validates with the shared Zod schema and writes through the RLS client.
//
// Form field names match the schema keys in lib/validation/ingredients.ts.

type SavedState = FormState & { id?: string };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function toFormState(error: unknown): FormState {
  if (error instanceof IngredientError) {
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

function parseIngredient(formData: FormData) {
  return ingredientFormSchema.safeParse({
    name: field(formData, "name"),
    baseUnit: field(formData, "baseUnit"),
    costAmount: field(formData, "costAmount") || "0",
    costUnit: field(formData, "costUnit"),
    reorderPoint: field(formData, "reorderPoint"),
    parLevel: field(formData, "parLevel"),
    levelUnit: field(formData, "levelUnit"),
    category: field(formData, "category"),
    storageArea: field(formData, "storageArea"),
    // Only a form that shows the supplier field sends it; otherwise the supplier is kept.
    supplierId: formData.has("supplierId") ? field(formData, "supplierId") : undefined,
  });
}

function parsePackSize(formData: FormData) {
  return packSizeFormSchema.safeParse({
    label: field(formData, "label"),
    amount: field(formData, "amount"),
    unit: field(formData, "unit"),
    isDefault: field(formData, "isDefault") === "on" || field(formData, "isDefault") === "true",
  });
}

/** Create (no `id` field) or update (hidden `id` field) an ingredient. */
export async function saveIngredient(_previous: FormState, formData: FormData): Promise<SavedState> {
  const membership = await checkRole(MANAGER_ROLES);
  if (!membership) return PERMISSION_DENIED;

  const parsed = parseIngredient(formData);
  if (!parsed.success) return invalidForm(parsed.error);

  const rawId = field(formData, "id");
  const id = rawId ? idSchema.safeParse(rawId) : null;
  if (id && !id.success) return formError("This ingredient no longer exists.");

  try {
    const savedId = await withUser(async (tx) => {
      if (id) {
        await updateIngredient(tx, membership.locationId, id.data, parsed.data);
        return id.data;
      }
      return createIngredient(tx, membership.locationId, parsed.data);
    });
    refresh();
    return { ok: true, message: id ? "Ingredient saved." : "Ingredient added.", id: savedId };
  } catch (error) {
    return toFormState(error);
  }
}

/** Archive (`active` false) or restore (`active` true) an ingredient. */
export async function setIngredientArchived(ingredientId: string, archived: boolean): Promise<FormState> {
  const membership = await checkRole(MANAGER_ROLES);
  if (!membership) return PERMISSION_DENIED;
  const id = idSchema.safeParse(ingredientId);
  if (!id.success) return formError("This ingredient no longer exists.");

  try {
    await withUser((tx) => setIngredientActive(tx, membership.locationId, id.data, !archived));
    refresh();
    return { ok: true, message: archived ? "Ingredient archived." : "Ingredient restored." };
  } catch (error) {
    return toFormState(error);
  }
}

/**
 * Add (no `packSizeId` field) or update a pack size.
 * Needs a hidden `ingredientId` field.
 */
export async function savePackSize(_previous: FormState, formData: FormData): Promise<SavedState> {
  const membership = await checkRole(MANAGER_ROLES);
  if (!membership) return PERMISSION_DENIED;

  const ingredientId = idSchema.safeParse(field(formData, "ingredientId"));
  if (!ingredientId.success) return formError("This ingredient no longer exists.");
  const rawPackSizeId = field(formData, "packSizeId");
  const packSizeId = rawPackSizeId ? idSchema.safeParse(rawPackSizeId) : null;
  if (packSizeId && !packSizeId.success) return formError("This pack size no longer exists.");

  const parsed = parsePackSize(formData);
  if (!parsed.success) return invalidForm(parsed.error);

  try {
    const savedId = await withUser(async (tx) => {
      if (packSizeId) {
        await updatePackSize(tx, membership.locationId, ingredientId.data, packSizeId.data, parsed.data);
        return packSizeId.data;
      }
      return addPackSize(tx, membership.locationId, ingredientId.data, parsed.data);
    });
    refresh();
    return { ok: true, message: packSizeId ? "Pack size saved." : "Pack size added.", id: savedId };
  } catch (error) {
    return toFormState(error);
  }
}

export async function removePackSize(packSizeId: string): Promise<FormState> {
  const membership = await checkRole(MANAGER_ROLES);
  if (!membership) return PERMISSION_DENIED;
  const id = idSchema.safeParse(packSizeId);
  if (!id.success) return formError("This pack size no longer exists.");

  await withUser((tx) => deletePackSize(tx, membership.locationId, id.data));
  refresh();
  return { ok: true, message: "Pack size removed." };
}
