"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage, fieldErrors } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { emptyFormState } from "@/lib/validation/form";
import { login } from "../actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, emptyFormState);

  return (
    <form action={formAction} noValidate>
      <FieldGroup>
        <FormMessage state={state} />
        <Field data-invalid={Boolean(state.errors?.email)}>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
          <FieldError errors={fieldErrors(state, "email")} />
        </Field>
        <Field data-invalid={Boolean(state.errors?.password)}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
          <FieldError errors={fieldErrors(state, "password")} />
        </Field>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Logging in…" : "Log in"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/sign-up" className="font-medium text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </p>
      </FieldGroup>
    </form>
  );
}
