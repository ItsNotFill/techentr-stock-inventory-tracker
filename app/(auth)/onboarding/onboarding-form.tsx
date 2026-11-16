"use client";

import { useActionState, useId, useState, useSyncExternalStore } from "react";
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
  // Unique per form: Next.js keeps earlier screens in the page (hidden), and two
  // forms with the same field ids would cross their labels.
  const uid = useId();
  const [state, formAction, pending] = useActionState(completeOnboarding, emptyFormState);
  // Controlled: React resets uncontrolled fields after every action, failed ones included.
  const [restaurantName, setRestaurantName] = useState("");
  // The restaurant's timezone is taken from the browser (SCHEMA.md, locations.timezone).
  const timezone = useSyncExternalStore(subscribe, browserTimezone, serverTimezone);

  return (
    <form action={formAction} noValidate>
      <FieldGroup>
        <FormMessage state={state} />
        <Field data-invalid={Boolean(state.errors?.restaurantName)}>
          <FieldLabel htmlFor={`${uid}-restaurantName`}>Restaurant name</FieldLabel>
          <Input
            id={`${uid}-restaurantName`}
            name="restaurantName"
            autoComplete="organization"
            required
            value={restaurantName}
            onChange={(event) => setRestaurantName(event.target.value)}
          />
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
