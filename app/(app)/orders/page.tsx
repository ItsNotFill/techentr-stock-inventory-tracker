import type { Metadata } from "next";
import { Suspense } from "react";
import { CreateOrderButton } from "@/components/orders/create-order-button";
import { OrderList } from "@/components/orders/order-list";
import { Suggestions } from "@/components/orders/suggestions";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { listOrderSuggestions, listPurchaseOrders, listSupplierOptions } from "@/lib/purchasing";
import { idSchema } from "@/lib/validation/ingredients";

export const metadata: Metadata = { title: "Orders" };

const DESCRIPTION = "What to order, per supplier, from what is low; and your orders to suppliers.";

export default function OrdersPage({ searchParams }: PageProps<"/orders">) {
  return (
    <>
      <PageHeader title="Orders" description={DESCRIPTION} />
      <Suspense fallback={<CardsSkeleton cards={3} />}>
        <OrdersContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function OrdersContent({ searchParams }: { searchParams: PageProps<"/orders">["searchParams"] }) {
  const membership = await requireRole(MANAGER_ROLES);
  const query = await searchParams;
  const supplierParam = typeof query.supplier === "string" ? idSchema.safeParse(query.supplier) : null;
  const { groups, orders, suppliers } = await withUser(async (tx) => ({
    groups: await listOrderSuggestions(tx, membership.locationId),
    orders: await listPurchaseOrders(tx, membership.locationId),
    suppliers: await listSupplierOptions(tx, membership.locationId),
  }));
  const chosen = supplierParam?.success ? suppliers.find((supplier) => supplier.id === supplierParam.data) : undefined;
  const hasSuggestions = chosen ? groups.some((group) => group.supplier?.id === chosen.id) : false;

  return (
    <div className="flex flex-col gap-10">
      {chosen ? (
        <Card>
          <CardHeader>
            <CardTitle>New order for {chosen.name}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <CreateOrderButton supplierId={chosen.id} fromSuggestions={false} label="Start empty order" />
            {hasSuggestions ? <CreateOrderButton supplierId={chosen.id} fromSuggestions label="Start from suggestions" /> : null}
          </CardContent>
        </Card>
      ) : null}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Suggested orders</h2>
        <Suggestions groups={groups} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Orders</h2>
        {orders.length === 0 ? (
          <EmptyState size="sm" title="No orders yet" description="Create one from the suggestions above, or from a supplier." />
        ) : (
          <OrderList orders={orders} timeZone={membership.timezone} />
        )}
      </section>
    </div>
  );
}
