"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useRef, useState, useTransition } from "react";
import { logWasteAction } from "@/app/(app)/waste/actions";
import { EmptyState } from "@/components/empty-state";
import { fieldErrors, FormMessage } from "@/components/form-message";
import { groupByArea, type EntryValue } from "@/components/stock-entry/entry";
import { EntryLine } from "@/components/stock-entry/entry-line";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toDateTimeInput } from "@/lib/imports/time";
import type { EntryOption } from "@/lib/ingredients";
import { emptyFormState, invalidForm, type FormState } from "@/lib/validation/form";
import { WASTE_REASON_LABELS, WASTE_REASONS, wasteInputSchema } from "@/lib/validation/stock-entry";
import { cn } from "@/lib/utils";

const emptyEntry: EntryValue = { ingredientId: "", amount: "", unit: "" };

export function WasteForm({
  options,
  canManage,
  timeZone,
  initialOccurredAt,
}: {
  options: EntryOption[];
  canManage: boolean;
  timeZone: string;
  /** "Now" in the restaurant's timezone, made on the server so both renders agree. */
  initialOccurredAt: string;
}) {
  const uid = useId();
  const [entry, setEntry] = useState<EntryValue>(emptyEntry);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [occurredAt, setOccurredAt] = useState(initialOccurredAt);
  const [state, setState] = useState<FormState>(emptyFormState);
  const [pending, startTransition] = useTransition();
  // Made once per entry: a retry after a failure reuses it, so it stays one movement.
  const clientId = useRef<string | null>(null);
  const baseline = useRef(initialOccurredAt);
  const groups = useMemo(() => groupByArea(options), [options]);

  if (options.length === 0) {
    return (
      <EmptyState
        title="There are no ingredients yet"
        description={canManage ? "Add the ingredients you use, then log what is thrown away." : "Ask a manager to add the ingredients first."}
      >
        {canManage ? (
          <Link href="/ingredients/new" className={buttonVariants()}>
            Add an ingredient
          </Link>
        ) : null}
      </EmptyState>
    );
  }

  const error = (field: string) => state.errors?.[field]?.[0];
  const clearSuccess = () => {
    if (state.ok) setState(emptyFormState);
  };

  function submit(event: React.FormEvent) {
    event.preventDefault();
    clientId.current ??= crypto.randomUUID();
    const input = {
      clientId: clientId.current,
      ingredientId: entry.ingredientId,
      amount: entry.amount,
      unit: entry.unit,
      reason,
      note,
      // Left alone means "now" on the server, the moment of saving.
      occurredAt: occurredAt === baseline.current ? "" : occurredAt,
    };
    const checked = wasteInputSchema.safeParse(input);
    if (!checked.success) {
      setState(invalidForm(checked.error));
      return;
    }
    startTransition(async () => {
      try {
        const result = await logWasteAction(input);
        setState(result);
        if (result.ok) {
          const now = toDateTimeInput(new Date(), timeZone);
          clientId.current = null;
          baseline.current = now;
          setOccurredAt(now);
          setEntry(emptyEntry);
          setReason("");
          setNote("");
        }
      } catch {
        setState({ ok: false, message: "Could not reach the server. Your entries are kept; try again." });
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex w-full max-w-2xl flex-col gap-6">
      <ul className="flex flex-col gap-3">
        <EntryLine
          number={1}
          title="What was thrown away"
          groups={groups}
          options={options}
          value={entry}
          errors={
            error("ingredientId") || error("amount") || error("unit")
              ? { ingredientId: error("ingredientId"), amount: error("amount"), unit: error("unit") }
              : undefined
          }
          onChange={(next) => {
            setEntry(next);
            clearSuccess();
          }}
        />
      </ul>

      <fieldset className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm" aria-describedby={`${uid}-reason-error`}>
        <legend className="px-0 text-sm font-medium">Why was it thrown away?</legend>
        <div className="grid grid-cols-2 gap-3" role="group" aria-label="Reason">
          {WASTE_REASONS.map((value) => {
            const selected = reason === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setReason(value);
                  clearSuccess();
                }}
                className={cn(
                  "flex h-14 cursor-pointer items-center justify-center gap-2 rounded-lg border text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px",
                  selected
                    ? "border-primary bg-accent text-primary"
                    : "border-border bg-secondary text-secondary-foreground hover:border-muted-foreground/50 hover:bg-row-hover",
                  error("reason") && !selected && "border-destructive",
                )}
              >
                {selected ? <Check className="size-4" aria-hidden /> : null}
                {WASTE_REASON_LABELS[value]}
              </button>
            );
          })}
        </div>
        <div id={`${uid}-reason-error`}>
          <FieldError errors={fieldErrors(state, "reason")} />
        </div>
      </fieldset>

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm">
        <Field data-invalid={error("note") ? true : undefined}>
          <FieldLabel htmlFor={`${uid}-note`}>Note (optional)</FieldLabel>
          <Input
            id={`${uid}-note`}
            value={note}
            autoComplete="off"
            maxLength={200}
            placeholder="e.g. dropped tray"
            className="h-14 text-lg md:h-12"
            aria-invalid={error("note") ? true : undefined}
            onChange={(event) => setNote(event.target.value)}
          />
          <FieldError errors={fieldErrors(state, "note")} />
        </Field>
        <Field data-invalid={error("occurredAt") ? true : undefined}>
          <FieldLabel htmlFor={`${uid}-when`}>When</FieldLabel>
          <Input
            id={`${uid}-when`}
            type="datetime-local"
            value={occurredAt}
            className="h-14 text-lg md:h-12"
            aria-invalid={error("occurredAt") ? true : undefined}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
          <FieldDescription>Leave as it is if it happened just now.</FieldDescription>
          <FieldError errors={fieldErrors(state, "occurredAt")} />
        </Field>
      </div>

      <FormMessage state={state} />

      {/* Stays above the phone tab bar while scrolling; at the end of the form it sits in place. */}
      <div className="sticky bottom-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-border bg-card p-4 md:bottom-4 md:mx-0 md:rounded-lg md:border">
        <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={pending}>
          {pending ? "Logging waste…" : "Log waste"}
        </Button>
      </div>
    </form>
  );
}
