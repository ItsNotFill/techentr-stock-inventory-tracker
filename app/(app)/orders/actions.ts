"use server";

import { refresh } from "next/cache";
import { checkRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser, type Tx } from "@/lib/db/client";
import { parseDateTimeInput, zonedTimeToUtc } from "@/lib/imports/time";
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  deletePurchaseOrder,
  markPurchaseOrderSent,
  receivePurchaseOrder,
  savePurchaseOrder,
} from "@/lib/purchasing";
import { purchasingFormState } from "@/lib/purchasing/form-state";
import { formError, invalidForm, PERMISSION_DENIED, type FormState } from "@/lib/validation/form";
import { idSchema } from "@/lib/validation/ingredients";
import { purchaseOrderInputSchema } from "@/lib/validation/purchasing";
import { deliveryInputSchema } from "@/lib/validation/stock-entry";

// Server Actions for purchase orders (DECISIONS.md 97). Owners and managers
// only; each checks the role again, validates with Zod and writes through the
// RLS client. Line errors come back as `lines.<index>.<ingredientId|amount|unit>`.

async function manager() {
  return checkRole(MANAGER_ROLES);
}

/** Starts a draft for a supplier, filled with its order suggestions when `fromSuggestions` is true. */
export async function createOrderAction(supplierId: string, fromSuggestions: boolean): Promise<FormState & { id?: string }> {
  const membership = await manager();
  if (!membership) return PERMISSION_DENIED;
  const parsed = idSchema.safeParse(supplierId);
  if (!parsed.success) return formError("Choose a supplier.");
  try {
    const id = await withUser((tx) =>
      createPurchaseOrder(tx, membership.locationId, membership.userId, parsed.data, { fromSuggestions: fromSuggestions === true }),
    );
    refresh();
    return { ok: true, id, message: "Order started." };
  } catch (error) {
    return purchasingFormState(error);
  }
}

/** Saves a draft: `{ notes, lines: [{ ingredientId, amount, unit }] }`; `unit` a display unit or "pack:<id>". */
export async function saveOrderAction(id: string, input: unknown): Promise<FormState> {
  const membership = await manager();
  if (!membership) return PERMISSION_DENIED;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return formError("This order no longer exists.");
  const parsed = purchaseOrderInputSchema.safeParse(input);
  if (!parsed.success) return invalidForm(parsed.error);
  try {
    await withUser((tx) => savePurchaseOrder(tx, membership.locationId, parsedId.data, parsed.data));
    refresh();
    return { ok: true, message: "Order saved." };
  } catch (error) {
    return purchasingFormState(error);
  }
}

/** Marks a draft as sent to the supplier (the manager sent the text by e-mail or chat). */
export async function sendOrderAction(id: string): Promise<FormState> {
  return simpleStep(id, (tx, loc, user, orderId) => markPurchaseOrderSent(tx, loc, user, orderId), "Order marked as sent.");
}

export async function cancelOrderAction(id: string): Promise<FormState> {
  return simpleStep(id, (tx, loc, _user, orderId) => cancelPurchaseOrder(tx, loc, orderId), "Order cancelled.");
}

export async function deleteOrderAction(id: string): Promise<FormState> {
  return simpleStep(id, (tx, loc, _user, orderId) => deletePurchaseOrder(tx, loc, orderId), "Draft deleted.");
}

async function simpleStep(
  id: string,
  step: (tx: Tx, locationId: string, userId: string, orderId: string) => Promise<void>,
  message: string,
): Promise<FormState> {
  const membership = await manager();
  if (!membership) return PERMISSION_DENIED;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return formError("This order no longer exists.");
  try {
    await withUser((tx) => step(tx, membership.locationId, membership.userId, parsed.data));
    refresh();
    return { ok: true, message };
  } catch (error) {
    return purchasingFormState(error);
  }
}

/**
 * The goods arrived: logs what really came as a delivery and marks the order
 * received. `input` is the delivery form's: `{ clientId, supplierName, deliveredAt, lines }`
 * (`supplierName` is ignored: it is the order's supplier). A retried submit
 * with the same `clientId` logs nothing twice.
 */
export async function receiveOrderAction(id: string, input: unknown): Promise<FormState & { deliveryId?: string }> {
  const membership = await manager();
  if (!membership) return PERMISSION_DENIED;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return formError("This order no longer exists.");
  const parsed = deliveryInputSchema.safeParse(input);
  if (!parsed.success) return invalidForm(parsed.error);
  let deliveredAt = new Date();
  if (parsed.data.deliveredAt !== "") {
    const local = parseDateTimeInput(parsed.data.deliveredAt);
    if (!local) return { ok: false, message: "Please check the highlighted fields.", errors: { deliveredAt: ["Enter a valid date and time."] } };
    deliveredAt = zonedTimeToUtc(local, membership.timezone);
  }
  try {
    const result = await withUser((tx) =>
      receivePurchaseOrder(tx, membership.locationId, membership.userId, parsedId.data, {
        clientId: parsed.data.clientId,
        deliveredAt,
        lines: parsed.data.lines,
      }),
    );
    refresh();
    return {
      ok: true,
      deliveryId: result.deliveryId,
      message: result.alreadyReceived ? "This order was already received." : "Order received: the delivery is logged and stock is up.",
    };
  } catch (error) {
    return purchasingFormState(error);
  }
}
