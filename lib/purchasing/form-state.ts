import { isUniqueViolation } from "@/lib/db/errors";
import { LedgerError } from "@/lib/ledger";
import { DeliveryError } from "@/lib/deliveries";
import { formError, type FormState } from "@/lib/validation/form";
import { PurchasingError } from "./index";

/** A purchasing error as the screens show it: on its field, or as a message. Anything else is thrown on. */
export function purchasingFormState(error: unknown): FormState {
  if (error instanceof PurchasingError || error instanceof DeliveryError) {
    return error.field
      ? { ok: false, message: "Please check the highlighted fields.", errors: { [error.field]: [error.message] } }
      : formError(error.message);
  }
  if (error instanceof LedgerError) return formError(error.message);
  if (isUniqueViolation(error)) return formError("Someone saved the same thing a moment ago. Reload the page and try again.");
  throw error;
}
