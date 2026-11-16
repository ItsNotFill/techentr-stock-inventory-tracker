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
      <span className="font-medium">{item.displayName}</span>
      {item.displayName !== item.posName ? (
        <span className="block text-sm font-normal text-muted-foreground">{item.posName}</span>
      ) : null}
    </>
  );
}

export function MenuItemList({ items }: { items: MenuItemSummary[] }) {
  return (
    <>
      {/* Phone: stacked cards. */}
      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((item) => (
          <li key={item.id} className="relative rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/menu/${item.id}`} className="after:absolute after:inset-0 after:content-['']">
                  <Names item={item} />
                </Link>
                {item.kind === "modifier" ? (
                  <Badge variant="outline" className="mt-1">
                    Modifier
                  </Badge>
                ) : null}
              </div>
              <StatusBadge item={item} />
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Category</dt>
              <dd>{item.category ?? "–"}</dd>
              <dt className="text-muted-foreground">Price</dt>
              <dd>{money(item.price)}</dd>
              <dt className="text-muted-foreground">Ingredient cost</dt>
              <dd>{money(item.recipeCost)}</dd>
            </dl>
          </li>
        ))}
      </ul>

      {/* Tablet and up: table. */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Ingredient cost</TableHead>
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
                    <Link href={href} className="block py-1">
                      <Names item={item} />
                    </Link>
                  </TableCell>
                  <TableCell>{cell(item.kind === "modifier" ? <Badge variant="outline">Modifier</Badge> : null)}</TableCell>
                  <TableCell>{cell(item.category ?? "–")}</TableCell>
                  <TableCell>{cell(money(item.price))}</TableCell>
                  <TableCell>{cell(money(item.recipeCost))}</TableCell>
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
