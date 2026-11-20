import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DEFAULT_DISPLAY_UNIT } from "@/components/ingredients/units";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { ArchivePrepButton } from "@/components/prep/archive-prep-button";
import { loadPrepPickerOptions } from "@/components/prep/options";
import { PrepRecipeForm, type PrepFormDefaults, type PrepOption } from "@/components/prep/prep-recipe-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { getSubRecipe, type SubRecipeDetail } from "@/lib/sub-recipes";
import { DISPLAY_UNITS, fromBaseUnits } from "@/lib/units";
import { idSchema } from "@/lib/validation/ingredients";

export const metadata: Metadata = { title: "Edit prep recipe" };

const DESCRIPTION = "What it makes, how much, and what goes into one batch.";
const BACK = { href: "/prep", label: "Back to prep recipes" };

export default function EditPrepRecipePage({ params }: PageProps<"/prep/[id]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Prep recipe" description={DESCRIPTION} back={BACK} />
          <CardsSkeleton cards={1} />
        </>
      }
    >
      <EditPrepRecipeContent params={params} />
    </Suspense>
  );
}

/** Plain decimal text for an input: no thousands separators, no trailing zeros. */
function plain(qtyBase: string, unit: string, baseUnit: SubRecipeDetail["baseUnit"]): string {
  return fromBaseUnits(qtyBase, unit, baseUnit).toDecimalPlaces(6).toFixed();
}

/** A unit that shows the amount as a short number: the largest one that keeps it at 1 or more. */
function readableUnit(qtyBase: string, baseUnit: SubRecipeDetail["baseUnit"]): string {
  const units = DISPLAY_UNITS[baseUnit];
  const fallback = units[0].unit;
  const preferred = DEFAULT_DISPLAY_UNIT[baseUnit];
  return fromBaseUnits(qtyBase, preferred, baseUnit).abs().gte(1) ? preferred : fallback;
}

async function EditPrepRecipeContent({ params }: { params: PageProps<"/prep/[id]">["params"] }) {
  const membership = await requireRole(MANAGER_ROLES);
  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) notFound();
  const recipe = await withUser((tx) => getSubRecipe(tx, membership.locationId, parsedId.data));
  if (!recipe) notFound();
  const picker = await loadPrepPickerOptions(membership.locationId, recipe.id);

  // A line may use something archived since; keep it visible so it can be seen and removed.
  const options: PrepOption[] = [...picker];
  for (const line of recipe.lines) {
    const value = line.ingredientId ? `i:${line.ingredientId}` : `p:${line.subRecipeId}`;
    if (!options.some((option) => option.value === value)) {
      options.push({
        value,
        kind: line.ingredientId ? "ingredient" : "prep",
        name: `${line.name} (archived)`,
        baseUnit: line.baseUnit,
        costPerBaseUnit: line.costPerBaseUnit,
      });
    }
  }

  const yieldUnit = readableUnit(recipe.yieldQty, recipe.baseUnit);
  const defaults: PrepFormDefaults = {
    name: recipe.name,
    baseUnit: recipe.baseUnit,
    yieldAmount: plain(recipe.yieldQty, yieldUnit, recipe.baseUnit),
    yieldUnit,
    category: recipe.category ?? "",
    lines: recipe.lines.map((line) => {
      const unit = readableUnit(line.qtyBaseUnit, line.baseUnit);
      return {
        target: line.ingredientId ? `i:${line.ingredientId}` : `p:${line.subRecipeId}`,
        amount: plain(line.qtyBaseUnit, unit, line.baseUnit),
        unit,
      };
    }),
  };
  const usedByCount = recipe.usedBy.menuItems.length + recipe.usedBy.prepRecipes.length;

  return (
    <>
      <PageHeader
        title={recipe.name}
        description={DESCRIPTION}
        back={BACK}
        badge={recipe.isActive ? null : <Badge variant="neutral">Archived</Badge>}
      />
      <div className="flex max-w-3xl flex-col gap-6">
        <Card>
          <CardContent>
            {/* key: start again from the saved values when they change. */}
            <PrepRecipeForm
              key={JSON.stringify(defaults)}
              id={recipe.id}
              defaults={defaults}
              options={options}
              baseUnitLocked={recipe.baseUnitLocked}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Used by</CardTitle>
          </CardHeader>
          <CardContent>
            {usedByCount === 0 ? (
              <p className="text-sm text-muted-foreground">No menu item or prep recipe uses it yet.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {recipe.usedBy.menuItems.map((item) => (
                  <li key={`m-${item.id}`}>
                    <Link href={`/menu/${item.id}`} className="font-medium text-primary hover:underline hover:underline-offset-4">
                      {item.name}
                    </Link>
                    <span className="text-muted-foreground"> · menu item</span>
                  </li>
                ))}
                {recipe.usedBy.prepRecipes.map((item) => (
                  <li key={`p-${item.id}`}>
                    <Link href={`/prep/${item.id}`} className="font-medium text-primary hover:underline hover:underline-offset-4">
                      {item.name}
                    </Link>
                    <span className="text-muted-foreground"> · prep recipe</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <div>
          <ArchivePrepButton id={recipe.id} archived={!recipe.isActive} />
        </div>
      </div>
    </>
  );
}
