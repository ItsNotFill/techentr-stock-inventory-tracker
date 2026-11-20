import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Column = { name: string; what: string; example: string; required?: boolean };

const INGREDIENT_COLUMNS: Column[] = [
  { name: "name", what: "The ingredient", example: "Mozzarella", required: true },
  { name: "unit", what: "How it is counted: g, ml or unit", example: "g", required: true },
  { name: "cost, cost_per", what: "Price, and what it is for", example: "8.00 per kg" },
  { name: "pack, pack_size, pack_unit", what: "A pack you buy", example: "Bag 1 kg, 1, kg" },
  { name: "reorder_point, par_level, level_unit", what: "When to reorder, and the full shelf", example: "2 and 8 kg" },
  { name: "category, storage_area", what: "Where it belongs", example: "Dairy, Walk-in fridge" },
];

const RECIPE_COLUMNS: Column[] = [
  { name: "menu_item", what: "The item your POS sells", example: "Margherita", required: true },
  { name: "pos_item_id", what: "The POS id, if it has one", example: "P-101" },
  { name: "kind, category, price", what: "item or modifier, group, price", example: "item, Pizza, 9.50" },
  { name: "ingredient", what: "An ingredient from your list (needed for a recipe line)", example: "Mozzarella", required: true },
  { name: "amount, unit", what: "How much one sale uses (needed for a recipe line)", example: "120 g", required: true },
];

function ColumnName({ column }: { column: Column }) {
  return (
    <>
      <code>{column.name}</code>
      {column.required ? <span className="ml-2 text-xs font-normal text-muted-foreground">Required</span> : null}
    </>
  );
}

function ColumnTable({ caption, columns }: { caption: string; columns: Column[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-sm font-semibold">{caption}</h3>
      {/* Phone: one card per column. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {columns.map((column) => (
          <li key={column.name} className="rounded-lg border border-border bg-card p-3 text-sm">
            <p className="font-medium break-words">
              <ColumnName column={column} />
            </p>
            <p className="text-muted-foreground">{column.what}</p>
            <p className="text-muted-foreground">Example: {column.example}</p>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Column</TableHead>
              <TableHead>What it is</TableHead>
              <TableHead>Example</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {columns.map((column) => (
              <TableRow key={column.name}>
                <TableCell className="font-medium">
                  <ColumnName column={column} />
                </TableCell>
                <TableCell>{column.what}</TableCell>
                <TableCell className="text-muted-foreground">{column.example}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** Step 1: the two templates, a few rules, and what each column means. */
export function SetupTemplates() {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm md:p-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Step 1: Download the templates</h2>
        <p className="text-sm text-muted-foreground">Fill them in with Excel or Google Sheets. You can use one file or both.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href="/templates/ingredients.csv" download className={buttonVariants({ variant: "outline", size: "lg" })}>
          <Download aria-hidden />
          Ingredients template
        </a>
        <a href="/templates/recipes.csv" download className={buttonVariants({ variant: "outline", size: "lg" })}>
          <Download aria-hidden />
          Recipes template
        </a>
      </div>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
        <li>One line per ingredient. A second line with the same name adds a pack size.</li>
        <li>Recipes are one line per ingredient of a menu item.</li>
        <li>Units can be g, kg, ml, cl, l or unit. A decimal comma is fine.</li>
        <li>Save the sheet as CSV from Excel or Google Sheets.</li>
      </ul>
      <details className="group rounded-lg border border-border">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium text-primary hover:underline hover:underline-offset-4">
          Columns
        </summary>
        <div className="flex flex-col gap-5 border-t border-border p-3">
          <ColumnTable caption="ingredients.csv" columns={INGREDIENT_COLUMNS} />
          <ColumnTable caption="recipes.csv" columns={RECIPE_COLUMNS} />
        </div>
      </details>
    </section>
  );
}
