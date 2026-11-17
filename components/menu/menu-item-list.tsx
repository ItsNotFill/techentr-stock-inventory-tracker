import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MenuItemSummary } from "@/lib/menu";
import { formatMoney } from "@/lib/units";
import { StatusBadge } from "./status-badge";

function money(value: string | null): string {
  return value === null ? "–" : formatMoney(value);
}

function Names({ item }: { item: MenuItemSummary }) {
  return (
    <>
      <span className="font-medium text-primary">{item.displayName}</span>
      {item.displayName !== item.posName ? (
        <span className="block text-table font-normal text-muted-foreground">{item.posName}</span>
      ) : null}
    </>
  );
}

export function MenuItemList({ items }: { items: MenuItemSummary[] }) {
  return (
    <>
      {/* Phone: stacked cards; the whole card opens the item. */}
      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((item) => (
          <li
            key={item.id}
            className="relative rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:bg-row-hover has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/menu/${item.id}`}
                  className="font-semibold outline-none after:absolute after:inset-0 after:content-['']"
                >
                  <Names item={item} />
                </Link>
                {item.kind === "modifier" ? (
                  <Badge variant="outline" className="mt-1">
                    Modifier
                  </Badge>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <StatusBadge item={item} />
                <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm tabular-nums">
              <dt className="text-muted-foreground">Category</dt>
              <dd className="text-right">{item.category ?? "–"}</dd>
              <dt className="text-muted-foreground">Price</dt>
              <dd className="text-right">{money(item.price)}</dd>
              <dt className="text-muted-foreground">Ingredient cost</dt>
              <dd className="text-right">{money(item.recipeCost)}</dd>
            </dl>
          </li>
        ))}
      </ul>

      {/* Tablet and up: table; every cell opens the item. */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Ingredient cost</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const href = `/menu/${item.id}`;
              const cell = (content: React.ReactNode) => (
                <Link href={href} className="block py-1" tabIndex={-1}>
                  {content}
                </Link>
              );
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link href={href} className="block py-1 hover:underline hover:decoration-primary hover:underline-offset-4">
                      <Names item={item} />
                    </Link>
                  </TableCell>
                  <TableCell>{cell(item.kind === "modifier" ? <Badge variant="outline">Modifier</Badge> : null)}</TableCell>
                  <TableCell>{cell(item.category ?? "–")}</TableCell>
                  <TableCell className="text-right">{cell(money(item.price))}</TableCell>
                  <TableCell className="text-right">{cell(money(item.recipeCost))}</TableCell>
                  <TableCell>{cell(<StatusBadge item={item} />)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
