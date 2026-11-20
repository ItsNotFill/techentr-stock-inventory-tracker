"use server";

import { refresh } from "next/cache";
import { checkRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { saveSupplier, setSupplierActive } from "@/lib/purchasing";
import { purchasingFormState } from "@/lib/purchasing/form-state";
import { formError, invalidForm, PERMISSION_DENIED, type FormState } from "@/lib/validation/form";
import { idSchema } from "@/lib/validation/ingredients";
import { supplierFormSchema } from "@/lib/validation/purchasing";

// Server Actions for the supplier screens (DECISIONS.md 97). Owners and
// managers only; each checks the role again, validates with Zod and writes
// through the RLS client.

/** Creates (`id` null) or updates a supplier: `{ name, contactName, email, phone, notes }`. */
export async function saveSupplierAction(id: string | null, values: unknown): Promise<FormState & { id?: string }> {
  const membership = await checkRole(MANAGER_ROLES);
  if (!membership) return PERMISSION_DENIED;
  const parsedId = id === null ? null : idSchema.safeParse(id);
  if (parsedId && !parsedId.success) return formError("This supplier no longer exists.");
  const parsed = supplierFormSchema.safeParse(values);
  if (!parsed.success) return invalidForm(parsed.error);
  try {
    const saved = await withUser((tx) => saveSupplier(tx, membership.locationId, parsedId ? parsedId.data : null, parsed.data));
    refresh();
    return { ok: true, id: saved, message: id ? "Supplier saved." : "Supplier added." };
  } catch (error) {
    return purchasingFormState(error);
  }
}

/** Archives a supplier (its ingredients and orders keep it) or brings it back. */
export async function setSupplierActiveAction(id: string, active: boolean): Promise<FormState> {
  const membership = await checkRole(MANAGER_ROLES);
  if (!membership) return PERMISSION_DENIED;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return formError("This supplier no longer exists.");
  try {
    await withUser((tx) => setSupplierActive(tx, membership.locationId, parsed.data, active === true));
    refresh();
    return { ok: true, message: active ? "Supplier restored." : "Supplier archived." };
  } catch (error) {
    return purchasingFormState(error);
  }
}
