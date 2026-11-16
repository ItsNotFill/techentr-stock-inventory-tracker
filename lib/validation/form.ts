import type { z } from "zod";

/**
 * What a form's Server Action returns to `useActionState`.
 * `message` is a general message; `errors` holds messages per field name.
 */
export type FormState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

export const emptyFormState: FormState = { ok: false };

/** Turns a failed Zod parse into a FormState with per-field messages. */
export function invalidForm(error: z.ZodError, message = "Please check the highlighted fields."): FormState {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_form";
    (errors[key] ??= []).push(issue.message);
  }
  return { ok: false, message, errors };
}

export function formError(message: string): FormState {
  return { ok: false, message };
}

export const PERMISSION_DENIED: FormState = {
  ok: false,
  message: "You do not have permission to do this.",
};
