import type { Metadata } from "next";
import { Suspense } from "react";
import { ImportFlow } from "@/components/import/import-flow";
import { ImportHistory } from "@/components/import/import-history";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/page-skeleton";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { listImports } from "@/lib/imports";

export const metadata: Metadata = { title: "Import sales" };

export default function ImportPage() {
  return (
    <>
      <PageHeader title="Import sales" />
      <Suspense fallback={<TableSkeleton />}>
        <ImportContent />
      </Suspense>
    </>
  );
}

async function ImportContent() {
  const membership = await requireRole(MANAGER_ROLES);
  const imports = await withUser((tx) => listImports(tx, membership.locationId));
  return (
    <div className="flex flex-col gap-10">
      <ImportFlow timeZone={membership.timezone} />
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Import history</h2>
        <ImportHistory imports={imports} timeZone={membership.timezone} />
      </section>
    </div>
  );
}
