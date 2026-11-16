"use client";

import { useActionState } from "react";
import { FormMessage, fieldErrors } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { emptyFormState } from "@/lib/validation/form";
import { setPassword } from "../actions";

export function SetPasswordForm() {
  const [state, formAction, pending] = useActionState(setPassword, emptyFormState);

  return (
    <form action={formAction} noValidate>
      <FieldGroup>
        <FormMessage state={state} />
        <Field data-invalid={Boolean(state.errors?.password)}>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <Input id="password" name="password" type="password" autoComplete="new-password" required />
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
