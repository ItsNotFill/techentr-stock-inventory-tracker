"use server";

import { refresh } from "next/cache";
import { checkRole } from "@/lib/auth/membership";
import { ALL_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import { parseDateTimeInput, zonedTimeToUtc } from "@/lib/imports/time";
import { formatQty, toDecimal } from "@/lib/units";
import { formError, invalidForm, PERMISSION_DENIED, type FormState } from "@/lib/validation/form";
import { wasteInputSchema } from "@/lib/validation/stock-entry";
import { logWaste, WasteError } from "@/lib/waste";

// Server Actions for the Log waste screen. Anyone on the team logs waste.
// The action checks the role again, validates its input, and runs through the
// RLS client; lib/waste writes the movement through lib/ledger.

/**
 * Logs waste: one negative stock movement with a reason.
 *
 * `input`: `{ clientId, ingredientId, amount, unit, reason, note, occurredAt }`
 * - `clientId`: crypto.randomUUID() made when the form opens; send the same
 *   one again when retrying, and make a new one after a success.
 * - `amount` as typed ("1,5"); `unit` a display unit (g, kg, ml, cl, l, unit)
 *   or "pack:<pack size id>".
 * - `reason`: expired, dropped, burnt or other (`WASTE_REASON_LABELS`).
 * - `occurredAt`: "" for now, or an `<input type="datetime-local">` value,
 *   read in the restaurant's timezone.
 *
 * Field errors come back under the field's name (`errors["amount"]`, ...).
 */
export async function logWasteAction(input: unknown): Promise<FormState> {
  const membership = await checkRole(ALL_ROLES);
  if (!membership) return PERMISSION_DENIED;
  const parsed = wasteInputSchema.safeParse(input);
  if (!parsed.success) return invalidForm(parsed.error);
  const values = parsed.data;

  let occurredAt = new Date();
  if (values.occurredAt !== "") {
    const local = parseDateTimeInput(values.occurredAt);
    if (!local) return { ok: false, message: "Please check the highlighted fields.", errors: { occurredAt: ["Enter a valid date and time."] } };
    occurredAt = zonedTimeToUtc(local, membership.timezone);
  }

  try {
    const logged = await withUser((tx) =>
      logWaste(tx, membership.locationId, membership.userId, { ...values, occurredAt }),
    );
    refresh();
    const what = `${formatQty(toDecimal(logged.qtyDelta).abs(), logged.baseUnit)} of ${logged.ingredientName}`;
    return { ok: true, message: logged.alreadyLogged ? `This waste was already logged (${what}).` : `Waste logged: ${what}.` };
  } catch (error) {
    if (error instanceof WasteError) {
      return error.field
        ? { ok: false, message: "Please check the highlighted fields.", errors: { [error.field]: [error.message] } }
        : formError(error.message);
    }
    // Two submits of the same waste raced each other; the other one won.
    if (isUniqueViolation(error)) return formError("This waste was already logged. Reload the page to see it.");
    throw error;
  }
}
