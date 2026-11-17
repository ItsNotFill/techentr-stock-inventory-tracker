"use client";

import { useRouter } from "next/navigation";
import { useActionState, useId, useState } from "react";
import { toast } from "sonner";
import { saveIngredient } from "@/app/(app)/ingredients/actions";
import { FormMessage, fieldErrors } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DISPLAY_UNITS, type BaseUnit } from "@/lib/units";
import { emptyFormState, type FormState } from "@/lib/validation/form";
import { BASE_UNITS } from "@/lib/validation/ingredients";
import { BASE_UNIT_LABELS, CONTROL_HEIGHT, DEFAULT_DISPLAY_UNIT, SELECT_HEIGHT } from "./units";

/** Text values the form starts with. Numbers are strings, already in the readable unit. */
export type IngredientFormDefaults = {
  id?: string;
  name: string;
  baseUnit: BaseUnit;
  costAmount: string;
  costUnit: string;
  reorderPoint: string;
  parLevel: string;
  levelUnit: string;
  category: string;
  storageArea: string;
};

export const NEW_INGREDIENT_DEFAULTS: IngredientFormDefaults = {
  name: "",
  baseUnit: "g",
  costAmount: "",
  costUnit: DEFAULT_DISPLAY_UNIT.g,
  reorderPoint: "",
  parLevel: "",
  levelUnit: DEFAULT_DISPLAY_UNIT.g,
  category: "",
  storageArea: "",
};

function UnitSelect({
  name,
  id,
  baseUnit,
  value,
  onChange,
  invalid,
}: {
  name: string;
  id: string;
  baseUnit: BaseUnit;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  return (
    <Select name={name} value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className={SELECT_HEIGHT} aria-invalid={invalid}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DISPLAY_UNITS[baseUnit].map((entry) => (
          <SelectItem key={entry.unit} value={entry.unit}>
            {entry.unit}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Shared by the add and edit screens. */
export function IngredientForm({
  defaults,
  unitLocked = false,
}: {
  defaults: IngredientFormDefaults;
  /** The ingredient has pack sizes, recipes or stock movements, so the server refuses a unit change. */
  unitLocked?: boolean;
}) {
  // Unique per form: Next.js keeps earlier screens in the page (hidden), and two
  // forms with the same field ids would cross their labels.
  const uid = useId();
  const router = useRouter();
  const editing = Boolean(defaults.id);

  // Controlled, so a failed save or React's form reset never wipes what was typed.
  const [values, setValues] = useState(defaults);
  const set = (key: keyof IngredientFormDefaults) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const [state, formAction, pending] = useActionState(
    async (previous: FormState, formData: FormData) => {
      const result = await saveIngredient(previous, formData);
      if (result.ok) {
        toast.success(result.message);
        if (!editing && result.id) {
          // The "new" screen stays in the page while hidden; empty it for the next visit.
          setValues(defaults);
          router.push(`/ingredients/${result.id}`);
        }
      }
      return result;
    },
    emptyFormState as FormState & { id?: string },
  );

  function changeBaseUnit(next: string) {
    const baseUnit = next as BaseUnit;
    setValues((current) => ({
      ...current,
      baseUnit,
      costUnit: DEFAULT_DISPLAY_UNIT[baseUnit],
      levelUnit: DEFAULT_DISPLAY_UNIT[baseUnit],
    }));
  }

  const invalid = (name: string) => Boolean(state.errors?.[name]);

  return (
    <form action={formAction} noValidate>
      <FieldGroup>
        {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
        {/* After a create the screen moves on; a toast says it worked. */}
        {state.ok && !editing ? null : <FormMessage state={state} />}

        <Field data-invalid={invalid("name")}>
          <FieldLabel htmlFor={`${uid}-name`}>Name</FieldLabel>
          <Input
            id={`${uid}-name`}
            name="name"
            className={CONTROL_HEIGHT}
            value={values.name}
            onChange={(event) => set("name")(event.target.value)}
            autoComplete="off"
            required
            aria-invalid={invalid("name")}
          />
          <FieldError errors={fieldErrors(state, "name")} />
        </Field>

        <Field data-invalid={invalid("baseUnit")}>
          <FieldLabel htmlFor={`${uid}-baseUnit`}>Unit</FieldLabel>
          {/* A disabled select is not submitted, so send the current value by hand. */}
          {unitLocked ? <input type="hidden" name="baseUnit" value={values.baseUnit} /> : null}
          <Select
            name={unitLocked ? undefined : "baseUnit"}
            value={values.baseUnit}
            onValueChange={changeBaseUnit}
            disabled={unitLocked}
          >
            <SelectTrigger id={`${uid}-baseUnit`} className={SELECT_HEIGHT} aria-invalid={invalid("baseUnit")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BASE_UNITS.map((unit) => (
                <SelectItem key={unit} value={unit}>
                  {BASE_UNIT_LABELS[unit]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            {unitLocked
              ? "The unit cannot change once the ingredient has pack sizes, recipes or stock movements."
              : "How this ingredient is counted and stored."}
          </FieldDescription>
          <FieldError errors={fieldErrors(state, "baseUnit")} />
        </Field>

        <Field data-invalid={invalid("costAmount") || invalid("costUnit")}>
          <FieldLabel htmlFor={`${uid}-costAmount`}>Cost (€)</FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              id={`${uid}-costAmount`}
              name="costAmount"
              inputMode="decimal"
              className={CONTROL_HEIGHT}
              value={values.costAmount}
              onChange={(event) => set("costAmount")(event.target.value)}
              placeholder="0.00"
              aria-invalid={invalid("costAmount")}
            />
            <span className="text-sm text-muted-foreground">per</span>
            <div className="w-28 shrink-0">
              <UnitSelect
                name="costUnit"
                id={`${uid}-costUnit`}
                baseUnit={values.baseUnit}
                value={values.costUnit}
                onChange={set("costUnit")}
                invalid={invalid("costUnit")}
              />
            </div>
          </div>
          <FieldError errors={fieldErrors(state, "costAmount") ?? fieldErrors(state, "costUnit")} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={invalid("reorderPoint")}>
            <FieldLabel htmlFor={`${uid}-reorderPoint`}>Reorder point</FieldLabel>
            <Input
              id={`${uid}-reorderPoint`}
              name="reorderPoint"
              inputMode="decimal"
              className={CONTROL_HEIGHT}
              value={values.reorderPoint}
              onChange={(event) => set("reorderPoint")(event.target.value)}
              aria-invalid={invalid("reorderPoint")}
            />
            <FieldDescription>You get a low-stock warning below this.</FieldDescription>
            <FieldError errors={fieldErrors(state, "reorderPoint")} />
          </Field>
          <Field data-invalid={invalid("parLevel")}>
            <FieldLabel htmlFor={`${uid}-parLevel`}>Par level</FieldLabel>
            <Input
              id={`${uid}-parLevel`}
              name="parLevel"
              inputMode="decimal"
              className={CONTROL_HEIGHT}
              value={values.parLevel}
              onChange={(event) => set("parLevel")(event.target.value)}
              aria-invalid={invalid("parLevel")}
            />
            <FieldDescription>How much you want on the shelf after a delivery.</FieldDescription>
            <FieldError errors={fieldErrors(state, "parLevel")} />
          </Field>
        </div>

        <Field data-invalid={invalid("levelUnit")}>
          <FieldLabel htmlFor={`${uid}-levelUnit`}>Unit for reorder point and par level</FieldLabel>
          <div className="w-28">
            <UnitSelect
              name="levelUnit"
              id={`${uid}-levelUnit`}
              baseUnit={values.baseUnit}
              value={values.levelUnit}
              onChange={set("levelUnit")}
              invalid={invalid("levelUnit")}
            />
          </div>
          <FieldError errors={fieldErrors(state, "levelUnit")} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={invalid("category")}>
            <FieldLabel htmlFor={`${uid}-category`}>Category</FieldLabel>
            <Input
              id={`${uid}-category`}
              name="category"
              className={CONTROL_HEIGHT}
              value={values.category}
              onChange={(event) => set("category")(event.target.value)}
              placeholder="Dairy, Dry goods…"
            />
            <FieldError errors={fieldErrors(state, "category")} />
          </Field>
          <Field data-invalid={invalid("storageArea")}>
            <FieldLabel htmlFor={`${uid}-storageArea`}>Storage area</FieldLabel>
            <Input
              id={`${uid}-storageArea`}
              name="storageArea"
              className={CONTROL_HEIGHT}
              value={values.storageArea}
              onChange={(event) => set("storageArea")(event.target.value)}
              placeholder="Walk-in fridge, Dry store…"
            />
            <FieldError errors={fieldErrors(state, "storageArea")} />
          </Field>
        </div>

        <Button type="submit" size="lg" className="h-11" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Add ingredient"}
        </Button>
      </FieldGroup>
    </form>
  );
}
