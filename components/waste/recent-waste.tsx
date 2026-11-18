import { EmptyState } from "@/components/empty-state";
import { amountTone } from "@/components/amount-tone";
import { formatDateTime } from "@/components/import/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatQty } from "@/lib/units";
import { WASTE_REASON_LABELS } from "@/lib/validation/stock-entry";
import type { WasteSummary } from "@/lib/waste";
import { cn } from "@/lib/utils";

function who(item: WasteSummary, userId: string): string {
  if (item.createdBy === userId) return "You";
  return item.createdByEmail ?? "A team member";
}

/** Waste is stored negative; shown as the stock change, e.g. "−200 g", red. */
function Amount({ item, className }: { item: WasteSummary; className?: string }) {
  return <span className={cn("tabular-nums", amountTone(item.qtyDelta), className)}>{formatQty(item.qtyDelta, item.baseUnit)}</span>;
}

/** Recent waste, newest first: cards on a phone, a table from `md` up. No euro amounts. */
export function RecentWaste({ items, userId, timeZone }: { items: WasteSummary[]; userId: string; timeZone: string }) {
  if (items.length === 0) return <EmptyState size="sm" title="No waste logged yet" />;
  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4 text-sm shadow-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 font-semibold break-words">{item.ingredientName}</span>
              <Amount item={item} className="shrink-0 text-right" />
            </div>
            <p>
              {WASTE_REASON_LABELS[item.reason]}
              {item.note ? <span className="text-muted-foreground"> · {item.note}</span> : null}
            </p>
            <p className="text-muted-foreground">
              {formatDateTime(item.occurredAt, timeZone)} · {who(item, userId)}
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Ingredient</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Logged by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="whitespace-nowrap">{formatDateTime(item.occurredAt, timeZone)}</TableCell>
                <TableCell className="font-medium">{item.ingredientName}</TableCell>
                <TableCell className="text-right">
                  <Amount item={item} />
                </TableCell>
                <TableCell>{WASTE_REASON_LABELS[item.reason]}</TableCell>
                <TableCell className="break-words">{item.note ?? "–"}</TableCell>
                <TableCell className="break-words">{who(item, userId)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
