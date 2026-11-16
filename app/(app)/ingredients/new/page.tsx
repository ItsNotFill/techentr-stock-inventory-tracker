import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { IngredientForm, NEW_INGREDIENT_DEFAULTS } from "@/components/ingredients/ingredient-form";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Add ingredient" };

export default function NewIngredientPage() {
  return (
    <>
      <PageHeader title="Add ingredient" description="You can add pack sizes on the next screen." />
      <Suspense fallback={<CardsSkeleton cards={1} />}>
        <NewIngredientContent />
      </Suspense>
    </>
  );
}

async function NewIngredientContent() {
  await requireRole(MANAGER_ROLES);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Link href="/ingredients" className="text-sm text-muted-foreground underline underline-offset-4">
        Back to ingredients
      </Link>
      <Card>
        <CardContent>
          <IngredientForm defaults={NEW_INGREDIENT_DEFAULTS} />
        </CardContent>
      </Card>
    </div>
  );
}
