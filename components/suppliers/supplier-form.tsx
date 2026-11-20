"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveSupplierAction } from "@/app/(app)/suppliers/actions";
import { FormMessage, fieldErrors } from "@/components/form-message";
import { CONTROL_HEIGHT } from "@/components/ingredients/units";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { emptyFormState, type FormState } from "@/lib/validation/form";

export type SupplierFormDefaults = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  notes: string;
};

export const NEW_SUPPLIER_DEFAULTS: SupplierFormDefaults = { name: "", contactName: "", email: "", phone: "", notes: "" };

/** Shared by the add and edit screens. `id` is null when adding. */
export function SupplierForm({ id, defaults }: { id: string | null; defaults: SupplierFormDefaults }) {
  // Unique per form: earlier screens stay in the page (hidden), so fixed ids would cross labels.
  const uid = useId();
  const router = useRouter();
  const editing = id !== null;
  const [values, setValues] = useState(defaults);
  const [state, setState] = useState<FormState>(emptyFormState);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof SupplierFormDefaults) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  const invalid = (name: string) => Boolean(state.errors?.[name]);

  function save() {
    startTransition(async () => {
      const result = await saveSupplierAction(id, values);
      setState(result);
      if (result.ok) {
        toast.success(result.message);
        if (!editing && result.id) {
          // The "new" screen stays in the page while hidden; empty it for the next visit.
          setValues(defaults);
          setState(emptyFormState);
          router.push(`/suppliers/${result.id}`);
        }
      }
    });
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <FieldGroup>
        {state.ok && !editing ? null : <FormMessage state={state} />}

        <Field data-invalid={invalid("name")}>
          <FieldLabel htmlFor={`${uid}-name`}>Name</FieldLabel>
          <Input
            id={`${uid}-name`}
            className={CONTROL_HEIGHT}
            value={values.name}
            onChange={(event) => set("name")(event.target.value)}
            autoComplete="off"
            required
            aria-invalid={invalid("name")}
          />
          <FieldError errors={fieldErrors(state, "name")} />
        </Field>

        <Field data-invalid={invalid("contactName")}>
          <FieldLabel htmlFor={`${uid}-contactName`}>Contact name</FieldLabel>
          <Input
            id={`${uid}-contactName`}
            className={CONTROL_HEIGHT}
            value={values.contactName}
            onChange={(event) => set("contactName")(event.target.value)}
            autoComplete="off"
            aria-invalid={invalid("contactName")}
          />
          <FieldError errors={fieldErrors(state, "contactName")} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={invalid("email")}>
            <FieldLabel htmlFor={`${uid}-email`}>E-mail</FieldLabel>
            <Input
              id={`${uid}-email`}
              type="email"
              inputMode="email"
              className={CONTROL_HEIGHT}
              value={values.email}
              onChange={(event) => set("email")(event.target.value)}
              autoComplete="off"
              aria-invalid={invalid("email")}
            />
            <FieldError errors={fieldErrors(state, "email")} />
          </Field>
          <Field data-invalid={invalid("phone")}>
            <FieldLabel htmlFor={`${uid}-phone`}>Phone</FieldLabel>
            <Input
              id={`${uid}-phone`}
              type="tel"
              inputMode="tel"
              className={CONTROL_HEIGHT}
              value={values.phone}
              onChange={(event) => set("phone")(event.target.value)}
              autoComplete="off"
              aria-invalid={invalid("phone")}
            />
            <FieldError errors={fieldErrors(state, "phone")} />
          </Field>
        </div>

        <Field data-invalid={invalid("notes")}>
          <FieldLabel htmlFor={`${uid}-notes`}>Notes</FieldLabel>
          <Textarea
            id={`${uid}-notes`}
            value={values.notes}
            onChange={(event) => set("notes")(event.target.value)}
            placeholder="Ordering days, minimum order, account number…"
            aria-invalid={invalid("notes")}
          />
          <FieldDescription>Only your team sees this.</FieldDescription>
          <FieldError errors={fieldErrors(state, "notes")} />
        </Field>

        <Button type="submit" size="lg" className="sm:w-fit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Add supplier"}
        </Button>
      </FieldGroup>
    </form>
  );
}
