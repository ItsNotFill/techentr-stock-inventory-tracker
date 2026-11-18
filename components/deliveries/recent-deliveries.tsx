import { formatDateTime } from "@/components/import/format";
import { EmptyState } from "@/components/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DeliverySummary, DeliverySummaryLine } from "@/lib/deliveries";
import { formatNumber, formatQty } from "@/lib/units";

function who(delivery: DeliverySummary, userId: string): string {
  if (delivery.createdBy === userId) return "You";
  return delivery.createdByEmail ?? "A team member";
}

/** "5 × Bag 1 kg (5,000 g)" when it was typed in packs, else "2.5 kg" as stored: "2,500 g". */
function lineText(line: DeliverySummaryLine): string {
  const stored = formatQty(line.qtyBaseUnit, line.baseUnit);
  if (line.packCount && line.packLabel) return `${formatNumber(line.packCount)} × ${line.packLabel} (${stored})`;
  return stored;
}

function Items({ delivery }: { delivery: DeliverySummary }) {
  return (
    <ul className="flex flex-col gap-1">
      {delivery.lines.map((line) => (
        <li key={line.id} className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 font-medium break-words">{line.ingredientName}</span>
          <span className="shrink-0 text-right tabular-nums">{lineText(line)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Confirmed deliveries, newest first: cards on a phone, a table from `md` up. No euro amounts. */
export function RecentDeliveries({
  deliveries,
  userId,
  timeZone,
}: {
  deliveries: DeliverySummary[];
  userId: string;
  timeZone: string;
}) {
  if (deliveries.length === 0) return <EmptyState size="sm" title="No deliveries yet" />;
  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {deliveries.map((delivery) => (
          <li key={delivery.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-sm shadow-sm">
            <div>
              <p className="font-semibold break-words">{delivery.supplierName ?? "No supplier"}</p>
              <p className="text-muted-foreground">
                {formatDateTime(delivery.deliveredAt, timeZone)} · {who(delivery, userId)}
              </p>
            </div>
            <Items delivery={delivery} />
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Delivered</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Logged by</TableHead>
              <TableHead>Items</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.map((delivery) => (
              <TableRow key={delivery.id} className="align-top">
                <TableCell className="whitespace-nowrap">{formatDateTime(delivery.deliveredAt, timeZone)}</TableCell>
                <TableCell>{delivery.supplierName ?? "–"}</TableCell>
                <TableCell className="break-words">{who(delivery, userId)}</TableCell>
                <TableCell className="min-w-72">
                  <Items delivery={delivery} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
