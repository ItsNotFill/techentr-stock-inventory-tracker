"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { FormMessage, fieldErrors } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useHydrated } from "@/hooks/use-hydrated";
import { emptyFormState } from "@/lib/validation/form";
import { signUp } from "../actions";

export function SignUpForm() {
  // Unique per form: Next.js keeps earlier screens in the page (hidden), and two
  // forms with the same field ids would cross their labels.
  const uid = useId();
  const [state, formAction, pending] = useActionState(signUp, emptyFormState);
  const hydrated = useHydrated();
  // Controlled: React resets uncontrolled fields after every action, failed ones included.
  const [email, setEmail] = useState("");

  if (state.ok) {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage state={state} />
        <Button asChild variant="outline" size="lg">
          <Link href="/login">Go to log in</Link>
        </Button>
      </div>
    );
  }

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
          <Input id={`${uid}-password`} name="password" type="password" autoComplete="new-password" required />
          <FieldDescription>At least 8 characters.</FieldDescription>
          <FieldError errors={fieldErrors(state, "password")} />
        </Field>
        <Button type="submit" size="lg" disabled={pending || !hydrated}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary underline underline-offset-4 hover:decoration-2">
            Log in
          </Link>
        </p>
      </FieldGroup>
    </form>
  );
}
