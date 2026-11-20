"use client";

import { useId, useRef, useState, useTransition } from "react";
import { receiveOrderAction } from "@/app/(app)/orders/actions";
import { fieldErrors, FormMessage } from "@/components/form-message";
import { LineList, type KeyedLine } from "@/components/orders/line-list";
import type { EntryValue } from "@/components/stock-entry/entry";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { EntryOption } from "@/lib/ingredients";
import { emptyFormState, formError, invalidForm, type FormState } from "@/lib/validation/form";
import { deliveryInputSchema } from "@/lib/validation/stock-entry";

/**
 * The delivery form, prefilled with what was ordered. Change what really
 * arrived, then confirm: the delivery is logged and the order is received.
 */
export function ReceiveForm({
  orderId,
  options,
  initialLines,
  initialDeliveredAt,
  onCancel,
}: {
  orderId: string;
  options: EntryOption[];
  initialLines: EntryValue[];
  /** "Now" in the restaurant's timezone, made on the server. */
  initialDeliveredAt: string;
  onCancel: () => void;
}) {
  const uid = useId();
  const [lines, setLines] = useState<KeyedLine[]>(() => initialLines.map((line) => ({ ...line, key: crypto.randomUUID() })));
  const [deliveredAt, setDeliveredAt] = useState(initialDeliveredAt);
  const [state, setState] = useState<FormState>(emptyFormState);
  const [pending, startTransition] = useTransition();
  // Made once per delivery: a retry after a failure reuses it, so it logs one delivery.
  const clientId = useRef<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    clientId.current ??= crypto.randomUUID();
    const input = {
      clientId: clientId.current,
      supplierName: "",
      deliveredAt: deliveredAt === initialDeliveredAt ? "" : deliveredAt,
      lines: lines.map(({ ingredientId, amount, unit }) => ({ ingredientId, amount, unit })),
    };
    const checked = deliveryInputSchema.safeParse(input);
    if (!checked.success) {
      setState(invalidForm(checked.error));
      return;
    }
    startTransition(async () => {
      try {
        const result = await receiveOrderAction(orderId, input);
        setState(result);
        // On success the page refreshes into the "Received" view; a new submit would be a new delivery.
        if (result.ok) clientId.current = null;
      } catch {
        setState(formError("Could not reach the server. Your entries are kept; try again."));
      }
    });
  }

  const generalError = state.ok ? undefined : state.errors?.lines?.[0];

  return (
    <form onSubmit={submit} noValidate className="flex max-w-2xl flex-col gap-6" aria-label="Receive delivery">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Change what really arrived</h2>
        <p className="text-sm text-muted-foreground">The quantities start as ordered. Fix them, add or remove items, then confirm.</p>
      </div>
      <LineList lines={lines} options={options} state={state} onChange={setLines} />
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
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
      <div className="sticky bottom-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-wrap gap-2 border-t border-border bg-card p-4 md:bottom-4 md:mx-0 md:rounded-lg md:border">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Logging delivery…" : "Confirm delivery"}
        </Button>
        <Button type="button" variant="outline" size="lg" disabled={pending} onClick={onCancel}>
          Not yet
        </Button>
      </div>
    </form>
  );
}
