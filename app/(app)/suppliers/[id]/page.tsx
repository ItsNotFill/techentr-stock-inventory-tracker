import { ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { ArchiveSupplierButton } from "@/components/suppliers/archive-supplier-button";
import { SupplierForm, type SupplierFormDefaults } from "@/components/suppliers/supplier-form";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { getSupplier } from "@/lib/purchasing";
import { idSchema } from "@/lib/validation/ingredients";

export const metadata: Metadata = { title: "Edit supplier" };

const DESCRIPTION = "Contact details and notes, and the ingredients you buy from them.";
const BACK = { href: "/suppliers", label: "Back to suppliers" };

export default function EditSupplierPage({ params }: PageProps<"/suppliers/[id]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Supplier" description={DESCRIPTION} back={BACK} />
          <CardsSkeleton cards={1} />
        </>
      }
    >
      <EditSupplierContent params={params} />
    </Suspense>
  );
}

async function EditSupplierContent({ params }: { params: PageProps<"/suppliers/[id]">["params"] }) {
  const membership = await requireRole(MANAGER_ROLES);
  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) notFound();
  const supplier = await withUser((tx) => getSupplier(tx, membership.locationId, parsedId.data));
  if (!supplier) notFound();

  const defaults: SupplierFormDefaults = {
    name: supplier.name,
    contactName: supplier.contactName ?? "",
    email: supplier.email ?? "",
    phone: supplier.phone ?? "",
    notes: supplier.notes ?? "",
  };

  return (
    <>
      <PageHeader
        title={supplier.name}
        description={DESCRIPTION}
        back={BACK}
        badge={supplier.isActive ? null : <Badge variant="neutral">Archived</Badge>}
      >
        {supplier.isActive ? (
          <Link href={`/orders?supplier=${supplier.id}`} className={buttonVariants({ variant: "outline" })}>
            <ShoppingCart aria-hidden />
            New order
          </Link>
        ) : null}
      </PageHeader>
      <div className="flex max-w-2xl flex-col gap-6">
        <Card>
          <CardContent>
            {/* key: start again from the saved values when they change. */}
            <SupplierForm key={JSON.stringify(defaults)} id={supplier.id} defaults={defaults} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ingredients from this supplier</CardTitle>
            <CardDescription>Set the supplier on each ingredient&apos;s page.</CardDescription>
          </CardHeader>
          <CardContent>
            {supplier.ingredients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No ingredient has this supplier yet.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {supplier.ingredients.map((ingredient) => (
                  <li key={ingredient.id}>
                    <Link
                      href={`/ingredients/${ingredient.id}`}
                      className="inline-block py-1 font-medium text-primary hover:underline hover:underline-offset-4"
                    >
                      {ingredient.name}
                    </Link>
                    {ingredient.isActive ? null : <span className="text-muted-foreground"> · archived</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <div>
          <ArchiveSupplierButton id={supplier.id} archived={!supplier.isActive} />
        </div>
      </div>
    </>
  );
}
