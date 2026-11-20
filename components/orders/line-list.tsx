"use client";

import { Plus } from "lucide-react";
import { useMemo } from "react";
import { groupByArea, type EntryValue } from "@/components/stock-entry/entry";
import { EntryLine, type EntryLineErrors } from "@/components/stock-entry/entry-line";
import { Button } from "@/components/ui/button";
import type { EntryOption } from "@/lib/ingredients";
import type { FormState } from "@/lib/validation/form";

export type KeyedLine = EntryValue & { key: string };

export const emptyLine = (): KeyedLine => ({ key: crypto.randomUUID(), ingredientId: "", amount: "", unit: "" });

/** The errors of line `index` from a form state keyed `lines.<index>.<field>`. */
function errorsFor(state: FormState, index: number): EntryLineErrors | undefined {
  const pick = (field: string) => state.errors?.[`lines.${index}.${field}`]?.[0];
  const errors = { ingredientId: pick("ingredientId"), amount: pick("amount"), unit: pick("unit") };
  return errors.ingredientId || errors.amount || errors.unit ? errors : undefined;
}

/** The item cards of an order or a delivery, with "Add another item". Controlled by the parent. */
export function LineList({
  lines,
  options,
  state,
  onChange,
  allowEmpty = false,
}: {
  lines: KeyedLine[];
  options: EntryOption[];
  state: FormState;
  onChange: (next: KeyedLine[]) => void;
  /** A draft order may have no lines; a delivery needs one. */
  allowEmpty?: boolean;
}) {
  const groups = useMemo(() => groupByArea(options), [options]);
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {lines.map((line, index) => (
          <EntryLine
            key={line.key}
            number={index + 1}
            groups={groups}
            options={options}
            value={line}
            errors={errorsFor(state, index)}
            onChange={(next) => onChange(lines.map((candidate) => (candidate.key === line.key ? { ...candidate, ...next } : candidate)))}
            onRemove={allowEmpty || lines.length > 1 ? () => onChange(lines.filter((candidate) => candidate.key !== line.key)) : undefined}
          />
        ))}
      </ul>
      <div>
        <Button type="button" variant="outline" size="lg" onClick={() => onChange([...lines, emptyLine()])}>
          <Plus aria-hidden />
          Add another item
        </Button>
      </div>
    </div>
  );
}
