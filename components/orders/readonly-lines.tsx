import { quantityText } from "@/components/orders/lines";
import type { PurchaseOrderLineDetail } from "@/lib/purchasing";

/** The lines of an order that can no longer change. */
export function ReadonlyLines({ lines }: { lines: PurchaseOrderLineDetail[] }) {
  if (lines.length === 0) return <p className="text-sm text-muted-foreground">This order has no lines.</p>;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card shadow-sm">
      {lines.map((line) => (
        <li key={line.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4">
          <span className="min-w-0 font-medium break-words">{line.name}</span>
          <span className="text-right tabular-nums">{quantityText(line)}</span>
        </li>
      ))}
    </ul>
  );
}
