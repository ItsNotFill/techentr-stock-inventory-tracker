"use client";

import { useRouter } from "next/navigation";
import { useActionState, useId, useState } from "react";
import { toast } from "sonner";
import { saveMenuItem } from "@/app/(app)/menu/actions";
import { FormMessage, fieldErrors } from "@/components/form-message";
import { CONTROL_HEIGHT, SELECT_HEIGHT } from "@/components/ingredients/units";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { emptyFormState, type FormState } from "@/lib/validation/form";
import type { MENU_ITEM_KINDS } from "@/lib/validation/menu";

type Kind = (typeof MENU_ITEM_KINDS)[number];

export type MenuItemFormDefaults = {
  id?: string;
  posName: string;
  displayName: string;
  posItemId: string;
  kind: Kind;
  category: string;
  price: string;
};

export const NEW_MENU_ITEM_DEFAULTS: MenuItemFormDefaults = {
  posName: "",
  displayName: "",
  posItemId: "",
  kind: "item",
  category: "",
  price: "",
};

const KIND_LABELS: Record<Kind, string> = {
  item: "Item",
  modifier: "Modifier (for example extra cheese)",
};

/** Shared by the add and edit screens. */
export function MenuItemForm({ defaults }: { defaults: MenuItemFormDefaults }) {
  // Unique per form: Next.js keeps earlier screens in the page (hidden), and two
  // forms with the same field ids would cross their labels.
  const uid = useId();
  const router = useRouter();
  const editing = Boolean(defaults.id);

  // Controlled, so a failed save or React's form reset never wipes what was typed.
  const [values, setValues] = useState(defaults);
  const set = (key: keyof MenuItemFormDefaults) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const [state, formAction, pending] = useActionState(
    async (previous: FormState, formData: FormData) => {
      const result = await saveMenuItem(previous, formData);
      if (result.ok) {
        toast.success(result.message);
        if (!editing && result.id) {
          // The "new" screen stays in the page while hidden; empty it for the next visit.
          setValues(defaults);
          router.push(`/menu/${result.id}`);
        }
      }
      return result;
    },
    emptyFormState as FormState & { id?: string },
  );

  const invalid = (name: string) => Boolean(state.errors?.[name]);

  return (
    <form action={formAction} noValidate>
      <FieldGroup>
        {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
        {/* After a create the screen moves on; a toast says it worked. */}
        {state.ok && !editing ? null : <FormMessage state={state} />}

        <Field data-invalid={invalid("posName")}>
          <FieldLabel htmlFor={`${uid}-posName`}>POS name</FieldLabel>
          <Input
            id={`${uid}-posName`}
            name="posName"
            className={CONTROL_HEIGHT}
            value={values.posName}
            onChange={(event) => set("posName")(event.target.value)}
            autoComplete="off"
            required
            aria-invalid={invalid("posName")}
          />
          <FieldDescription>Exactly as it appears on the POS and in its sales export.</FieldDescription>
          <FieldError errors={fieldErrors(state, "posName")} />
        </Field>

        <Field data-invalid={invalid("displayName")}>
          <FieldLabel htmlFor={`${uid}-displayName`}>Display name (optional)</FieldLabel>
          <Input
            id={`${uid}-displayName`}
            name="displayName"
            className={CONTROL_HEIGHT}
            value={values.displayName}
            onChange={(event) => set("displayName")(event.target.value)}
            placeholder="Same as POS name"
            autoComplete="off"
            aria-invalid={invalid("displayName")}
          />
          <FieldError errors={fieldErrors(state, "displayName")} />
        </Field>

        <Field data-invalid={invalid("posItemId")}>
          <FieldLabel htmlFor={`${uid}-posItemId`}>POS item id (optional)</FieldLabel>
          <Input
            id={`${uid}-posItemId`}
            name="posItemId"
            className={CONTROL_HEIGHT}
            value={values.posItemId}
            onChange={(event) => set("posItemId")(event.target.value)}
            autoComplete="off"
            aria-invalid={invalid("posItemId")}
          />
          <FieldDescription>Only if your POS export has an id per item.</FieldDescription>
          <FieldError errors={fieldErrors(state, "posItemId")} />
        </Field>

        <Field data-invalid={invalid("kind")}>
          <FieldLabel htmlFor={`${uid}-kind`}>Type</FieldLabel>
          <Select name="kind" value={values.kind} onValueChange={set("kind")}>
            <SelectTrigger id={`${uid}-kind`} className={SELECT_HEIGHT} aria-invalid={invalid("kind")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_LABELS) as Kind[]).map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={fieldErrors(state, "kind")} />
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
              placeholder="Pizza, Drinks…"
            />
            <FieldError errors={fieldErrors(state, "category")} />
          </Field>
          <Field data-invalid={invalid("price")}>
            <FieldLabel htmlFor={`${uid}-price`}>Price (€)</FieldLabel>
            <Input
              id={`${uid}-price`}
              name="price"
              inputMode="decimal"
              className={CONTROL_HEIGHT}
              value={values.price}
              onChange={(event) => set("price")(event.target.value)}
              placeholder="0.00"
              aria-invalid={invalid("price")}
            />
            <FieldError errors={fieldErrors(state, "price")} />
          </Field>
        </div>

        {/* On the item's page "Save recipe" is the main action, so this one is secondary there. */}
        <Button type="submit" variant={editing ? "outline" : "default"} size="lg" className="sm:w-fit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Add item"}
        </Button>
      </FieldGroup>
    </form>
  );
}
