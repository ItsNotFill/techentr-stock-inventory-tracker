"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { FormMessage, fieldErrors } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useHydrated } from "@/hooks/use-hydrated";
import { emptyFormState } from "@/lib/validation/form";
import { login } from "../actions";

export function LoginForm() {
  // Unique per form: Next.js keeps earlier screens in the page (hidden), and two
  // forms with the same field ids would cross their labels.
  const uid = useId();
  const [state, formAction, pending] = useActionState(login, emptyFormState);
  const hydrated = useHydrated();
  // Controlled: React resets uncontrolled fields after every action, which would
  // wipe the address after a wrong password.
  const [email, setEmail] = useState("");

  return (
    <form action={formAction} noValidate>
      <FieldGroup>
        <FormMessage state={state} />
        <Field data-invalid={Boolean(state.errors?.email)}>
          <FieldLabel htmlFor={`${uid}-email`}>E-mail</FieldLabel>
          <Input
            id={`${uid}-email`}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <FieldError errors={fieldErrors(state, "email")} />
        </Field>
        <Field data-invalid={Boolean(state.errors?.password)}>
          <FieldLabel htmlFor={`${uid}-password`}>Password</FieldLabel>
          <Input id={`${uid}-password`} name="password" type="password" autoComplete="current-password" required />
          <FieldError errors={fieldErrors(state, "password")} />
        </Field>
        <Button type="submit" size="lg" disabled={pending || !hydrated}>
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
