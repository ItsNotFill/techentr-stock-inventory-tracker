import { PackageCheck } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LowStockItem } from "@/lib/ingredients";
import { formatQty, toDecimal } from "@/lib/units";
import { cn } from "@/lib/utils";

const stockClass = (stock: string) => (toDecimal(stock).isNegative() ? "font-medium text-destructive" : undefined);

function Name({ item, link }: { item: LowStockItem; link: boolean }) {
  if (!link) return <span className="font-medium break-words">{item.name}</span>;
  return (
    <Link
      href={`/ingredients/${item.id}`}
      className="rounded-sm font-medium break-words text-primary underline-offset-4 hover:text-primary-hover hover:underline"
    >
      {item.name}
    </Link>
  );
}

/** Ingredients at or below their reorder point: cards on a phone, a table from `md`. Staff get no links. */
export function LowStockList({ items, linkToIngredients }: { items: LowStockItem[]; linkToIngredients: boolean }) {
  if (items.length === 0) {
    return <EmptyState icon={PackageCheck} size="sm" title="Nothing is low" description="Every ingredient is above its reorder point." />;
  }
  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4 text-sm shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <Name item={item} link={linkToIngredients} />
              <Badge variant="warning">Low</Badge>
            </div>
            <p className="flex justify-between gap-3">
              <span className="text-muted-foreground">In stock</span>
              <span className={cn("tabular-nums", stockClass(item.stock))}>{formatQty(item.stock, item.baseUnit)}</span>
            </p>
            <p className="flex justify-between gap-3">
              <span className="text-muted-foreground">Reorder point</span>
              <span className="tabular-nums">{formatQty(item.reorderPoint, item.baseUnit)}</span>
            </p>
            {item.toPar ? (
              <p className="flex justify-between gap-3">
                <span className="text-muted-foreground">To reach par</span>
                <span className="tabular-nums">{formatQty(item.toPar, item.baseUnit)}</span>
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ingredient</TableHead>
              <TableHead className="text-right">In stock</TableHead>
              <TableHead className="text-right">Reorder point</TableHead>
              <TableHead className="text-right">To reach par</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    <Name item={item} link={linkToIngredients} />
                    <Badge variant="warning">Low</Badge>
                  </span>
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", stockClass(item.stock))}>{formatQty(item.stock, item.baseUnit)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatQty(item.reorderPoint, item.baseUnit)}</TableCell>
                <TableCell className="text-right tabular-nums">{item.toPar ? formatQty(item.toPar, item.baseUnit) : "–"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
