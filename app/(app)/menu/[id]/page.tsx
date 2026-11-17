import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ItemActions } from "@/components/menu/item-actions";
import { MenuItemForm, type MenuItemFormDefaults } from "@/components/menu/menu-item-form";
import { RecipeEditor, type RecipeIngredientOption, type RecipeRow } from "@/components/menu/recipe-editor";
import { StatusBadge } from "@/components/menu/status-badge";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { listIngredients } from "@/lib/ingredients";
import { getMenuItem, type MenuItemDetail } from "@/lib/menu";
import { toDecimal } from "@/lib/units";
import { idSchema } from "@/lib/validation/ingredients";

export const metadata: Metadata = { title: "Menu item" };

const DESCRIPTION = "The item as your POS sells it, and the recipe each sale uses up.";
const BACK = { href: "/menu", label: "Back to menu" };

export default function MenuItemPage({ params }: PageProps<"/menu/[id]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Menu item" description={DESCRIPTION} back={BACK} />
          <CardsSkeleton cards={2} />
        </>
      }
    >
      <MenuItemContent params={params} />
    </Suspense>
  );
}

function toDefaults(item: MenuItemDetail): MenuItemFormDefaults {
  return {
    id: item.id,
    posName: item.posName,
    displayName: item.displayName !== item.posName ? item.displayName : "",
    posItemId: item.posItemId ?? "",
    kind: item.kind,
    category: item.category ?? "",
    price: item.price === null ? "" : toDecimal(item.price).toFixed(),
  };
}

async function MenuItemContent({ params }: { params: PageProps<"/menu/[id]">["params"] }) {
  const membership = await requireRole(MANAGER_ROLES);
  const { id } = await params;
  // A malformed id can never match; real database errors still reach the error screen.
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) notFound();
  const { item, ingredients } = await withUser(async (tx) => ({
    item: await getMenuItem(tx, membership.locationId, parsedId.data),
    ingredients: await listIngredients(tx, membership.locationId),
  }));
  if (!item) notFound();

  const options: RecipeIngredientOption[] = ingredients.map((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    baseUnit: ingredient.baseUnit,
    costPerBaseUnit: ingredient.costPerBaseUnit,
    archived: false,
  }));
  const rows: RecipeRow[] = [];
  let suggestionsWithoutIngredient = 0;
  for (const line of item.lines) {
    if (line.ingredientId === null || line.baseUnit === null) {
      if (!line.confirmed) suggestionsWithoutIngredient += 1;
      continue;
    }
    if (!options.some((option) => option.id === line.ingredientId)) {
      // An archived ingredient stays visible on its row.
      options.push({
        id: line.ingredientId,
        name: line.ingredientName ?? "Unknown ingredient",
        baseUnit: line.baseUnit,
        costPerBaseUnit: line.costPerBaseUnit ?? "0",
        archived: line.ingredientActive === false,
      });
    }
    rows.push({
      ingredientId: line.ingredientId,
      amount: toDecimal(line.qtyBaseUnit).toFixed(),
      unit: line.baseUnit,
      draft: !line.confirmed,
    });
  }

  return (
    <>
      <PageHeader title={item.displayName} description={DESCRIPTION} back={BACK} badge={<StatusBadge item={item} />} />
      <div className="flex max-w-2xl flex-col gap-6">
        <Card>
          <CardContent>
            {/* key: start again from the saved values when they change. */}
            <MenuItemForm key={JSON.stringify(toDefaults(item))} defaults={toDefaults(item)} />
          </CardContent>
        </Card>
        {item.isIgnored ? null : (
          <RecipeEditor
            key={JSON.stringify([rows, options])}
            menuItemId={item.id}
            ingredients={options}
            initialRows={rows}
            hasRecipe={item.isMapped}
            suggestionsWithoutIngredient={suggestionsWithoutIngredient}
          />
        )}
        <ItemActions menuItemId={item.id} hasRecipe={item.isMapped} ignored={item.isIgnored} />
      </div>
    </>
  );
}
