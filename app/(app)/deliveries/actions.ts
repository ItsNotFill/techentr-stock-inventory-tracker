"use server";

import { refresh } from "next/cache";
import { checkRole } from "@/lib/auth/membership";
import { ALL_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import { DeliveryError, logDelivery } from "@/lib/deliveries";
import { parseDateTimeInput, zonedTimeToUtc } from "@/lib/imports/time";
import { formError, invalidForm, PERMISSION_DENIED, type FormState } from "@/lib/validation/form";
import { deliveryInputSchema } from "@/lib/validation/stock-entry";

// Server Actions for the Log delivery screen. Anyone on the team logs a
// delivery. The action checks the role again, validates its input, and runs
// through the RLS client; lib/deliveries writes the stock movements.

/**
 * Logs a delivery and adds its stock.
 *
 * `input`: `{ clientId, supplierName, deliveredAt, lines: [{ ingredientId, amount, unit }] }`
 * - `clientId`: crypto.randomUUID() made when the form opens; send the same
 *   one again when retrying, and make a new one after a success.
 * - `deliveredAt`: "" for now, or an `<input type="datetime-local">` value,
 *   read in the restaurant's timezone.
 * - `amount` as typed ("1,5"); `unit` a display unit (g, kg, ml, cl, l, unit)
 *   or "pack:<pack size id>".
 *
 * Field errors come back as `errors["deliveredAt"]`, `errors["lines"]` or
 * `errors["lines.<index>.<ingredientId|amount|unit>"]`.
 */
export async function logDeliveryAction(input: unknown): Promise<FormState & { deliveryId?: string }> {
  const membership = await checkRole(ALL_ROLES);
  if (!membership) return PERMISSION_DENIED;
  const parsed = deliveryInputSchema.safeParse(input);
  if (!parsed.success) return invalidForm(parsed.error);
  const values = parsed.data;

  let deliveredAt = new Date();
  if (values.deliveredAt !== "") {
    const local = parseDateTimeInput(values.deliveredAt);
    if (!local) return { ok: false, message: "Please check the highlighted fields.", errors: { deliveredAt: ["Enter a valid date and time."] } };
    deliveredAt = zonedTimeToUtc(local, membership.timezone);
  }

  try {
    const logged = await withUser((tx) =>
      logDelivery(tx, membership.locationId, membership.userId, {
        clientId: values.clientId,
        supplierName: values.supplierName,
        deliveredAt,
        lines: values.lines,
      }),
    );
    refresh();
    const items = `${logged.lineCount} ${logged.lineCount === 1 ? "item" : "items"}`;
    return {
      ok: true,
      deliveryId: logged.id,
      message: logged.alreadyLogged ? `This delivery was already logged (${items}).` : `Delivery logged: ${items} added to stock.`,
    };
  } catch (error) {
    if (error instanceof DeliveryError) {
      return error.field
        ? { ok: false, message: "Please check the highlighted fields.", errors: { [error.field]: [error.message] } }
        : formError(error.message);
    }
    // Two submits of the same delivery raced each other; the other one won.
    if (isUniqueViolation(error)) return formError("This delivery was already logged. Reload the page to see it.");
    throw error;
  }
}
