import { Archive, ArchiveRestore, Building2, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/page-skeleton";
import { SupplierList } from "@/components/suppliers/supplier-list";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { listSuppliers } from "@/lib/purchasing";

export const metadata: Metadata = { title: "Suppliers" };

export default function SuppliersPage({ searchParams }: PageProps<"/suppliers">) {
  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Who you buy from. Each ingredient can have one supplier; orders are made per supplier."
      >
        <Button asChild size="lg">
          <Link href="/suppliers/new">
            <Plus aria-hidden />
            Add supplier
          </Link>
        </Button>
      </PageHeader>
      <Suspense fallback={<TableSkeleton />}>
        <SuppliersContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SuppliersContent({ searchParams }: { searchParams: PageProps<"/suppliers">["searchParams"] }) {
  const membership = await requireRole(MANAGER_ROLES);
  const { archived } = await searchParams;
  const includeArchived = archived === "1";
  const suppliers = await withUser((tx) => listSuppliers(tx, membership.locationId, { includeArchived }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm">
          <Link href={includeArchived ? "/suppliers" : "/suppliers?archived=1"}>
            {includeArchived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
            {includeArchived ? "Hide archived" : "Show archived"}
          </Link>
        </Button>
      </div>
      {suppliers.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No suppliers yet"
          description="Add the people you order from, then set the supplier on each ingredient. Orders are made per supplier."
        >
          <Button asChild size="lg">
            <Link href="/suppliers/new">
              <Plus aria-hidden />
              Add supplier
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <SupplierList suppliers={suppliers} />
      )}
    </div>
  );
}
