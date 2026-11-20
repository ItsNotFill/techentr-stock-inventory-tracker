import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatDateTime, plural } from "@/components/import/format";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PurchaseOrderSummary } from "@/lib/purchasing";

/** "Sent 16 Nov 2026, 12:05": the date that matches the status. */
function when(order: PurchaseOrderSummary, timeZone: string): string {
  if (order.status === "received" && order.receivedAt) return `Received ${formatDateTime(order.receivedAt, timeZone)}`;
  if (order.status === "sent" && order.sentAt) return `Sent ${formatDateTime(order.sentAt, timeZone)}`;
  return `Created ${formatDateTime(order.createdAt, timeZone)}`;
}

/** The purchase orders: cards on a phone, a table from `md`. */
export function OrderList({ orders, timeZone }: { orders: PurchaseOrderSummary[]; timeZone: string }) {
  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {orders.map((order) => (
          <li
            key={order.id}
            className="relative rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:bg-row-hover has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring"
          >
            <div className="flex items-start justify-between gap-3">
              <Link href={`/orders/${order.id}`} className="font-semibold text-primary outline-none after:absolute after:inset-0 after:content-['']">
                {order.supplierName}
              </Link>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <OrderStatusBadge status={order.status} />
              <span className="text-sm text-muted-foreground">{plural(order.lineCount, "line", "lines")}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{when(order, timeZone)}</p>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Lines</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <Link href={`/orders/${order.id}`} className="rounded-sm font-medium text-primary underline-offset-4 hover:text-primary-hover hover:underline">
                    {order.supplierName}
                  </Link>
                </TableCell>
                <TableCell>
                  <OrderStatusBadge status={order.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{order.lineCount}</TableCell>
                <TableCell className="text-muted-foreground">{when(order, timeZone)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
