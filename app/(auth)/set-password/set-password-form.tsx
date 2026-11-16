"use client";

import { useActionState, useId } from "react";
import { FormMessage, fieldErrors } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { emptyFormState } from "@/lib/validation/form";
import { setPassword } from "../actions";

export function SetPasswordForm() {
  // Unique per form: Next.js keeps earlier screens in the page (hidden), and two
  // forms with the same field ids would cross their labels.
  const uid = useId();
  const [state, formAction, pending] = useActionState(setPassword, emptyFormState);

  return (
    <form action={formAction} noValidate>
      <FieldGroup>
        <FormMessage state={state} />
        <Field data-invalid={Boolean(state.errors?.password)}>
          <FieldLabel htmlFor={`${uid}-password`}>New password</FieldLabel>
          <Input id={`${uid}-password`} name="password" type="password" autoComplete="new-password" required />
          <FieldDescription>At least 8 characters.</FieldDescription>
          <FieldError errors={fieldErrors(state, "password")} />
        </Field>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save password"}
        </Button>
      </FieldGroup>
    </form>
  );
}
