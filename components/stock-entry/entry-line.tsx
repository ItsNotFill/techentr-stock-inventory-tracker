"use client";

import { Trash2 } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { EntryOption } from "@/lib/ingredients";
import { DISPLAY_UNITS } from "@/lib/units";
import { PACK_UNIT_PREFIX } from "@/lib/units/entry";
import { cn } from "@/lib/utils";
import { defaultUnit, equivalent, type EntryValue } from "./entry";

const nativeSelect =
  "h-14 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base text-foreground transition-colors outline-none hover:border-muted-foreground/50 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive md:h-12";

export type EntryLineErrors = { ingredientId?: string; amount?: string; unit?: string };

/**
 * One item of a delivery or waste form: ingredient picker, amount and
 * unit-or-pack, with the amount in base units shown underneath. Controlled:
 * the parent owns the value. Big touch targets (56 px on a phone).
 */
export function EntryLine({
  number,
  groups,
  options,
  value,
  errors,
  onChange,
  onRemove,
}: {
  /** 1-based, for the card title. */
  number: number;
  groups: [string, EntryOption[]][];
  options: EntryOption[];
  value: EntryValue;
  errors?: EntryLineErrors;
  onChange: (next: EntryValue) => void;
  /** Present when there is more than one line. */
  onRemove?: () => void;
}) {
  const uid = useId();
  const ingredient = options.find((option) => option.id === value.ingredientId);
  const preview = ingredient ? equivalent(ingredient, value.amount, value.unit) : null;
  const hasError = Boolean(errors?.ingredientId || errors?.amount || errors?.unit);

  return (
    <li className={cn("flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm", hasError ? "border-destructive" : "border-border")}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Item {number}</h3>
        {onRemove ? (
          <Button type="button" variant="destructive-outline" size="icon" onClick={onRemove}>
            <Trash2 aria-hidden />
            <span className="sr-only">Remove item {number}</span>
          </Button>
        ) : null}
      </div>

      <Field data-invalid={errors?.ingredientId ? true : undefined}>
        <FieldLabel htmlFor={`${uid}-ingredient`}>Ingredient</FieldLabel>
        <select
          id={`${uid}-ingredient`}
          className={nativeSelect}
          value={value.ingredientId}
          aria-invalid={errors?.ingredientId ? true : undefined}
          onChange={(event) => {
            const next = options.find((option) => option.id === event.target.value);
            onChange({ ...value, ingredientId: event.target.value, unit: next ? defaultUnit(next) : "" });
          }}
        >
          <option value="">Choose an ingredient</option>
          {groups.map(([area, items]) => (
            <optgroup key={area} label={area}>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <FieldError errors={errors?.ingredientId ? [{ message: errors.ingredientId }] : undefined} />
      </Field>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,10rem)] gap-2">
        <Field data-invalid={errors?.amount ? true : undefined}>
          <FieldLabel htmlFor={`${uid}-amount`}>Amount</FieldLabel>
          <Input
            id={`${uid}-amount`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={value.amount}
            aria-invalid={errors?.amount ? true : undefined}
            className="h-14 text-xl font-medium tabular-nums md:h-12 md:text-lg"
            onChange={(event) => onChange({ ...value, amount: event.target.value })}
          />
        </Field>
        <Field data-invalid={errors?.unit ? true : undefined}>
          <FieldLabel htmlFor={`${uid}-unit`}>Unit</FieldLabel>
          <select
            id={`${uid}-unit`}
            className={nativeSelect}
            value={value.unit}
            disabled={!ingredient}
            aria-invalid={errors?.unit ? true : undefined}
            onChange={(event) => onChange({ ...value, unit: event.target.value })}
          >
            {ingredient ? (
              <>
                {ingredient.packSizes.map((pack) => (
                  <option key={pack.id} value={`${PACK_UNIT_PREFIX}${pack.id}`}>
                    {pack.label}
                  </option>
                ))}
                {DISPLAY_UNITS[ingredient.baseUnit].map((entry) => (
                  <option key={entry.unit} value={entry.unit}>
                    {entry.unit}
                  </option>
                ))}
              </>
            ) : (
              <option value="">–</option>
            )}
          </select>
        </Field>
      </div>
      <FieldError errors={[errors?.amount, errors?.unit].filter((m): m is string => Boolean(m)).map((message) => ({ message }))} />
      <p className="min-h-5 text-sm text-muted-foreground tabular-nums" aria-live="polite">
        {preview ? `= ${preview}` : ""}
      </p>
    </li>
  );
}
