import { z } from "zod";
import { parseQuantityInput } from "@/lib/units";

/**
 * A number typed into a form ("1.5", "1,5"), kept as a string so it never
 * becomes a JS float. Use the helpers in lib/units to do maths with it.
 */
export function decimalInput(options: { min?: string; minExclusive?: boolean; max?: string; label?: string } = {}) {
  const { min, minExclusive = false, max = "99999999", label = "This" } = options;
  return z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .transform((value, context) => {
      const parsed = parseQuantityInput(value);
      if (!parsed) {
        context.addIssue({ code: "custom", message: "Enter a number, for example 1.5" });
        return z.NEVER;
      }
      if (min !== undefined && (minExclusive ? parsed.lte(min) : parsed.lt(min))) {
        context.addIssue({
          code: "custom",
          message: minExclusive ? `Must be more than ${min}.` : `Must be ${min} or more.`,
        });
        return z.NEVER;
      }
      if (parsed.gt(max)) {
        context.addIssue({ code: "custom", message: "That number is too large." });
        return z.NEVER;
      }
      return parsed.toString();
    });
}

/** Like decimalInput, but an empty field is allowed and becomes null. */
export function optionalDecimalInput(options: Parameters<typeof decimalInput>[0] = {}) {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .pipe(decimalInput(options).nullable());
}

/** Optional free text: trimmed, empty becomes null. */
export function optionalText(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength, `Use at most ${maxLength} characters.`)
    .transform((value) => (value === "" ? null : value));
}
