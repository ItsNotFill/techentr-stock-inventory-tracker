import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { IngredientList } from "@/components/ingredients/ingredient-list";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { listIngredients } from "@/lib/ingredients";
import { stockNow, stockOf } from "@/lib/ledger";

export const metadata: Metadata = { title: "Ingredients" };

export default function IngredientsPage({ searchParams }: PageProps<"/ingredients">) {
  return (
    <>
      <PageHeader title="Ingredients">
        <Button asChild size="lg" className="h-11">
          <Link href="/ingredients/new">Add ingredient</Link>
        </Button>
      </PageHeader>
      <Suspense fallback={<TableSkeleton />}>
        <IngredientsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function IngredientsContent({ searchParams }: { searchParams: PageProps<"/ingredients">["searchParams"] }) {
  const membership = await requireRole(MANAGER_ROLES);
  const { archived } = await searchParams;
  const includeArchived = archived === "1";
  const { ingredients, stock } = await withUser(async (tx) => ({
    ingredients: await listIngredients(tx, membership.locationId, { includeArchived }),
    stock: await stockNow(tx, membership.locationId),
  }));
  const stockById = Object.fromEntries(ingredients.map((ingredient) => [ingredient.id, stockOf(stock, ingredient.id)]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button asChild variant="link" className="h-11">
          <Link href={includeArchived ? "/ingredients" : "/ingredients?archived=1"}>
            {includeArchived ? "Hide archived" : "Show archived"}
          </Link>
        </Button>
      </div>
      {ingredients.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">No ingredients yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Ingredients are what recipes use and what staff count on the shelf. Add the first one to get started.
          </p>
          <Button asChild size="lg" className="h-11">
            <Link href="/ingredients/new">Add ingredient</Link>
          </Button>
        </div>
      ) : (
        <IngredientList ingredients={ingredients} stock={stockById} />
      )}
    </div>
  );
}
