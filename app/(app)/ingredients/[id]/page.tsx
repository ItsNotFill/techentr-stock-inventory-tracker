import type { Metadata } from "next";
import { History } from "lucide-react";
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
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { baseUnitLocked, getIngredient, type IngredientWithPacks } from "@/lib/ingredients";
import { DISPLAY_UNITS, fromBaseUnits, toDecimal, type Quantity } from "@/lib/units";
import { idSchema } from "@/lib/validation/ingredients";

export const metadata: Metadata = { title: "Edit ingredient" };

const DESCRIPTION = "Name, unit, cost and stock levels, and the pack sizes it is delivered in.";
const BACK = { href: "/ingredients", label: "Back to ingredients" };

export default function EditIngredientPage({ params }: PageProps<"/ingredients/[id]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Ingredient" description={DESCRIPTION} back={BACK} />
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
  // A malformed id can never match; real database errors still reach the error screen.
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) notFound();
  const { ingredient, unitLocked } = await withUser(async (tx) => ({
    ingredient: await getIngredient(tx, membership.locationId, parsedId.data),
    unitLocked: await baseUnitLocked(tx, membership.locationId, parsedId.data),
  }));
  if (!ingredient) notFound();

  return (
    <>
      <PageHeader
        title={ingredient.name}
        description={DESCRIPTION}
        back={BACK}
        badge={ingredient.isActive ? null : <Badge variant="neutral">Archived</Badge>}
      >
        <Link href={`/history?ingredient=${ingredient.id}`} className={buttonVariants({ variant: "outline" })}>
          <History aria-hidden />
          Stock history
        </Link>
      </PageHeader>
      <div className="flex max-w-2xl flex-col gap-6">
        <Card>
          <CardContent>
            {/* key: start again from the saved values when they change. */}
            <IngredientForm
              key={JSON.stringify(toDefaults(ingredient))}
              defaults={toDefaults(ingredient)}
              unitLocked={unitLocked}
            />
          </CardContent>
        </Card>
        <PackSizesEditor
          // key: the unit choices start again when the ingredient's unit changes.
          key={ingredient.baseUnit}
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
