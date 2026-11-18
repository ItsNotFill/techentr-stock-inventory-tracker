import Link from "next/link";
import { useId } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { movementType, type MovementType } from "@/lib/db/schema/enums";
import { MOVEMENT_TYPE_LABELS } from "@/lib/validation/history";

const selectClass =
  "h-11 w-full min-w-0 cursor-pointer rounded-lg border border-input bg-card px-3 text-base text-foreground transition-colors outline-none hover:border-muted-foreground/50 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:h-10 md:text-sm";

/** A plain GET form: it works without JavaScript and the filters live in the URL. */
export function HistoryFilters({
  ingredientId,
  type,
  from,
  to,
}: {
  ingredientId: string;
  type?: MovementType;
  from?: string;
  to?: string;
}) {
  const uid = useId();
  const filtered = Boolean(type || from || to);
  return (
    <form method="get" action="/history" className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="ingredient" value={ingredientId} />
      <div className="flex min-w-full flex-col gap-1.5 sm:min-w-44 sm:flex-1 md:max-w-60">
        <Label htmlFor={`${uid}-type`}>Type</Label>
        <select id={`${uid}-type`} name="type" defaultValue={type ?? ""} className={selectClass}>
          <option value="">All movements</option>
          {movementType.enumValues.map((value) => (
            <option key={value} value={value}>
              {MOVEMENT_TYPE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-48">
        <Label htmlFor={`${uid}-from`}>From</Label>
        <Input id={`${uid}-from`} name="from" type="date" defaultValue={from ?? ""} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-48">
        <Label htmlFor={`${uid}-to`}>To</Label>
        <Input id={`${uid}-to`} name="to" type="date" defaultValue={to ?? ""} />
      </div>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <Button type="submit" variant="outline" className="h-11 flex-1 px-5 sm:flex-none md:h-10">
          Show
        </Button>
        {filtered ? (
          <Link
            href={`/history?ingredient=${ingredientId}`}
            className={buttonVariants({ variant: "ghost", className: "h-11 px-4 text-primary md:h-10" })}
          >
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}
