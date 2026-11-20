"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { savePrepRecipeAction } from "@/app/(app)/prep/actions";
import { FormMessage } from "@/components/form-message";
import { BASE_UNIT_LABELS, CONTROL_HEIGHT, DEFAULT_DISPLAY_UNIT, SELECT_HEIGHT } from "@/components/ingredients/units";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DISPLAY_UNITS,
  formatMoney,
  formatUnitCost,
  parseQuantityInput,
  toBaseUnits,
  toDecimal,
  type BaseUnit,
} from "@/lib/units";
import { emptyFormState, type FormState } from "@/lib/validation/form";
import { BASE_UNITS } from "@/lib/validation/ingredients";
import Decimal from "decimal.js";

/** Something a prep recipe can use: an ingredient or another prep recipe, with today's cost per base unit. */
export type PrepOption = {
  /** "i:<id>" for an ingredient, "p:<id>" for a prep recipe. */
  value: string;
  kind: "ingredient" | "prep";
  name: string;
  baseUnit: BaseUnit;
  costPerBaseUnit: string | null;
};

export type PrepLineDefaults = { target: string; amount: string; unit: string };

export type PrepFormDefaults = {
  name: string;
  baseUnit: BaseUnit;
  yieldAmount: string;
  yieldUnit: string;
  category: string;
  lines: PrepLineDefaults[];
};

export const NEW_PREP_DEFAULTS: PrepFormDefaults = {
  name: "",
  baseUnit: "g",
  yieldAmount: "",
  yieldUnit: DEFAULT_DISPLAY_UNIT.g,
  category: "",
  lines: [{ target: "", amount: "", unit: "" }],
};

type LineState = PrepLineDefaults & { key: number };

const BASE_UNIT_HINTS: Record<BaseUnit, string> = {
  g: "Weight: it is made and used in grams or kilograms.",
  ml: "Volume: it is made and used in millilitres or litres.",
  unit: "Pieces: it is counted one by one, such as dough balls.",
};

function UnitSelect({
  id,
  baseUnit,
  value,
  onChange,
  invalid,
  label,
}: {
  id: string;
  baseUnit: BaseUnit;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className={SELECT_HEIGHT} aria-invalid={invalid} aria-label={label}>
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

/** Amount in display units times a cost per base unit; null when it cannot be worked out. */
function lineCost(line: PrepLineDefaults, option: PrepOption | undefined): { cost: Decimal | null; known: boolean } {
  if (!option) return { cost: null, known: true };
  const amount = parseQuantityInput(line.amount);
  if (!amount || !amount.gt(0) || !DISPLAY_UNITS[option.baseUnit].some((entry) => entry.unit === line.unit)) {
    return { cost: null, known: true };
  }
  if (option.costPerBaseUnit === null) return { cost: null, known: false };
  return { cost: toBaseUnits(amount, line.unit, option.baseUnit).times(toDecimal(option.costPerBaseUnit)), known: true };
}

/** Shared by the add and edit screens. */
export function PrepRecipeForm({
  id,
  defaults,
  options,
  baseUnitLocked = false,
}: {
  /** Null when adding. */
  id: string | null;
  defaults: PrepFormDefaults;
  /** Everything a line can use, except the prep recipe being edited. */
  options: PrepOption[];
  /** Menu items or other prep recipes use it, so the unit cannot change. */
  baseUnitLocked?: boolean;
}) {
  // Unique per form: Next.js keeps earlier screens in the page (hidden).
  const uid = useId();
  const router = useRouter();
  const editing = id !== null;

  const [values, setValues] = useState({
    name: defaults.name,
    baseUnit: defaults.baseUnit,
    yieldAmount: defaults.yieldAmount,
    yieldUnit: defaults.yieldUnit,
    category: defaults.category,
  });
  const [nextKey, setNextKey] = useState(defaults.lines.length);
  const [lines, setLines] = useState<LineState[]>(defaults.lines.map((line, index) => ({ ...line, key: index })));
  const [state, setState] = useState<FormState>(emptyFormState);
  const [pending, startTransition] = useTransition();

  const optionByValue = new Map(options.map((option) => [option.value, option]));
  const ingredientOptions = options.filter((option) => option.kind === "ingredient");
  const prepOptions = options.filter((option) => option.kind === "prep");

  const setValue = (key: keyof typeof values) => (value: string) => setValues((current) => ({ ...current, [key]: value }));

  function changeBaseUnit(next: string) {
    const baseUnit = next as BaseUnit;
    setValues((current) => ({ ...current, baseUnit, yieldUnit: DEFAULT_DISPLAY_UNIT[baseUnit] }));
  }

  function updateLine(key: number, patch: Partial<PrepLineDefaults>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function chooseTarget(key: number, target: string) {
    const option = optionByValue.get(target);
    updateLine(key, { target, unit: option ? DEFAULT_DISPLAY_UNIT[option.baseUnit] : "" });
  }

  function addLine() {
    setLines((current) => [...current, { key: nextKey, target: "", amount: "", unit: "" }]);
    setNextKey((current) => current + 1);
  }

  function removeLine(key: number) {
    setLines((current) => (current.length > 1 ? current.filter((line) => line.key !== key) : current));
  }

  function save() {
    startTransition(async () => {
      const result = await savePrepRecipeAction(id, values, lines.map((line) => {
        const option = optionByValue.get(line.target);
        return {
          ingredientId: option?.kind === "ingredient" ? option.value.slice(2) : null,
          subRecipeId: option?.kind === "prep" ? option.value.slice(2) : null,
          amount: line.amount,
          unit: line.unit,
        };
      }));
      setState(result);
      if (result.ok) {
        toast.success(result.message);
        if (!editing && result.id) {
          // The "new" screen stays in the page while hidden; empty it for the next visit.
          setValues({ name: defaults.name, baseUnit: defaults.baseUnit, yieldAmount: "", yieldUnit: defaults.yieldUnit, category: "" });
          setLines(defaults.lines.map((line, index) => ({ ...line, key: index })));
          setNextKey(defaults.lines.length);
          router.push(`/prep/${result.id}`);
        }
      }
    });
  }

  const invalid = (name: string) => Boolean(state.errors?.[name]);
  const errorsOf = (name: string) => state.errors?.[name]?.map((message) => ({ message }));

  // The batch cost, live. Decimal throughout; nothing here uses JS numbers.
  const costs = lines.map((line) => lineCost(line, optionByValue.get(line.target)));
  const total = costs.reduce((sum, entry) => (entry.cost ? sum.plus(entry.cost) : sum), new Decimal(0));
  const missingCost = costs.some((entry) => !entry.known);
  const yieldAmount = parseQuantityInput(values.yieldAmount);
  const yieldBase =
    yieldAmount && yieldAmount.gt(0) && DISPLAY_UNITS[values.baseUnit].some((entry) => entry.unit === values.yieldUnit)
      ? toBaseUnits(yieldAmount, values.yieldUnit, values.baseUnit)
      : null;
  const anyCost = costs.some((entry) => entry.cost !== null);

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
            onChange={(event) => setValue("name")(event.target.value)}
            placeholder="Tomato sauce"
            autoComplete="off"
            required
            aria-invalid={invalid("name")}
          />
          <FieldError errors={errorsOf("name")} />
        </Field>

        <Field data-invalid={invalid("baseUnit")}>
          <FieldLabel htmlFor={`${uid}-baseUnit`}>Measured in</FieldLabel>
          <Select value={values.baseUnit} onValueChange={changeBaseUnit} disabled={baseUnitLocked}>
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
            {baseUnitLocked
              ? "The unit cannot change while menu items or other prep recipes use it."
              : BASE_UNIT_HINTS[values.baseUnit]}
          </FieldDescription>
          <FieldError errors={errorsOf("baseUnit")} />
        </Field>

        <Field data-invalid={invalid("yieldAmount") || invalid("yieldUnit")}>
          <FieldLabel htmlFor={`${uid}-yieldAmount`}>One batch makes</FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              id={`${uid}-yieldAmount`}
              inputMode="decimal"
              className={CONTROL_HEIGHT}
              value={values.yieldAmount}
              onChange={(event) => setValue("yieldAmount")(event.target.value)}
              placeholder="5"
              aria-invalid={invalid("yieldAmount")}
            />
            <div className="w-28 shrink-0">
              <UnitSelect
                id={`${uid}-yieldUnit`}
                label="Unit of one batch"
                baseUnit={values.baseUnit}
                value={values.yieldUnit}
                onChange={setValue("yieldUnit")}
                invalid={invalid("yieldUnit")}
              />
            </div>
          </div>
          <FieldDescription>How much you end up with when you make the recipe once.</FieldDescription>
          <FieldError errors={errorsOf("yieldAmount") ?? errorsOf("yieldUnit")} />
        </Field>

        <Field data-invalid={invalid("category")}>
          <FieldLabel htmlFor={`${uid}-category`}>Category (optional)</FieldLabel>
          <Input
            id={`${uid}-category`}
            className={CONTROL_HEIGHT}
            value={values.category}
            onChange={(event) => setValue("category")(event.target.value)}
            placeholder="Sauces, Doughs…"
          />
          <FieldError errors={errorsOf("category")} />
        </Field>

        <section className="flex flex-col gap-3" aria-labelledby={`${uid}-lines`}>
          <div>
            <h2 id={`${uid}-lines`} className="text-base font-semibold text-foreground">
              What goes into one batch
            </h2>
            <p className="text-sm text-muted-foreground">Ingredients, or other prep recipes.</p>
          </div>
          {state.errors?.lines ? <FieldError errors={errorsOf("lines")} /> : null}
          <ul className="flex flex-col gap-3">
            {lines.map((line, index) => {
              const option = optionByValue.get(line.target);
              const lineInvalid = (field: string) => invalid(`lines.${index}.${field}`);
              const lineId = `${uid}-l${line.key}`;
              return (
                <li key={line.key} className="rounded-lg border border-border bg-card p-3 md:p-2">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem_7rem_auto] md:items-start">
                    <Field data-invalid={lineInvalid("ingredientId")}>
                      <FieldLabel htmlFor={`${lineId}-target`} className="md:sr-only">
                        Ingredient or prep recipe
                      </FieldLabel>
                      <Select value={line.target} onValueChange={(next) => chooseTarget(line.key, next)}>
                        <SelectTrigger
                          id={`${lineId}-target`}
                          className={SELECT_HEIGHT}
                          aria-invalid={lineInvalid("ingredientId")}
                          aria-label={`Line ${index + 1}: ingredient or prep recipe`}
                        >
                          <SelectValue placeholder="Choose…" />
                        </SelectTrigger>
                        <SelectContent>
                          {ingredientOptions.length > 0 ? (
                            <SelectGroup>
                              <SelectLabel>Ingredients</SelectLabel>
                              {ingredientOptions.map((entry) => (
                                <SelectItem key={entry.value} value={entry.value}>
                                  {entry.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ) : null}
                          {prepOptions.length > 0 ? (
                            <SelectGroup>
                              <SelectLabel>Prep recipes</SelectLabel>
                              {prepOptions.map((entry) => (
                                <SelectItem key={entry.value} value={entry.value}>
                                  {entry.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ) : null}
                        </SelectContent>
                      </Select>
                      <FieldError errors={errorsOf(`lines.${index}.ingredientId`)} />
                    </Field>
                    <Field data-invalid={lineInvalid("amount")}>
                      <FieldLabel htmlFor={`${lineId}-amount`} className="md:sr-only">
                        Amount
                      </FieldLabel>
                      <Input
                        id={`${lineId}-amount`}
                        inputMode="decimal"
                        className={CONTROL_HEIGHT}
                        value={line.amount}
                        onChange={(event) => updateLine(line.key, { amount: event.target.value })}
                        placeholder="Amount"
                        aria-label={`Line ${index + 1}: amount`}
                        aria-invalid={lineInvalid("amount")}
                      />
                      <FieldError errors={errorsOf(`lines.${index}.amount`)} />
                    </Field>
                    <Field data-invalid={lineInvalid("unit")}>
                      <FieldLabel htmlFor={`${lineId}-unit`} className="md:sr-only">
                        Unit
                      </FieldLabel>
                      {option ? (
                        <UnitSelect
                          id={`${lineId}-unit`}
                          label={`Line ${index + 1}: unit`}
                          baseUnit={option.baseUnit}
                          value={line.unit}
                          onChange={(next) => updateLine(line.key, { unit: next })}
                          invalid={lineInvalid("unit")}
                        />
                      ) : (
                        <div
                          id={`${lineId}-unit`}
                          className={`flex items-center rounded-lg border border-input px-3 text-muted-foreground ${CONTROL_HEIGHT}`}
                        >
                          Unit
                        </div>
                      )}
                      <FieldError errors={errorsOf(`lines.${index}.unit`)} />
                    </Field>
                    <Button
                      type="button"
                      variant="destructive-outline"
                      className="h-11 md:h-10"
                      disabled={lines.length === 1}
                      onClick={() => removeLine(line.key)}
                    >
                      <Trash2 aria-hidden />
                      <span className="md:sr-only">Remove line</span>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div>
            <Button type="button" variant="outline" size="lg" onClick={addLine}>
              <Plus aria-hidden />
              Add line
            </Button>
          </div>
        </section>

        <p className="rounded-lg bg-muted px-4 py-3 text-sm tabular-nums text-foreground" aria-live="polite">
          {anyCost ? (
            <>
              This batch costs <strong className="font-semibold">{formatMoney(total)}</strong>
              {yieldBase && yieldBase.gt(0) ? (
                <>
                  {" · "}
                  <strong className="font-semibold">{formatUnitCost(total.dividedBy(yieldBase), values.baseUnit)}</strong>
                </>
              ) : null}
              {missingCost ? <span className="text-muted-foreground"> (some lines have no cost yet)</span> : null}
            </>
          ) : (
            <span className="text-muted-foreground">Add ingredients with amounts to see what a batch costs.</span>
          )}
        </p>

        <Button type="submit" size="lg" className="sm:w-fit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </FieldGroup>
    </form>
  );
}
