"use client";

import { useActionState, useMemo, useState } from "react";
import { saveRestaurantDetails } from "@/app/(app)/settings/actions";
import { FormMessage, fieldErrors } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { emptyFormState } from "@/lib/validation/form";

type Props = { name: string; posProvider: string | null; timezone: string };

export function RestaurantForm({ name, posProvider, timezone }: Props) {
  const [state, formAction, pending] = useActionState(saveRestaurantDetails, emptyFormState);
  const [zone, setZone] = useState(timezone);

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
          <FieldLabel htmlFor="restaurant-name">Name</FieldLabel>
          <Input id="restaurant-name" name="name" defaultValue={name} required maxLength={80} className="h-11" />
          <FieldError errors={fieldErrors(state, "name")} />
        </Field>
        <Field data-invalid={Boolean(state.errors?.posProvider)}>
          <FieldLabel htmlFor="pos-provider">POS system (optional)</FieldLabel>
          <Input
            id="pos-provider"
            name="posProvider"
            defaultValue={posProvider ?? ""}
            placeholder="Lightspeed, Square, …"
            maxLength={60}
            className="h-11"
          />
          <FieldError errors={fieldErrors(state, "posProvider")} />
        </Field>
        <Field data-invalid={Boolean(state.errors?.timezone)}>
          <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
          <Select name="timezone" value={zone} onValueChange={setZone}>
            <SelectTrigger id="timezone" className="h-11 w-full">
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
