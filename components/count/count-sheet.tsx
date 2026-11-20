"use client";

import { CheckIcon, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteDraftAction } from "@/app/(app)/count/actions";
import { EmptyState } from "@/components/empty-state";
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
import { SyncStatus } from "@/components/count/sync-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { CountSheetIngredient } from "@/lib/counts";
import { DISPLAY_UNITS, formatQty, packsToBase, parseQuantityInput, toBaseUnits, toDecimal } from "@/lib/units";
import { cn } from "@/lib/utils";
import { useCountSync } from "@/hooks/use-count-sync";
import { keepOfflineCopy } from "@/lib/pwa/offline-copy";

const PACK_PREFIX = "pack:";

type RowStatus = { state: "saving" | "saved" | "kept" | "error"; message?: string };

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
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Figures are kept on the phone and sent when there is signal (DECISIONS.md 94).
  const sync = useCountSync(sessionId);
  // A copy of this sheet for the service worker, so it reopens without signal however it was reached.
  useEffect(() => {
    void keepOfflineCopy(`/count/${sessionId}`);
  }, [sessionId]);
  const { state: syncState } = sync;

  // What the phone kept from an earlier visit is newer than the server's figures.
  const [appliedRestore, setAppliedRestore] = useState(false);
  if (!appliedRestore && sync.restored !== undefined) {
    setAppliedRestore(true);
    const kept = sync.restored?.pending ?? {};
    if (Object.keys(kept).length > 0) {
      setValues((current) => ({ ...current, ...Object.fromEntries(Object.entries(kept).map(([id, entry]) => [id, entry.amount])) }));
      setUnits((current) => ({ ...current, ...Object.fromEntries(Object.entries(kept).map(([id, entry]) => [id, entry.unit])) }));
    }
  }

  // Submitted: at once, or later when a submit kept on the phone went through.
  const submittedMessage = syncState.submitted ? (syncState.message ?? "Count submitted. A manager will review it.") : null;
  useEffect(() => {
    if (!submittedMessage) return;
    toast.success(submittedMessage);
    router.push("/count");
  }, [submittedMessage, router]);

  function change(id: string, nextValue: string, nextUnit: string) {
    setValues((current) => ({ ...current, [id]: nextValue }));
    setUnits((current) => ({ ...current, [id]: nextUnit }));
    sync.record({ ingredientId: id, amount: nextValue, unit: nextUnit });
  }

  function save() {
    void sync.flush();
  }

  function submit(approve: boolean) {
    startTransition(async () => {
      const outcome = await sync.submit(approve);
      if (outcome === "submitted") return; // announced above, then back to the list
      if (outcome === "queued") {
        // A save was on its way; the submit follows it and is announced when it goes through.
        setSubmitOpen(false);
        return;
      }
      if (outcome === "waiting") {
        toast.message("No connection. The count is kept on this phone and is submitted as soon as there is signal.");
      } else {
        toast.error(syncState.message ?? "Could not submit the count. Check the highlighted ingredients.");
      }
      setSubmitOpen(false);
    });
  }

  function discard() {
    startTransition(async () => {
      try {
        const result = await deleteDraftAction(sessionId);
        if (result.ok) {
          await sync.forget();
          toast.success(result.message);
          router.push("/count");
        } else {
          toast.error(result.message ?? "Could not delete the draft.");
          setDeleteOpen(false);
        }
      } catch {
        toast.error("No connection. Delete the draft once there is signal.");
        setDeleteOpen(false);
      }
    });
  }

  function rowStatus(id: string): RowStatus | undefined {
    const error = syncState.rowErrors[id];
    if (error) return { state: "error", message: error };
    if (syncState.pending.includes(id)) {
      if (syncState.syncing) return { state: "saving" };
      if (syncState.unreachable) return { state: "kept" };
      return undefined;
    }
    if (syncState.saved.includes(id)) return { state: "saved" };
    return undefined;
  }

  const saving = syncState.syncing;

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
    return <EmptyState title="There are no ingredients to count yet." description="Add ingredients first." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-lg font-semibold tabular-nums" aria-live="polite">
            {countedTotal} of {ingredients.length} counted
          </p>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
            <Switch checked={onlyOpen} onCheckedChange={setOnlyOpen} />
            Show only not counted
          </label>
        </div>
        {syncState.message ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {syncState.message}
          </p>
        ) : null}
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${(countedTotal / ingredients.length) * 100}%` }}
          />
        </div>
      </div>

      {groups.map(([area, items]) => {
        const visible = onlyOpen ? items.filter((i) => !isCounted(i.id)) : items;
        if (visible.length === 0) return null;
        return (
          <section key={area} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">{area}</h2>
            <ul className="flex flex-col gap-3">
              {visible.map((ingredient) => {
                const status = rowStatus(ingredient.id);
                const unit = units[ingredient.id];
                const eq = equivalent(ingredient, values[ingredient.id] ?? "", unit);
                const counted = isCounted(ingredient.id);
                return (
                  <li
                    key={ingredient.id}
                    className={cn(
                      "scroll-mt-24 scroll-mb-56 rounded-lg border bg-card p-4 shadow-sm transition-colors",
                      status?.state === "error" ? "border-destructive" : "border-border",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor={`${uid}-${ingredient.id}`} className="min-w-0 text-base font-semibold break-words">
                        {ingredient.name}
                      </label>
                      {counted ? (
                        <span className="flex h-6 shrink-0 items-center gap-1 rounded-full bg-success px-2.5 text-xs font-medium text-success-foreground">
                          <CheckIcon className="size-3.5" aria-hidden />
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
                        className="h-14 text-xl font-medium tabular-nums md:h-12 md:text-lg"
                        onChange={(event) => change(ingredient.id, event.target.value, unit)}
                        onBlur={save}
                      />
                      <Select
                        value={unit}
                        onValueChange={(next) => {
                          change(ingredient.id, values[ingredient.id] ?? "", next);
                          if ((values[ingredient.id] ?? "") !== "") queueMicrotask(save);
                        }}
                      >
                        <SelectTrigger
                          className={cn(SELECT_HEIGHT, "text-base data-[size=default]:h-14 md:text-base md:data-[size=default]:h-12")}
                          aria-label={`Unit for ${ingredient.name}`}
                        >
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
                    <div className="mt-1.5 flex min-h-5 flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground tabular-nums">{eq ? `= ${eq}` : ""}</span>
                      {status ? (
                        <span
                          className={cn(
                            "font-medium",
                            status.state === "error"
                              ? "text-destructive"
                              : status.state === "saved"
                                ? "text-success-foreground"
                                : status.state === "kept"
                                  ? "text-warning-foreground"
                                  : "text-muted-foreground",
                          )}
                          role={status.state === "error" ? "alert" : undefined}
                        >
                          {status.state === "saving"
                            ? "Saving…"
                            : status.state === "saved"
                              ? "Saved"
                              : status.state === "kept"
                                ? "Kept on this phone"
                                : status.message}
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
        <EmptyState size="sm" title="Everything is counted." />
      ) : null}

      <div>
        <Button type="button" variant="destructive-outline" disabled={pending} onClick={() => setDeleteOpen(true)}>
          <Trash2 aria-hidden />
          Delete draft
        </Button>
      </div>

      {/* Stays above the phone tab bar while scrolling; at the end of the list it sits in place, so it never covers the last item. */}
      <div className="sticky bottom-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-col gap-3 border-t border-border bg-card p-4 md:bottom-4 md:mx-0 md:rounded-lg md:border">
        <SyncStatus state={syncState} className="empty:hidden" />
        <div className="flex gap-3">
          <Button type="button" variant="outline" size="lg" className="h-12 flex-1 text-base" disabled={saving || pending} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button type="button" size="lg" className="h-12 flex-1 text-base" disabled={saving || pending} onClick={() => setSubmitOpen(true)}>
            Submit count
          </Button>
        </div>
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
                variant="outline"
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
              variant="destructive"
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
