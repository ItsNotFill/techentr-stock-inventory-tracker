import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { IngredientWithPacks } from "@/lib/ingredients";
import { isLowStock } from "@/lib/ingredients/stock";
import { formatQty, formatUnitCost, toDecimal } from "@/lib/units";
import { ArchiveButton } from "./archive-button";

function packSummary(ingredient: IngredientWithPacks): string {
  const packs = ingredient.packSizes;
  if (packs.length === 0) return "–";
  const main = packs.find((pack) => pack.isDefault) ?? packs[0];
  return packs.length > 1 ? `${main.label} (+${packs.length - 1} more)` : main.label;
}

function reorderPoint(ingredient: IngredientWithPacks): string {
  return ingredient.reorderPoint === null ? "–" : formatQty(ingredient.reorderPoint, ingredient.baseUnit);
}

function isLow(ingredient: IngredientWithPacks, stock: string): boolean {
  return isLowStock(stock, ingredient.reorderPoint);
}

/** Theoretical stock; red when negative, with a "Low" badge at or below the reorder point. */
function StockValue({ ingredient, stock }: { ingredient: IngredientWithPacks; stock: string }) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      {isLow(ingredient, stock) ? <Badge variant="warning">Low</Badge> : null}
      <span className={toDecimal(stock).isNegative() ? "font-medium text-destructive" : undefined}>
        {formatQty(stock, ingredient.baseUnit)}
      </span>
    </span>
  );
}

function ArchivedBadge() {
  return (
    <Badge variant="neutral" className="ml-2 align-middle">
      Archived
    </Badge>
  );
}

export function IngredientList({
  ingredients,
  stock,
}: {
  ingredients: IngredientWithPacks[];
  /** Theoretical stock in base units per ingredient id, as decimal strings. */
  stock: Record<string, string>;
}) {
  const stockOf = (ingredient: IngredientWithPacks) => stock[ingredient.id] ?? "0.000";
  const showRestore = ingredients.some((ingredient) => !ingredient.isActive);
  return (
    <>
      {/* Phone: stacked cards; the whole card opens the ingredient. */}
      <ul className="flex flex-col gap-3 md:hidden">
        {ingredients.map((ingredient) => (
          <li
            key={ingredient.id}
            className="relative rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:bg-row-hover has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/ingredients/${ingredient.id}`}
                  className="font-semibold text-primary outline-none after:absolute after:inset-0 after:content-['']"
                >
                  {ingredient.name}
                </Link>
                {ingredient.isActive ? null : <ArchivedBadge />}
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm tabular-nums">
              <dt className="text-muted-foreground">In stock</dt>
              <dd className="text-right">
                <StockValue ingredient={ingredient} stock={stockOf(ingredient)} />
              </dd>
              <dt className="text-muted-foreground">Cost</dt>
              <dd className="text-right">{formatUnitCost(ingredient.costPerBaseUnit, ingredient.baseUnit)}</dd>
              <dt className="text-muted-foreground">Reorder point</dt>
              <dd className="text-right">{reorderPoint(ingredient)}</dd>
              <dt className="text-muted-foreground">Storage area</dt>
              <dd className="text-right">{ingredient.storageArea ?? "–"}</dd>
              <dt className="text-muted-foreground">Pack sizes</dt>
              <dd className="text-right">{packSummary(ingredient)}</dd>
            </dl>
            {ingredient.isActive ? null : (
              <div className="relative z-10 mt-3">
                <ArchiveButton ingredientId={ingredient.id} archived />
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Tablet and up: table; every cell opens the ingredient. */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">In stock</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Reorder point</TableHead>
              <TableHead>Storage area</TableHead>
              <TableHead>Pack sizes</TableHead>
              {showRestore ? <TableHead className="w-28" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ingredients.map((ingredient) => {
              const href = `/ingredients/${ingredient.id}`;
              const cell = (content: React.ReactNode) => (
                <Link href={href} className="block py-1" tabIndex={-1}>
                  {content}
                </Link>
              );
              return (
                <TableRow key={ingredient.id}>
                  <TableCell>
                    <Link href={href} className="block py-1 font-medium text-primary hover:underline hover:underline-offset-4">
                      {ingredient.name}
                      {ingredient.isActive ? null : <ArchivedBadge />}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{cell(ingredient.baseUnit)}</TableCell>
                  <TableCell className="text-right">
                    {cell(<StockValue ingredient={ingredient} stock={stockOf(ingredient)} />)}
                  </TableCell>
                  <TableCell className="text-right">
                    {cell(formatUnitCost(ingredient.costPerBaseUnit, ingredient.baseUnit))}
                  </TableCell>
                  <TableCell className="text-right">{cell(reorderPoint(ingredient))}</TableCell>
                  <TableCell>{cell(ingredient.storageArea ?? "–")}</TableCell>
                  <TableCell>{cell(packSummary(ingredient))}</TableCell>
                  {showRestore ? (
                    <TableCell className="text-right">
                      {ingredient.isActive ? null : <ArchiveButton ingredientId={ingredient.id} archived size="default" />}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
