"use client";

import { Plus, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveRecipe } from "@/app/(app)/menu/actions";
import { CONTROL_HEIGHT, SELECT_HEIGHT } from "@/components/ingredients/units";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { DISPLAY_UNITS, formatMoney, parseQuantityInput, toBaseUnits, toDecimal, valueOf, type BaseUnit } from "@/lib/units";

export type RecipeIngredientOption = {
  /** Ingredient or prep recipe (DECISIONS.md 96). Left out means an ingredient. */
  kind?: "ingredient" | "prep";
  id: string;
  name: string;
  baseUnit: BaseUnit;
  costPerBaseUnit: string;
  /** Archived ingredients and prep recipes are only offered for a row that already uses them. */
  archived: boolean;
};

/** A recipe line as the editor shows it. `amount` is plain decimal text in `unit`. */
export type RecipeRow = {
  /** `ingredient:<id>` or `prep:<id>`, or empty while nothing is chosen. */
  choice: string;
  amount: string;
  unit: string;
  draft: boolean;
};

type EditorRow = RecipeRow & { key: number };
/** The picker value of an option. */
export const choiceOf = (option: Pick<RecipeIngredientOption, "kind" | "id">) => `${option.kind ?? "ingredient"}:${option.id}`;

/** What a row sends: an ingredient id or a prep recipe id, never both. */
function target(choice: string): { ingredientId: string } | { subRecipeId: string } {
  const [kind, id] = [choice.slice(0, choice.indexOf(":")), choice.slice(choice.indexOf(":") + 1)];
  return kind === "prep" ? { subRecipeId: id } : { ingredientId: id };
}

type RowErrors = { ingredientId?: string; amount?: string; unit?: string };

const FIELDS = ["ingredientId", "amount", "unit"] as const;

/** Rows compared by value, so "0,5" and "0.5" or "120" and "120.0" count as the same. */
function signature(rows: { choice: string; amount: string; unit: string }[]): string {
  return JSON.stringify(
    rows.map((row) => [row.choice, parseQuantityInput(row.amount)?.toFixed() ?? row.amount.trim(), row.unit]),
  );
}

const isBlank = (row: RecipeRow) => row.choice === "" && row.amount.trim() === "";

export function RecipeEditor({
  menuItemId,
  ingredients,
  preps = [],
  initialRows,
  hasRecipe,
  suggestionsWithoutIngredient,
}: {
  menuItemId: string;
  ingredients: RecipeIngredientOption[];
  /** Prep recipes, for the picker. */
  preps?: RecipeIngredientOption[];
  initialRows: RecipeRow[];
  /** The item has a saved recipe now. */
  hasRecipe: boolean;
  /** AI draft lines that still have no ingredient. */
  suggestionsWithoutIngredient: number;
}) {
  const nextKey = useRef(initialRows.length);
  const [rows, setRows] = useState<EditorRow[]>(() => initialRows.map((row, key) => ({ ...row, key })));
  const [errors, setErrors] = useState<Record<number, RowErrors>>({});
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const everything = [
    ...ingredients.map((option) => ({ ...option, kind: "ingredient" as const })),
    ...preps.map((option) => ({ ...option, kind: "prep" as const })),
  ];
  const byId = new Map(everything.map((option) => [choiceOf(option), option]));
  const dirty = signature(rows.filter((row) => !isBlank(row))) !== signature(initialRows);
  const sendable = rows.filter((row) => !isBlank(row));
  const removing = hasRecipe && sendable.length === 0;

  function update(key: number, patch: Partial<RecipeRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    clearErrors(key);
  }

  function clearErrors(key: number) {
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([name]) => Number(name) !== key)));
  }

  function changeChoice(key: number, choice: string) {
    const option = byId.get(choice);
    // The unit starts again at the base unit, because the old choice may not exist for the new ingredient.
    update(key, { choice, unit: option ? option.baseUnit : "" });
  }

  function addRow() {
    const key = nextKey.current++;
    setRows((current) => [...current, { key, choice: "", amount: "", unit: "", draft: false }]);
  }

  function removeRow(key: number) {
    setRows((current) => current.filter((row) => row.key !== key));
    clearErrors(key);
  }

  /** Cost of one row in euros as text, or null while the row is incomplete or not a number. */
  function lineCost(row: RecipeRow) {
    const ingredient = byId.get(row.choice);
    const quantity = parseQuantityInput(row.amount);
    if (!ingredient || !quantity || quantity.isNegative()) return null;
    if (!DISPLAY_UNITS[ingredient.baseUnit].some((entry) => entry.unit === row.unit)) return null;
    return valueOf(toBaseUnits(quantity, row.unit, ingredient.baseUnit), ingredient.costPerBaseUnit);
  }

  const costs = rows.map((row) => lineCost(row));
  const complete = costs.filter((cost) => cost !== null);
  const total = complete.reduce((sum, cost) => sum.plus(cost), toDecimal("0"));

  function save() {
    const sent = rows.filter((row) => !isBlank(row));
    startTransition(async () => {
      const result = await saveRecipe(
        menuItemId,
        sent.map(({ choice, amount, unit }) => ({ ...target(choice), amount, unit })),
      );
      setConfirmOpen(false);
      if (result.ok) {
        setErrors({});
        toast.success(result.message);
        return;
      }
      // Errors come back by position in the list that was sent.
      const next: Record<number, RowErrors> = {};
      for (const [path, messages] of Object.entries(result.errors ?? {})) {
        const match = /^lines\.(\d+)\.(\w+)$/.exec(path);
        const row = match ? sent[Number(match[1])] : undefined;
        const field = FIELDS.find((name) => name === match?.[2]);
        if (row && field && messages?.[0]) next[row.key] = { ...next[row.key], [field]: messages[0] };
      }
      setErrors(next);
      toast.error(result.message ?? "Something went wrong.");
    });
  }

  function onSaveClick() {
    if (removing) setConfirmOpen(true);
    else save();
  }

  const noIngredients = everything.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recipe</CardTitle>
        <CardDescription>
          Saving the recipe makes sales of this item use stock. Make a sauce or dough once and use it here:{" "}
          <Link href="/prep" className="font-medium text-primary underline underline-offset-4">
            Prep recipes
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {suggestionsWithoutIngredient > 0 ? (
          <p className="text-sm text-muted-foreground">
            {suggestionsWithoutIngredient === 1
              ? "1 suggested line still needs an ingredient."
              : `${suggestionsWithoutIngredient} suggested lines still need an ingredient.`}
          </p>
        ) : null}

        {noIngredients && rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            You have no ingredients yet. A recipe is made of ingredients.{" "}
            <Link href="/ingredients/new" className="font-medium text-primary underline underline-offset-4">
              Add an ingredient
            </Link>{" "}
            first.
          </p>
        ) : (
          <>
            {rows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                No ingredients in this recipe yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {rows.map((row, index) => {
                  const ingredient = byId.get(row.choice);
                  const rowErrors = errors[row.key] ?? {};
                  const used = new Set(rows.filter((other) => other.key !== row.key).map((other) => other.choice));
                  const available = (list: RecipeIngredientOption[], kind: "ingredient" | "prep") =>
                    list
                      .map((option) => ({ ...option, kind }))
                      .filter(
                        (option) =>
                          !used.has(choiceOf(option)) && (!option.archived || choiceOf(option) === row.choice),
                      );
                  const ingredientOptions = available(ingredients, "ingredient");
                  const prepOptions = available(preps, "prep");
                  const cost = costs[index];
                  const message = rowErrors.ingredientId ?? rowErrors.amount ?? rowErrors.unit;
                  return (
                    <li key={row.key} className="flex flex-col gap-2 rounded-lg border border-border bg-muted/60 p-3">
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_6rem]">
                        <Select value={row.choice} onValueChange={(value) => changeChoice(row.key, value)}>
                          <SelectTrigger
                            className={SELECT_HEIGHT}
                            aria-label={`Ingredient, line ${index + 1}`}
                            aria-invalid={Boolean(rowErrors.ingredientId)}
                          >
                            <SelectValue placeholder={preps.length > 0 ? "Choose ingredient or prep recipe" : "Choose ingredient"} />
                          </SelectTrigger>
                          <SelectContent>
                            {ingredientOptions.length > 0 ? (
                              <SelectGroup>
                                <SelectLabel>Ingredients</SelectLabel>
                                {ingredientOptions.map((option) => (
                                  <SelectItem key={choiceOf(option)} value={choiceOf(option)}>
                                    {option.name}
                                    {option.archived ? " (archived)" : ""}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            ) : null}
                            {prepOptions.length > 0 ? (
                              <SelectGroup>
                                <SelectLabel>Prep recipes</SelectLabel>
                                {prepOptions.map((option) => (
                                  <SelectItem key={choiceOf(option)} value={choiceOf(option)}>
                                    {option.name}
                                    {option.archived ? " (archived)" : ""}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            ) : null}
                          </SelectContent>
                        </Select>
                        <div className="grid grid-cols-2 gap-2 sm:contents">
                          <Input
                            inputMode="decimal"
                            className={CONTROL_HEIGHT}
                            value={row.amount}
                            onChange={(event) => update(row.key, { amount: event.target.value })}
                            placeholder="Amount"
                            autoComplete="off"
                            aria-label={`Amount, line ${index + 1}`}
                            aria-invalid={Boolean(rowErrors.amount)}
                          />
                          <Select
                            value={row.unit}
                            onValueChange={(value) => update(row.key, { unit: value })}
                            disabled={!ingredient}
                          >
                            <SelectTrigger
                              className={SELECT_HEIGHT}
                              aria-label={`Unit, line ${index + 1}`}
                              aria-invalid={Boolean(rowErrors.unit)}
                            >
                              <SelectValue placeholder="Unit" />
                            </SelectTrigger>
                            <SelectContent>
                              {ingredient
                                ? DISPLAY_UNITS[ingredient.baseUnit].map((entry) => (
                                    <SelectItem key={entry.unit} value={entry.unit}>
                                      {entry.unit}
                                    </SelectItem>
                                  ))
                                : null}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                          <span className="text-muted-foreground">Cost</span>
                          <span className="font-medium tabular-nums">{cost ? formatMoney(cost) : "–"}</span>
                          {row.draft ? <Badge variant="warning">Draft</Badge> : null}
                          {ingredient?.archived ? <Badge variant="neutral">Archived</Badge> : null}
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(row.key)}>
                          <X className="size-5" aria-hidden />
                          <span className="sr-only">Remove line {index + 1}</span>
                        </Button>
                      </div>
                      {ingredient?.archived ? (
                        <p className="text-sm text-muted-foreground">
                          {ingredient.kind === "prep"
                            ? "This prep recipe is archived. Remove the line or restore the prep recipe before saving."
                            : "This ingredient is archived. Remove the line or restore the ingredient before saving."}
                        </p>
                      ) : null}
                      {message ? (
                        <p role="alert" className="text-sm text-destructive">
                          {message}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            <div>
              <Button type="button" variant="outline" size="lg" onClick={addRow}>
                <Plus aria-hidden />
                Add ingredient
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <span className="font-semibold">Total ingredient cost</span>
              <span className="text-base font-semibold tabular-nums">{complete.length > 0 ? formatMoney(total) : "–"}</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="lg"
                variant={removing ? "destructive" : "default"}
                disabled={pending || (!dirty && !initialRows.some((row) => row.draft))}
                onClick={onSaveClick}
              >
                {pending ? "Saving…" : removing ? "Remove recipe" : "Save recipe"}
              </Button>
              {dirty ? (
                <span className="inline-flex items-center gap-2 text-sm font-medium text-warning-foreground">
                  <span className="size-2 rounded-full bg-warning-foreground" aria-hidden />
                  Unsaved changes
                </span>
              ) : null}
            </div>
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this recipe?</AlertDialogTitle>
            <AlertDialogDescription>
              Sales of this item will stop using stock until you add a new recipe. Past sales are not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                save();
              }}
            >
              {pending ? "Removing…" : "Remove recipe"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
