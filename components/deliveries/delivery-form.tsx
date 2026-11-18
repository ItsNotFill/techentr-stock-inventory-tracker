"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useRef, useState, useTransition } from "react";
import { logDeliveryAction } from "@/app/(app)/deliveries/actions";
import { EmptyState } from "@/components/empty-state";
import { fieldErrors, FormMessage } from "@/components/form-message";
import { groupByArea, type EntryValue } from "@/components/stock-entry/entry";
import { EntryLine, type EntryLineErrors } from "@/components/stock-entry/entry-line";
import { buttonVariants, Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toDateTimeInput } from "@/lib/imports/time";
import type { EntryOption } from "@/lib/ingredients";
import { emptyFormState, invalidForm, type FormState } from "@/lib/validation/form";
import { deliveryInputSchema } from "@/lib/validation/stock-entry";

type Line = EntryValue & { key: string };

const emptyLine = (): Line => ({ key: crypto.randomUUID(), ingredientId: "", amount: "", unit: "" });

export function DeliveryForm({
  options,
  canManage,
  timeZone,
  initialDeliveredAt,
}: {
  options: EntryOption[];
  canManage: boolean;
  timeZone: string;
  /** "Now" in the restaurant's timezone, made on the server so both renders agree. */
  initialDeliveredAt: string;
}) {
  const uid = useId();
  const [lines, setLines] = useState<Line[]>(() => [emptyLine()]);
  const [supplierName, setSupplierName] = useState("");
  const [deliveredAt, setDeliveredAt] = useState(initialDeliveredAt);
  const [state, setState] = useState<FormState>(emptyFormState);
  const [pending, startTransition] = useTransition();
  // Made once per delivery: a retry after a failure reuses it, so it stays one delivery.
  const clientId = useRef<string | null>(null);
  const baseline = useRef(initialDeliveredAt);
  const groups = useMemo(() => groupByArea(options), [options]);

  if (options.length === 0) {
    return (
      <EmptyState title="There are no ingredients yet" description={canManage ? "Add the ingredients you buy, then log what arrives." : "Ask a manager to add the ingredients first."}>
        {canManage ? (
          <Link href="/ingredients/new" className={buttonVariants()}>
            Add an ingredient
          </Link>
        ) : null}
      </EmptyState>
    );
  }

  function updateLine(key: string, next: EntryValue) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...next } : line)));
    if (state.ok) setState(emptyFormState);
  }

  function lineErrors(index: number): EntryLineErrors | undefined {
    const pick = (field: string) => state.errors?.[`lines.${index}.${field}`]?.[0];
    const errors = { ingredientId: pick("ingredientId"), amount: pick("amount"), unit: pick("unit") };
    return errors.ingredientId || errors.amount || errors.unit ? errors : undefined;
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    clientId.current ??= crypto.randomUUID();
    const input = {
      clientId: clientId.current,
      supplierName,
      // Left alone means "now" on the server, the moment of saving.
      deliveredAt: deliveredAt === baseline.current ? "" : deliveredAt,
      lines: lines.map(({ ingredientId, amount, unit }) => ({ ingredientId, amount, unit })),
    };
    const checked = deliveryInputSchema.safeParse(input);
    if (!checked.success) {
      setState(invalidForm(checked.error));
      return;
    }
    startTransition(async () => {
      try {
        const result = await logDeliveryAction(input);
        setState(result);
        if (result.ok) {
          const now = toDateTimeInput(new Date(), timeZone);
          clientId.current = null;
          baseline.current = now;
          setDeliveredAt(now);
          setSupplierName("");
          setLines([emptyLine()]);
        }
      } catch {
        setState({ ok: false, message: "Could not reach the server. Your entries are kept; try again." });
      }
    });
  }

  const generalError = state.ok ? undefined : state.errors?.lines?.[0];

  return (
    <form onSubmit={submit} noValidate className="flex w-full max-w-2xl flex-col gap-6">
      <ul className="flex flex-col gap-3">
        {lines.map((line, index) => (
          <EntryLine
            key={line.key}
            number={index + 1}
            groups={groups}
            options={options}
            value={line}
            errors={lineErrors(index)}
            onChange={(next) => updateLine(line.key, next)}
            onRemove={lines.length > 1 ? () => setLines((current) => current.filter((candidate) => candidate.key !== line.key)) : undefined}
          />
        ))}
      </ul>
      <div>
        <Button type="button" variant="outline" size="lg" onClick={() => setLines((current) => [...current, emptyLine()])}>
          <Plus aria-hidden />
          Add another item
        </Button>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm">
        <Field data-invalid={state.errors?.supplierName ? true : undefined}>
          <FieldLabel htmlFor={`${uid}-supplier`}>Supplier (optional)</FieldLabel>
          <Input
            id={`${uid}-supplier`}
            value={supplierName}
            autoComplete="off"
            maxLength={120}
            className="h-14 text-lg md:h-12"
            aria-invalid={state.errors?.supplierName ? true : undefined}
            onChange={(event) => setSupplierName(event.target.value)}
          />
          <FieldError errors={fieldErrors(state, "supplierName")} />
        </Field>
        <Field data-invalid={state.errors?.deliveredAt ? true : undefined}>
          <FieldLabel htmlFor={`${uid}-delivered`}>Delivered</FieldLabel>
          <Input
            id={`${uid}-delivered`}
            type="datetime-local"
            value={deliveredAt}
            className="h-14 text-lg md:h-12"
            aria-invalid={state.errors?.deliveredAt ? true : undefined}
            onChange={(event) => setDeliveredAt(event.target.value)}
          />
          <FieldDescription>Leave as it is if the delivery arrived just now.</FieldDescription>
          <FieldError errors={fieldErrors(state, "deliveredAt")} />
        </Field>
      </div>

      {generalError ? <FieldError>{generalError}</FieldError> : null}
      <FormMessage state={state} />

      {/* Stays above the phone tab bar while scrolling; at the end of the form it sits in place. */}
      <div className="sticky bottom-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-border bg-card p-4 md:bottom-4 md:mx-0 md:rounded-lg md:border">
        <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={pending}>
          {pending ? "Logging delivery…" : "Log delivery"}
        </Button>
      </div>
    </form>
  );
}
