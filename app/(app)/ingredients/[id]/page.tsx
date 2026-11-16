import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArchiveButton } from "@/components/ingredients/archive-button";
import { IngredientForm, type IngredientFormDefaults } from "@/components/ingredients/ingredient-form";
import { PackSizesEditor } from "@/components/ingredients/pack-sizes-editor";
import { DEFAULT_DISPLAY_UNIT } from "@/components/ingredients/units";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { getIngredient, type IngredientWithPacks } from "@/lib/ingredients";
import { DISPLAY_UNITS, fromBaseUnits, toDecimal, type Quantity } from "@/lib/units";

export const metadata: Metadata = { title: "Edit ingredient" };

export default function EditIngredientPage({ params }: PageProps<"/ingredients/[id]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Ingredient" />
          <CardsSkeleton cards={1} />
        </>
      }
    >
      <EditIngredientContent params={params} />
    </Suspense>
  );
}

/** Plain decimal text for an input: no thousands separators, no trailing zeros. */
function plain(value: Quantity, decimals: number): string {
  return toDecimal(value).toDecimalPlaces(decimals).toFixed();
}

function toDefaults(ingredient: IngredientWithPacks): IngredientFormDefaults {
  const { baseUnit } = ingredient;
  const unit = DEFAULT_DISPLAY_UNIT[baseUnit];
  const factor = DISPLAY_UNITS[baseUnit].find((entry) => entry.unit === unit)!.factor;
  const level = (value: string | null) => (value === null ? "" : plain(fromBaseUnits(value, unit, baseUnit), 3));
  return {
    id: ingredient.id,
    name: ingredient.name,
    baseUnit,
    costAmount: plain(toDecimal(ingredient.costPerBaseUnit).times(factor), 6),
    costUnit: unit,
    reorderPoint: level(ingredient.reorderPoint),
    parLevel: level(ingredient.parLevel),
    levelUnit: unit,
    category: ingredient.category ?? "",
    storageArea: ingredient.storageArea ?? "",
  };
}

async function EditIngredientContent({ params }: { params: PageProps<"/ingredients/[id]">["params"] }) {
  const membership = await requireRole(MANAGER_ROLES);
  const { id } = await params;
  // A malformed id fails the uuid cast in the query, which is the same as "not found".
  const ingredient = await withUser((tx) => getIngredient(tx, membership.locationId, id)).catch(() => null);
  if (!ingredient) notFound();

  return (
    <>
      <PageHeader title={ingredient.name}>
        {ingredient.isActive ? null : <Badge variant="secondary">Archived</Badge>}
      </PageHeader>
      <div className="flex max-w-2xl flex-col gap-6">
        <Link href="/ingredients" className="text-sm text-muted-foreground underline underline-offset-4">
          Back to ingredients
        </Link>
        <Card>
          <CardContent>
            {/* key: start again from the saved values when they change. */}
            <IngredientForm
              key={JSON.stringify(toDefaults(ingredient))}
              defaults={toDefaults(ingredient)}
              unitLocked={ingredient.packSizes.length > 0}
            />
          </CardContent>
        </Card>
        <PackSizesEditor
          ingredientId={ingredient.id}
          baseUnit={ingredient.baseUnit}
          packSizes={ingredient.packSizes.map((pack) => ({
            id: pack.id,
            label: pack.label,
            qtyInBaseUnit: pack.qtyInBaseUnit,
            isDefault: pack.isDefault,
          }))}
        />
        <div>
          <ArchiveButton ingredientId={ingredient.id} archived={!ingredient.isActive} />
        </div>
      </div>
    </>
  );
}
