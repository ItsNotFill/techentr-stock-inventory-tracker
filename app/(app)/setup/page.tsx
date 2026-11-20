import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/page-skeleton";
import { SetupFlow } from "@/components/setup/setup-flow";
import { SetupTemplates } from "@/components/setup/setup-templates";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Import from a spreadsheet" };

export default function SetupPage() {
  return (
    <>
      <PageHeader
        title="Import from a spreadsheet"
        description="Add your ingredients, pack sizes, menu and recipes from two CSV files instead of typing them one by one."
      />
      <Suspense fallback={<TableSkeleton />}>
        <SetupContent />
      </Suspense>
    </>
  );
}

async function SetupContent() {
  await requireRole(MANAGER_ROLES);
  return (
    <div className="flex flex-col gap-8">
      <SetupTemplates />
      <SetupFlow />
    </div>
  );
}
