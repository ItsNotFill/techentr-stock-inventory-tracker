"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { removePackSize, savePackSize } from "@/app/(app)/ingredients/actions";
import { FormMessage, fieldErrors } from "@/components/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DISPLAY_UNITS, formatQty, toDecimal, type BaseUnit } from "@/lib/units";
import { emptyFormState, type FormState } from "@/lib/validation/form";
import { CONTROL_HEIGHT, DEFAULT_DISPLAY_UNIT, SELECT_HEIGHT } from "./units";

export type PackSizeRow = { id: string; label: string; qtyInBaseUnit: string; isDefault: boolean };

function report(result: FormState) {
  if (result.ok) toast.success(result.message);
  else toast.error(result.message ?? "Something went wrong.");
}

function PackRow({ ingredientId, baseUnit, pack }: { ingredientId: string; baseUnit: BaseUnit; pack: PackSizeRow }) {
  const [pending, startTransition] = useTransition();

  function makeDefault() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("ingredientId", ingredientId);
      formData.set("packSizeId", pack.id);
      formData.set("label", pack.label);
      // Same amount, in the base unit it is stored in (a string, no float).
      formData.set("amount", toDecimal(pack.qtyInBaseUnit).toFixed());
      formData.set("unit", baseUnit);
      formData.set("isDefault", "true");
      report(await savePackSize(emptyFormState, formData));
    });
  }

  function remove() {
    startTransition(async () => report(await removePackSize(pack.id)));
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{pack.label}</span>
          {pack.isDefault ? <Badge variant="info">Default</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">{formatQty(pack.qtyInBaseUnit, baseUnit)}</p>
      </div>
      <div className="flex gap-2">
        {pack.isDefault ? null : (
          <Button type="button" variant="outline" disabled={pending} onClick={makeDefault}>
            Make default
          </Button>
        )}
        <Button type="button" variant="destructive-outline" disabled={pending} onClick={remove}>
          Remove
        </Button>
      </div>
    </li>
  );
}

export function PackSizesEditor({
  ingredientId,
  baseUnit,
  packSizes,
}: {
  ingredientId: string;
  baseUnit: BaseUnit;
  packSizes: PackSizeRow[];
}) {
  // Unique per form: Next.js keeps earlier screens in the page (hidden), and two
  // forms with the same field ids would cross their labels.
  const uid = useId();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<string>(DEFAULT_DISPLAY_UNIT[baseUnit]);
  const [isDefault, setIsDefault] = useState(false);

  const [state, formAction, pending] = useActionState(
    async (previous: FormState, formData: FormData) => {
      const result = await savePackSize(previous, formData);
      if (result.ok) {
        toast.success(result.message);
        setLabel("");
        setAmount("");
        setIsDefault(false);
      }
      return result;
    },
    emptyFormState as FormState & { id?: string },
  );

  const invalid = (name: string) => Boolean(state.errors?.[name]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pack sizes</CardTitle>
        <CardDescription>The ways this ingredient is delivered, for example a case or a bag.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {packSizes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong px-4 py-3 text-sm text-muted-foreground">
            No pack sizes yet. Add the first one below.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border px-3">
            {packSizes.map((pack) => (
              <PackRow key={pack.id} ingredientId={ingredientId} baseUnit={baseUnit} pack={pack} />
            ))}
          </ul>
        )}

        <form action={formAction} noValidate>
          <FieldGroup>
            <input type="hidden" name="ingredientId" value={ingredientId} />
            <FormMessage state={state} />
            <Field data-invalid={invalid("label")}>
              <FieldLabel htmlFor={`${uid}-packLabel`}>Label</FieldLabel>
              <Input
                id={`${uid}-packLabel`}
                name="label"
                className={CONTROL_HEIGHT}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Case 12×1 L"
                autoComplete="off"
                aria-invalid={invalid("label")}
              />
              <FieldError errors={fieldErrors(state, "label")} />
            </Field>
            <Field data-invalid={invalid("amount") || invalid("unit")}>
              <FieldLabel htmlFor={`${uid}-packAmount`}>Amount in one pack</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id={`${uid}-packAmount`}
                  name="amount"
                  inputMode="decimal"
                  className={CONTROL_HEIGHT}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  aria-invalid={invalid("amount")}
                />
                <div className="w-28 shrink-0">
                  <Select name="unit" value={unit} onValueChange={setUnit}>
                    <SelectTrigger id={`${uid}-packUnit`} className={SELECT_HEIGHT} aria-invalid={invalid("unit")}>
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
                </div>
              </div>
              <FieldError errors={fieldErrors(state, "amount") ?? fieldErrors(state, "unit")} />
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id={`${uid}-packDefault`}
                name="isDefault"
                checked={isDefault}
                onCheckedChange={(checked) => setIsDefault(checked === true)}
              />
              <FieldLabel htmlFor={`${uid}-packDefault`} className="font-normal">
                Use as default
              </FieldLabel>
            </Field>
            <Button type="submit" size="lg" className="sm:w-fit" disabled={pending}>
              {pending ? "Adding…" : "Add pack size"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
