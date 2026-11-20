import type { Metadata } from "next";
import { Suspense } from "react";
import { IngredientForm, NEW_INGREDIENT_DEFAULTS } from "@/components/ingredients/ingredient-form";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { listSupplierOptions } from "@/lib/purchasing";

export const metadata: Metadata = { title: "Add ingredient" };

export default function NewIngredientPage() {
  return (
    <>
      <PageHeader
        title="Add ingredient"
        description="You can add pack sizes on the next screen."
        back={{ href: "/ingredients", label: "Back to ingredients" }}
      />
      <Suspense fallback={<CardsSkeleton cards={1} />}>
        <NewIngredientContent />
      </Suspense>
    </>
  );
}

async function NewIngredientContent() {
  const membership = await requireRole(MANAGER_ROLES);
  const suppliers = await withUser((tx) => listSupplierOptions(tx, membership.locationId));
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card>
        <CardContent>
          <IngredientForm defaults={NEW_INGREDIENT_DEFAULTS} suppliers={suppliers} />
        </CardContent>
      </Card>
    </div>
  );
}
