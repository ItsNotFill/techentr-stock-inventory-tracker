"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { saveRestaurantDetails } from "@/app/(app)/settings/actions";
import { FormMessage, fieldErrors } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { emptyFormState } from "@/lib/validation/form";

type Props = { name: string; posProvider: string | null; timezone: string };

export function RestaurantForm({ name, posProvider, timezone }: Props) {
  // Unique per form: Next.js keeps earlier screens in the page (hidden), and two
  // forms with the same field ids would cross their labels.
  const uid = useId();
  const [state, formAction, pending] = useActionState(saveRestaurantDetails, emptyFormState);
  const [zone, setZone] = useState(timezone);
  // Controlled: React resets uncontrolled fields after every action, which would
  // undo what was typed when a save fails.
  const [nameValue, setNameValue] = useState(name);
  const [posValue, setPosValue] = useState(posProvider ?? "");

  // Computed in the browser; the current value is always in the list.
  const zones = useMemo(() => {
    let list: string[] = [];
    try {
      list = Intl.supportedValuesOf("timeZone");
    } catch {
      list = [];
    }
    return list.includes(timezone) ? list : [timezone, ...list];
  }, [timezone]);

  return (
    <form action={formAction} noValidate>
      <FieldGroup>
        <FormMessage state={state} />
        <Field data-invalid={Boolean(state.errors?.name)}>
          <FieldLabel htmlFor={`${uid}-restaurant-name`}>Name</FieldLabel>
          <Input
            id={`${uid}-restaurant-name`}
            name="name"
            value={nameValue}
            onChange={(event) => setNameValue(event.target.value)}
            required
            maxLength={80}
            className="h-11"
          />
          <FieldError errors={fieldErrors(state, "name")} />
        </Field>
        <Field data-invalid={Boolean(state.errors?.posProvider)}>
          <FieldLabel htmlFor={`${uid}-pos-provider`}>POS system (optional)</FieldLabel>
          <Input
            id={`${uid}-pos-provider`}
            name="posProvider"
            value={posValue}
            onChange={(event) => setPosValue(event.target.value)}
            placeholder="Lightspeed, Square, …"
            maxLength={60}
            className="h-11"
          />
          <FieldError errors={fieldErrors(state, "posProvider")} />
        </Field>
        <Field data-invalid={Boolean(state.errors?.timezone)}>
          <FieldLabel htmlFor={`${uid}-timezone`}>Timezone</FieldLabel>
          <Select name="timezone" value={zone} onValueChange={setZone}>
            <SelectTrigger id={`${uid}-timezone`} className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {zones.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>Decides which day a sale or a count belongs to.</FieldDescription>
          <FieldError errors={fieldErrors(state, "timezone")} />
        </Field>
        <Button type="submit" size="lg" disabled={pending} className="h-11 sm:w-fit">
          {pending ? "Saving…" : "Save details"}
        </Button>
      </FieldGroup>
    </form>
  );
}
