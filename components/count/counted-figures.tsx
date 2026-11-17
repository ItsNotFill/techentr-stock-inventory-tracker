import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CountSheetIngredient } from "@/lib/counts";
import { formatQty } from "@/lib/units";

/** What was counted, read-only. No money and no expected figures. */
export function CountedFigures({ ingredients }: { ingredients: CountSheetIngredient[] }) {
  const counted = ingredients.filter((ingredient) => ingredient.countedQty !== null);
  if (counted.length === 0) {
    return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No ingredients were counted.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ingredient</TableHead>
          <TableHead className="text-right">Counted</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {counted.map((ingredient) => (
          <TableRow key={ingredient.id}>
            <TableCell className="whitespace-normal break-words">{ingredient.name}</TableCell>
            <TableCell className="text-right whitespace-nowrap">{formatQty(ingredient.countedQty ?? "0", ingredient.baseUnit)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
