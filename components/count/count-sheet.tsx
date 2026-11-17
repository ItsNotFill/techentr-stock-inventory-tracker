"use client";

import { CheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteDraftAction, saveCountAction, submitCountAction } from "@/app/(app)/count/actions";
import { SELECT_HEIGHT } from "@/components/ingredients/units";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { CountSheetIngredient } from "@/lib/counts";
import { DISPLAY_UNITS, formatQty, packsToBase, parseQuantityInput, toBaseUnits, toDecimal } from "@/lib/units";
import { cn } from "@/lib/utils";

const PACK_PREFIX = "pack:";

type RowStatus = { state: "saving" | "saved" | "error"; message?: string };
type Entry = { ingredientId: string; amount: string; unit: string };

/** The unit a row starts in: base unit when something was saved already, else the default pack, else the base unit. */
function initialUnit(ingredient: CountSheetIngredient): string {
  const base = DISPLAY_UNITS[ingredient.baseUnit][0].unit;
  if (ingredient.countedQty !== null) return base;
  const pack = ingredient.packSizes.find((candidate) => candidate.isDefault);
  return pack ? `${PACK_PREFIX}${pack.id}` : base;
}

/** What the typed amount is in base units, or null while it is not a number. */
function equivalent(ingredient: CountSheetIngredient, amount: string, unit: string): string | null {
  const parsed = parseQuantityInput(amount);
  if (!parsed) return null;
  if (unit.startsWith(PACK_PREFIX)) {
    const pack = ingredient.packSizes.find((candidate) => `${PACK_PREFIX}${candidate.id}` === unit);
    if (!pack) return null;
    return formatQty(packsToBase(parsed, pack.qtyInBaseUnit), ingredient.baseUnit);
  }
  const display = DISPLAY_UNITS[ingredient.baseUnit].find((entry) => entry.unit === unit);
  if (!display || display.factor === "1") return null;
  return formatQty(toBaseUnits(parsed, unit, ingredient.baseUnit), ingredient.baseUnit);
}

export function CountSheetForm({
  sessionId,
  ingredients,
  canApprove,
}: {
  sessionId: string;
  ingredients: CountSheetIngredient[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(ingredients.map((i) => [i.id, i.countedQty === null ? "" : toDecimal(i.countedQty).toFixed()])),
  );
  const [units, setUnits] = useState<Record<string, string>>(() => Object.fromEntries(ingredients.map((i) => [i.id, initialUnit(i)])));
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({});
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, startTransition] = useTransition();

  // Mirrors of the state so a blur handler always sees the latest typed values.
  const valuesRef = useRef(values);
  const unitsRef = useRef(units);
  const dirtyRef = useRef(new Set<string>());
  const savingRef = useRef(false);

  function change(id: string, nextValue: string, nextUnit: string) {
    valuesRef.current = { ...valuesRef.current, [id]: nextValue };
    unitsRef.current = { ...unitsRef.current, [id]: nextUnit };
    setValues(valuesRef.current);
    setUnits(unitsRef.current);
    dirtyRef.current.add(id);
    setStatuses((current) => {
      if (!current[id]) return current;
      const rest = { ...current };
      delete rest[id];
      return rest;
    });
  }

  function buildEntries(): Entry[] {
    return ingredients
      .filter((i) => dirtyRef.current.has(i.id))
      .map((i) => ({ ingredientId: i.id, amount: valuesRef.current[i.id] ?? "", unit: unitsRef.current[i.id] }));
  }

  /** Marks entries saved (or failed) and keeps whatever was typed meanwhile as dirty. */
  function applyResult(sent: Entry[], errors: Record<string, string[] | undefined> | undefined, ok: boolean, message?: string) {
    const next: Record<string, RowStatus> = {};
    sent.forEach((entry, index) => {
      const error = errors?.[`entries.${index}`]?.[0];
      if (error) next[entry.ingredientId] = { state: "error", message: error };
      else if (ok) {
        const unchanged = valuesRef.current[entry.ingredientId] === entry.amount && unitsRef.current[entry.ingredientId] === entry.unit;
        if (unchanged) {
          dirtyRef.current.delete(entry.ingredientId);
          next[entry.ingredientId] = { state: "saved" };
        }
      } else next[entry.ingredientId] = { state: "error", message: message ?? "Not saved." };
    });
    setStatuses((current) => {
      const merged = { ...current, ...next };
      for (const entry of sent) if (!next[entry.ingredientId] && merged[entry.ingredientId]?.state === "saving") delete merged[entry.ingredientId];
      return merged;
    });
  }

  async function save(): Promise<boolean> {
    if (savingRef.current) return false;
    const entries = buildEntries();
    if (entries.length === 0) return true;
    savingRef.current = true;
    setSaving(true);
    setStatuses((current) => ({ ...current, ...Object.fromEntries(entries.map((e) => [e.ingredientId, { state: "saving" as const }])) }));
    try {
      const result = await saveCountAction(sessionId, entries);
      applyResult(entries, result.errors, result.ok, result.message);
      if (!result.ok && !result.errors) toast.error(result.message ?? "Could not save.");
      return result.ok;
    } catch {
      applyResult(entries, undefined, false, "Could not reach the server. Your figures are kept here.");
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function submit(approve: boolean) {
    startTransition(async () => {
      const entries = buildEntries();
      try {
        const result = await submitCountAction(sessionId, entries, approve);
        if (result.ok) {
          toast.success(result.message);
          router.push("/count");
          return;
        }
        applyResult(entries, result.errors, false, undefined);
        toast.error(result.message ?? "Could not submit the count.");
      } catch {
        toast.error("Could not reach the server. Your figures are kept here.");
      }
      setSubmitOpen(false);
    });
  }

  function discard() {
    startTransition(async () => {
      const result = await deleteDraftAction(sessionId);
      if (result.ok) {
        toast.success(result.message);
        router.push("/count");
      } else {
        toast.error(result.message ?? "Could not delete the draft.");
        setDeleteOpen(false);
      }
    });
  }

  const isCounted = (id: string) => parseQuantityInput(values[id] ?? "") !== null;
  const countedTotal = ingredients.filter((i) => isCounted(i.id)).length;

  const groups = useMemo(() => {
    const map = new Map<string, CountSheetIngredient[]>();
    for (const ingredient of ingredients) {
      const area = ingredient.storageArea?.trim() || "Other";
      const list = map.get(area) ?? [];
      list.push(ingredient);
      map.set(area, list);
    }
    return [...map.entries()];
  }, [ingredients]);

  if (ingredients.length === 0) {
    return <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">There are no ingredients to count yet. Add ingredients first.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg font-medium" aria-live="polite">
          {countedTotal} of {ingredients.length} counted
        </p>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Switch checked={onlyOpen} onCheckedChange={setOnlyOpen} />
          Show only not counted
        </label>
      </div>

      {groups.map(([area, items]) => {
        const visible = onlyOpen ? items.filter((i) => !isCounted(i.id)) : items;
        if (visible.length === 0) return null;
        return (
          <section key={area} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">{area}</h2>
            <ul className="flex flex-col gap-3">
              {visible.map((ingredient) => {
                const status = statuses[ingredient.id];
                const unit = units[ingredient.id];
                const eq = equivalent(ingredient, values[ingredient.id] ?? "", unit);
                const counted = isCounted(ingredient.id);
                return (
                  <li key={ingredient.id} className="rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor={`${uid}-${ingredient.id}`} className="min-w-0 break-words text-base font-medium">
                        {ingredient.name}
                      </label>
                      {counted ? (
                        <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                          <CheckIcon className="size-4 text-primary" aria-hidden />
                          Counted
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,9rem)] gap-2">
                      <Input
                        id={`${uid}-${ingredient.id}`}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0"
                        value={values[ingredient.id] ?? ""}
                        aria-invalid={status?.state === "error" ? true : undefined}
                        className="h-12 text-lg md:text-lg"
                        onChange={(event) => change(ingredient.id, event.target.value, unit)}
                        onBlur={() => void save()}
                      />
                      <Select
                        value={unit}
                        onValueChange={(next) => {
                          change(ingredient.id, values[ingredient.id] ?? "", next);
                          if ((values[ingredient.id] ?? "") !== "") queueMicrotask(() => void save());
                        }}
                      >
                        <SelectTrigger className={cn(SELECT_HEIGHT, "data-[size=default]:h-12")} aria-label={`Unit for ${ingredient.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ingredient.packSizes.map((pack) => (
                            <SelectItem key={pack.id} value={`${PACK_PREFIX}${pack.id}`}>
                              {pack.label}
                            </SelectItem>
                          ))}
                          {DISPLAY_UNITS[ingredient.baseUnit].map((entry) => (
                            <SelectItem key={entry.unit} value={entry.unit}>
                              {entry.unit}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="mt-1 flex min-h-5 flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">{eq ? `= ${eq}` : ""}</span>
                      {status ? (
                        <span className={status.state === "error" ? "text-destructive" : "text-muted-foreground"} role={status.state === "error" ? "alert" : undefined}>
                          {status.state === "saving" ? "Saving…" : status.state === "saved" ? "Saved" : status.message}
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {onlyOpen && countedTotal === ingredients.length ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Everything is counted.</p>
      ) : null}

      <div>
        <Button type="button" variant="ghost" className="h-11 text-destructive" disabled={pending} onClick={() => setDeleteOpen(true)}>
          Delete draft
        </Button>
      </div>

      <div className="sticky bottom-16 z-10 -mx-4 flex gap-3 border-t bg-background p-4 md:bottom-0 md:mx-0 md:rounded-xl md:border">
        <Button type="button" variant="outline" size="lg" className="h-12 flex-1 text-base" disabled={saving || pending} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="lg" className="h-12 flex-1 text-base" disabled={saving || pending} onClick={() => setSubmitOpen(true)}>
          Submit count
        </Button>
      </div>

      <AlertDialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit this count?</AlertDialogTitle>
            <AlertDialogDescription>The count time is now. You cannot change it after submitting.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                submit(false);
              }}
            >
              {pending ? "Submitting…" : "Submit count"}
            </AlertDialogAction>
            {canApprove ? (
              <AlertDialogAction
                disabled={pending}
                onClick={(event) => {
                  event.preventDefault();
                  submit(true);
                }}
              >
                Submit and approve
              </AlertDialogAction>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>Everything you counted so far is thrown away. Stock does not change.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                discard();
              }}
            >
              {pending ? "Deleting…" : "Delete draft"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
