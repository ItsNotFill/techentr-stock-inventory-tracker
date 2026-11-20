import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { CreateOrderButton } from "@/components/orders/create-order-button";
import { quantityText } from "@/components/orders/lines";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SuggestedLine, SupplierSuggestion } from "@/lib/purchasing";
import { formatQty, toDecimal } from "@/lib/units";
import { PackageCheck } from "lucide-react";

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 md:flex-col md:justify-start md:gap-0.5 md:text-right">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function Line({ line }: { line: SuggestedLine }) {
  const onOrder = toDecimal(line.onOrder).gt(0);
  return (
    <li className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0 md:grid md:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,1fr))] md:items-start md:gap-4">
      <p className="font-medium break-words">{line.name}</p>
      <dl className="contents text-sm">
        <Figure label="In stock" value={formatQty(line.stock, line.baseUnit)} />
        <Figure label="Reorder at" value={formatQty(line.reorderPoint, line.baseUnit)} />
        {onOrder ? <Figure label="On order" value={formatQty(line.onOrder, line.baseUnit)} /> : <div className="hidden md:block" />}
        <div className="flex justify-between gap-3 md:flex-col md:justify-start md:gap-0.5 md:text-right">
          <dt className="text-muted-foreground">Suggested</dt>
          <dd className="font-medium tabular-nums">{quantityText(line)}</dd>
        </div>
      </dl>
    </li>
  );
}

/** What to order, one card per supplier. Ingredients without a supplier come last, with a link to set one. */
export function Suggestions({ groups }: { groups: SupplierSuggestion[] }) {
  if (groups.length === 0) {
    return <EmptyState icon={PackageCheck} size="sm" title="Nothing to order right now" description="Every ingredient is above its reorder point, or already on order." />;
  }
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <Card key={group.supplier?.id ?? "none"}>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{group.supplier ? group.supplier.name : "No supplier"}</CardTitle>
            {group.supplier ? <CreateOrderButton supplierId={group.supplier.id} fromSuggestions label="Create order" /> : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {group.supplier ? null : (
              <p className="text-sm text-muted-foreground">
                Set a supplier on these ingredients to order them.{" "}
                <Link href="/suppliers" className="rounded-sm font-medium text-primary underline-offset-4 hover:text-primary-hover hover:underline">
                  Go to suppliers
                </Link>
              </p>
            )}
            <ul className="flex flex-col">
              {group.lines.map((line) => (
                <Line key={line.ingredientId} line={line} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
