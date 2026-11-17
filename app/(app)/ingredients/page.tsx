import { Archive, ArchiveRestore, Carrot, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
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
      <PageHeader
        title="Ingredients"
        description="Everything you buy and count, with what is in stock and what it costs."
      >
        <Button asChild size="lg">
          <Link href="/ingredients/new">
            <Plus aria-hidden />
            Add ingredient
          </Link>
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

  const archivedToggle = (
    <Button asChild variant="ghost" size="sm" className="h-11 md:h-9">
      <Link href={includeArchived ? "/ingredients" : "/ingredients?archived=1"}>
        {includeArchived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
        {includeArchived ? "Hide archived" : "Show archived"}
      </Link>
    </Button>
  );

  const empty = ingredients.length === 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-muted-foreground">
          {empty ? null : "In stock is what the app works out from counts, deliveries, sales and waste."}
        </p>
        {archivedToggle}
      </div>
      {empty ? (
        <EmptyState
          icon={Carrot}
          title="No ingredients yet"
          description="Ingredients are what recipes use and what staff count on the shelf. Add the first one to get started."
        >
          <Button asChild size="lg">
            <Link href="/ingredients/new">
              <Plus aria-hidden />
              Add ingredient
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <IngredientList ingredients={ingredients} stock={stockById} />
      )}
    </div>
  );
}
