import { Badge } from "@/components/ui/badge";
import { MetricCard, MetricGrid } from "@/components/metric-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { IngredientPlan, MenuItemPlan, SetupPlan } from "@/lib/setup-import";

const UNIT_LABELS = { g: "g", ml: "ml", unit: "unit" } as const;

function IngredientBadges({ item }: { item: IngredientPlan }) {
  return (
    <span className="flex flex-wrap gap-1">
      <Badge variant={item.action === "create" ? "success" : "neutral"}>
        {item.action === "create" ? "New" : "Already there"}
      </Badge>
      {item.archived ? <Badge variant="neutral">Archived</Badge> : null}
    </span>
  );
}

function packs(item: IngredientPlan): string | null {
  const count = item.packsToAdd.length;
  if (count === 0) return null;
  const labels = item.packsToAdd.map((pack) => pack.label).join(", ");
  return `+${count} pack ${count === 1 ? "size" : "sizes"} (${labels})`;
}

function RecipeStatus({ item }: { item: MenuItemPlan }) {
  switch (item.recipe) {
    case "new":
      return <Badge variant="success">New recipe</Badge>;
    case "replace":
      return <Badge variant="warning">Replaces the current recipe ({item.previousLineCount} lines)</Badge>;
    case "same":
      return <Badge variant="neutral">Unchanged</Badge>;
    default:
      return <span className="text-sm text-muted-foreground">No recipe: it will wait under Needs recipe</span>;
  }
}

function recipeLines(item: MenuItemPlan): string {
  return item.lines.map((line) => `${line.amount} ${line.unit} ${line.ingredientName}`).join(" · ");
}

function ItemBadge({ action }: { action: "create" | "keep" }) {
  return <Badge variant={action === "create" ? "success" : "neutral"}>{action === "create" ? "New" : "Already there"}</Badge>;
}

function IngredientList({ items }: { items: IngredientPlan[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-base font-semibold">Ingredients ({items.length})</h3>
      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((item) => (
          <li key={`${item.line}-${item.name}`} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 font-semibold break-words">{item.name}</p>
              <IngredientBadges item={item} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Unit: {UNIT_LABELS[item.baseUnit]}</p>
            {packs(item) ? <p className="mt-1 text-sm">{packs(item)}</p> : null}
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pack sizes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={`${item.line}-${item.name}`}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{UNIT_LABELS[item.baseUnit]}</TableCell>
                <TableCell>
                  <IngredientBadges item={item} />
                </TableCell>
                <TableCell>{packs(item) ?? <span className="text-muted-foreground">–</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function MenuList({ items }: { items: MenuItemPlan[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-base font-semibold">Menu items ({items.length})</h3>
      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((item) => (
          <li key={`${item.line}-${item.posName}`} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold break-words">{item.posName}</p>
                {item.posItemId ? <p className="text-sm text-muted-foreground">{item.posItemId}</p> : null}
              </div>
              <ItemBadge action={item.action} />
            </div>
            <div className="mt-2 flex flex-col gap-1">
              <span>
                <RecipeStatus item={item} />
              </span>
              {item.lines.length > 0 ? <p className="text-sm text-muted-foreground tabular-nums">{recipeLines(item)}</p> : null}
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Recipe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={`${item.line}-${item.posName}`}>
                <TableCell className="font-medium">
                  {item.posName}
                  {item.posItemId ? (
                    <span className="block text-table font-normal text-muted-foreground">{item.posItemId}</span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <ItemBadge action={item.action} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  <RecipeStatus item={item} />
                  {item.lines.length > 0 ? (
                    <span className="mt-1 block text-table text-muted-foreground tabular-nums">{recipeLines(item)}</span>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

/** What an import would do: the figures, then the ingredients and menu items. */
export function SetupPreview({ plan }: { plan: SetupPlan }) {
  const { counts } = plan;
  return (
    <div className="flex flex-col gap-6">
      <MetricGrid>
        <MetricCard label="New ingredients" value={counts.ingredientsCreated} />
        <MetricCard label="Ingredients already there" value={counts.ingredientsKept} />
        <MetricCard label="Pack sizes to add" value={counts.packsAdded} />
        <MetricCard label="New menu items" value={counts.menuItemsCreated} />
        <MetricCard label="Menu items already there" value={counts.menuItemsKept} />
        <MetricCard label="Recipes to save" value={counts.recipesSaved} />
      </MetricGrid>
      {plan.ingredients.length > 0 ? <IngredientList items={plan.ingredients} /> : null}
      {plan.menuItems.length > 0 ? <MenuList items={plan.menuItems} /> : null}
    </div>
  );
}
