import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { loadPrepPickerOptions } from "@/components/prep/options";
import { NEW_PREP_DEFAULTS, PrepRecipeForm } from "@/components/prep/prep-recipe-form";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Add prep recipe" };

export default function NewPrepRecipePage() {
  return (
    <>
      <PageHeader
        title="Add prep recipe"
        description="What it makes, how much, and what goes into one batch."
        back={{ href: "/prep", label: "Back to prep recipes" }}
      />
      <Suspense fallback={<CardsSkeleton cards={1} />}>
        <NewPrepRecipeContent />
      </Suspense>
    </>
  );
}

async function NewPrepRecipeContent() {
  const membership = await requireRole(MANAGER_ROLES);
  const options = await loadPrepPickerOptions(membership.locationId, null);
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardContent>
          <PrepRecipeForm id={null} defaults={NEW_PREP_DEFAULTS} options={options} />
        </CardContent>
      </Card>
    </div>
  );
}
