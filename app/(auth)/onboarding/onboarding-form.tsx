"use client";

import { useActionState, useSyncExternalStore } from "react";
import { FormMessage, fieldErrors } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { emptyFormState } from "@/lib/validation/form";
import { completeOnboarding } from "../actions";

const subscribe = () => () => {};
const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimezone = () => "UTC";

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(completeOnboarding, emptyFormState);
  // The restaurant's timezone is taken from the browser (SCHEMA.md, locations.timezone).
  const timezone = useSyncExternalStore(subscribe, browserTimezone, serverTimezone);

  return (
    <form action={formAction} noValidate>
      <FieldGroup>
        <FormMessage state={state} />
        <Field data-invalid={Boolean(state.errors?.restaurantName)}>
          <FieldLabel htmlFor="restaurantName">Restaurant name</FieldLabel>
          <Input id="restaurantName" name="restaurantName" autoComplete="organization" required />
          <FieldError errors={fieldErrors(state, "restaurantName")} />
        </Field>
        <Field data-invalid={Boolean(state.errors?.timezone)}>
          <input type="hidden" name="timezone" value={timezone} />
          <FieldDescription>Times will be shown in the {timezone} timezone.</FieldDescription>
          <FieldError errors={fieldErrors(state, "timezone")} />
        </Field>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Setting up…" : "Create restaurant"}
        </Button>
      </FieldGroup>
    </form>
  );
}
