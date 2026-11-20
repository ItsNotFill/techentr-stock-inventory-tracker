import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { NEW_SUPPLIER_DEFAULTS, SupplierForm } from "@/components/suppliers/supplier-form";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Add supplier" };

export default function NewSupplierPage() {
  return (
    <>
      <PageHeader
        title="Add supplier"
        description="Who they are and how to reach them. Set the supplier on each ingredient afterwards."
        back={{ href: "/suppliers", label: "Back to suppliers" }}
      />
      <Suspense fallback={<CardsSkeleton cards={1} />}>
        <NewSupplierContent />
      </Suspense>
    </>
  );
}

async function NewSupplierContent() {
  await requireRole(MANAGER_ROLES);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card>
        <CardContent>
          <SupplierForm id={null} defaults={NEW_SUPPLIER_DEFAULTS} />
        </CardContent>
      </Card>
    </div>
  );
}
