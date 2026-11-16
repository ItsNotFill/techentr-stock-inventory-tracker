import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { IngredientWithPacks } from "@/lib/ingredients";
import { formatQty, formatUnitCost } from "@/lib/units";
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

export function IngredientList({ ingredients }: { ingredients: IngredientWithPacks[] }) {
  const showRestore = ingredients.some((ingredient) => !ingredient.isActive);
  return (
    <>
      {/* Phone: stacked cards. */}
      <ul className="flex flex-col gap-3 md:hidden">
        {ingredients.map((ingredient) => (
          <li key={ingredient.id} className="relative rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/ingredients/${ingredient.id}`}
                  className="font-medium after:absolute after:inset-0 after:content-['']"
                >
                  {ingredient.name}
                </Link>
                {ingredient.isActive ? null : (
                  <Badge variant="secondary" className="ml-2">
                    Archived
                  </Badge>
                )}
              </div>
              <span className="shrink-0 text-sm text-muted-foreground">{ingredient.baseUnit}</span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Cost</dt>
              <dd>{formatUnitCost(ingredient.costPerBaseUnit, ingredient.baseUnit)}</dd>
              <dt className="text-muted-foreground">Reorder point</dt>
              <dd>{reorderPoint(ingredient)}</dd>
              <dt className="text-muted-foreground">Storage area</dt>
              <dd>{ingredient.storageArea ?? "–"}</dd>
              <dt className="text-muted-foreground">Pack sizes</dt>
              <dd>{packSummary(ingredient)}</dd>
            </dl>
            {ingredient.isActive ? null : (
              <div className="relative z-10 mt-3">
                <ArchiveButton ingredientId={ingredient.id} archived />
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Tablet and up: table. */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Reorder point</TableHead>
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
                  <TableCell className="font-medium">
                    <Link href={href} className="block py-1">
                      {ingredient.name}
                      {ingredient.isActive ? null : (
                        <Badge variant="secondary" className="ml-2">
                          Archived
                        </Badge>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell>{cell(ingredient.baseUnit)}</TableCell>
                  <TableCell>{cell(formatUnitCost(ingredient.costPerBaseUnit, ingredient.baseUnit))}</TableCell>
                  <TableCell>{cell(reorderPoint(ingredient))}</TableCell>
                  <TableCell>{cell(ingredient.storageArea ?? "–")}</TableCell>
                  <TableCell>{cell(packSummary(ingredient))}</TableCell>
                  {showRestore ? (
                    <TableCell>
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
