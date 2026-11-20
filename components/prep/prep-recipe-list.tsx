import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SubRecipeSummary } from "@/lib/sub-recipes";
import { formatUnitCost } from "@/lib/units";
import { formatMakes, formatUsedBy } from "./format";

function cost(recipe: SubRecipeSummary): string {
  return recipe.costPerUnit === null ? "–" : formatUnitCost(recipe.costPerUnit, recipe.baseUnit);
}

function ArchivedBadge() {
  return (
    <Badge variant="neutral" className="ml-2 align-middle">
      Archived
    </Badge>
  );
}

export function PrepRecipeList({ recipes }: { recipes: SubRecipeSummary[] }) {
  return (
    <>
      {/* Phone: stacked cards; the whole card opens the prep recipe. */}
      <ul className="flex flex-col gap-3 md:hidden">
        {recipes.map((recipe) => (
          <li
            key={recipe.id}
            className="relative rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:bg-row-hover has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/prep/${recipe.id}`}
                  className="font-semibold text-primary outline-none after:absolute after:inset-0 after:content-['']"
                >
                  {recipe.name}
                </Link>
                {recipe.isActive ? null : <ArchivedBadge />}
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm tabular-nums">
              <dt className="text-muted-foreground">Makes</dt>
              <dd className="text-right">{formatMakes(recipe.yieldQty, recipe.baseUnit)}</dd>
              <dt className="text-muted-foreground">Cost</dt>
              <dd className="text-right">{cost(recipe)}</dd>
              <dt className="text-muted-foreground">Used by</dt>
              <dd className="text-right">{formatUsedBy(recipe.usedBy)}</dd>
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
              <TableHead className="text-right">Makes</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Used by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recipes.map((recipe) => (
              <TableRow key={recipe.id}>
                <TableCell>
                  <Link
                    href={`/prep/${recipe.id}`}
                    className="block py-1 font-medium text-primary hover:underline hover:underline-offset-4"
                  >
                    {recipe.name}
                    {recipe.isActive ? null : <ArchivedBadge />}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatMakes(recipe.yieldQty, recipe.baseUnit)}</TableCell>
                <TableCell className="text-right tabular-nums">{cost(recipe)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatUsedBy(recipe.usedBy)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
