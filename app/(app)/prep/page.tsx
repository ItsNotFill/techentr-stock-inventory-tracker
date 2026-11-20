import { Archive, ArchiveRestore, CookingPot, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/page-skeleton";
import { PrepRecipeList } from "@/components/prep/prep-recipe-list";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { listSubRecipes } from "@/lib/sub-recipes";

export const metadata: Metadata = { title: "Prep recipes" };

export default function PrepRecipesPage({ searchParams }: PageProps<"/prep">) {
  return (
    <>
      <PageHeader
        title="Prep recipes"
        description="Sauces, doughs and mixes your kitchen makes. Menu recipes can use them like ingredients."
      >
        <Button asChild size="lg">
          <Link href="/prep/new">
            <Plus aria-hidden />
            Add prep recipe
          </Link>
        </Button>
      </PageHeader>
      <Suspense fallback={<TableSkeleton />}>
        <PrepContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function PrepContent({ searchParams }: { searchParams: PageProps<"/prep">["searchParams"] }) {
  const membership = await requireRole(MANAGER_ROLES);
  const { archived } = await searchParams;
  const includeArchived = archived === "1";
  const recipes = await withUser((tx) => listSubRecipes(tx, membership.locationId, { includeArchived }));

  const archivedToggle = (
    <Button asChild variant="outline" size="sm">
      <Link href={includeArchived ? "/prep" : "/prep?archived=1"}>
        {includeArchived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
        {includeArchived ? "Hide archived" : "Show archived"}
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-muted-foreground">
          {recipes.length === 0 ? null : "Cost is worked out from today's ingredient costs."}
        </p>
        {archivedToggle}
      </div>
      {recipes.length === 0 ? (
        <EmptyState
          icon={CookingPot}
          title="No prep recipes yet"
          description="A prep recipe is something you make in batches and use in other recipes. For example, tomato sauce: makes 5 l from 4 kg tomatoes and 200 ml olive oil."
        >
          <Button asChild size="lg">
            <Link href="/prep/new">
              <Plus aria-hidden />
              Add prep recipe
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <PrepRecipeList recipes={recipes} />
      )}
    </div>
  );
}
