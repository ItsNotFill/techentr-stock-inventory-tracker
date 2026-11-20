"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteOrderAction, saveOrderAction, sendOrderAction } from "@/app/(app)/orders/actions";
import { fieldErrors, FormMessage } from "@/components/form-message";
import { ConfirmAction } from "@/components/orders/confirm-action";
import { emptyLine, LineList, type KeyedLine } from "@/components/orders/line-list";
import { OrderText } from "@/components/orders/order-text";
import type { EntryValue } from "@/components/stock-entry/entry";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { EntryOption } from "@/lib/ingredients";
import { emptyFormState, formError, invalidForm, type FormState } from "@/lib/validation/form";
import { purchaseOrderInputSchema } from "@/lib/validation/purchasing";

const plainLines = (lines: EntryValue[]) => lines.map(({ ingredientId, amount, unit }) => ({ ingredientId, amount, unit }));

/** The lines and notes of a draft order, with Save, Mark as sent and Delete draft. */
export function DraftEditor({
  orderId,
  options,
  defaults,
  text,
  supplierEmail,
  restaurantName,
}: {
  orderId: string;
  options: EntryOption[];
  defaults: { notes: string; lines: EntryValue[] };
  /** The saved order as text. */
  text: string;
  supplierEmail: string | null;
  restaurantName: string;
}) {
  const uid = useId();
  const router = useRouter();
  const [lines, setLines] = useState<KeyedLine[]>(() => defaults.lines.map((line) => ({ ...line, key: crypto.randomUUID() })));
  const [notes, setNotes] = useState(defaults.notes);
  const [state, setState] = useState<FormState>(emptyFormState);
  const [pending, startTransition] = useTransition();
  const saved = JSON.stringify({ notes: defaults.notes, lines: plainLines(defaults.lines) });
  const input = { notes, lines: plainLines(lines) };
  const dirty = JSON.stringify(input) !== saved;

  async function save(): Promise<boolean> {
    const checked = purchaseOrderInputSchema.safeParse(input);
    if (!checked.success) {
      setState(invalidForm(checked.error));
      return false;
    }
    try {
      const result = await saveOrderAction(orderId, input);
      setState(result);
      return result.ok;
    } catch {
      setState(formError("Could not reach the server. Your entries are kept; try again."));
      return false;
    }
  }

  function onSave() {
    startTransition(async () => {
      if (await save()) toast.success("Order saved.");
    });
  }

  function onSend() {
    startTransition(async () => {
      if (dirty && !(await save())) return;
      try {
        const result = await sendOrderAction(orderId);
        if (result.ok) toast.success(result.message ?? "Order marked as sent.");
        else setState(result);
      } catch {
        setState(formError("Could not reach the server. Try again."));
      }
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-6">
        <h2 className="text-lg font-semibold tracking-tight">Items to order</h2>
        <LineList
          lines={lines}
          options={options}
          state={state}
          allowEmpty
          onChange={(next) => {
            setLines(next);
            if (state.ok) setState(emptyFormState);
          }}
        />
        {lines.length === 0 ? (
          <Button type="button" variant="outline" size="lg" className="self-start" onClick={() => setLines([emptyLine()])}>
            Add the first item
          </Button>
        ) : null}
        <Field data-invalid={state.errors?.notes ? true : undefined}>
          <FieldLabel htmlFor={`${uid}-notes`}>Note for the supplier (optional)</FieldLabel>
          <Textarea
            id={`${uid}-notes`}
            value={notes}
            maxLength={500}
            rows={3}
            aria-invalid={state.errors?.notes ? true : undefined}
            onChange={(event) => setNotes(event.target.value)}
          />
          <FieldError errors={fieldErrors(state, "notes")} />
        </Field>
        <FormMessage state={state} />
        <div className="sticky bottom-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-wrap gap-2 border-t border-border bg-card p-4 md:bottom-4 md:mx-0 md:rounded-lg md:border">
          <Button type="button" size="lg" disabled={pending || !dirty} onClick={onSave}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="outline" size="lg" disabled={pending} onClick={onSend}>
            Mark as sent
          </Button>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Send it</h2>
        {dirty ? <p className="text-sm text-muted-foreground">The text below shows the last saved order. Save to update it.</p> : null}
        <OrderText text={text} email={supplierEmail} restaurantName={restaurantName} />
      </section>

      <div>
        <ConfirmAction
          label="Delete draft"
          title="Delete this draft?"
          description="The order is removed. Nothing was sent to the supplier by the app."
          confirmLabel="Delete draft"
          pendingLabel="Deleting…"
          action={() => deleteOrderAction(orderId)}
          onDone={() => router.push("/orders")}
        />
      </div>
    </div>
  );
}
