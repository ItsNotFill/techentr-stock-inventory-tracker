import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatDateTime } from "@/components/import/format";
import { DraftEditor } from "@/components/orders/draft-editor";
import { lineToEntry } from "@/components/orders/lines";
import { ReadonlyLines } from "@/components/orders/readonly-lines";
import { SentPanel } from "@/components/orders/sent-panel";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { toDateTimeInput } from "@/lib/imports/time";
import { listEntryOptions } from "@/lib/ingredients";
import { getPurchaseOrder } from "@/lib/purchasing";
import { idSchema } from "@/lib/validation/ingredients";

export const metadata: Metadata = { title: "Order" };

const BACK = { href: "/orders", label: "Back to orders" };

export default function OrderPage({ params }: PageProps<"/orders/[id]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Order" description="An order to a supplier." back={BACK} />
          <CardsSkeleton cards={2} />
        </>
      }
    >
      <OrderContent params={params} />
    </Suspense>
  );
}

async function OrderContent({ params }: { params: PageProps<"/orders/[id]">["params"] }) {
  const membership = await requireRole(MANAGER_ROLES);
  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) notFound();
  const { order, options } = await withUser(async (tx) => ({
    order: await getPurchaseOrder(tx, membership.locationId, parsedId.data),
    options: await listEntryOptions(tx, membership.locationId),
  }));
  if (!order) notFound();
  const { timezone, locationName } = membership;

  const description =
    order.status === "draft"
      ? `Order for ${order.supplier.name}. Add what you need, send it, then receive it when it arrives.`
      : `Order for ${order.supplier.name}.`;

  return (
    <>
      <PageHeader title={`Order for ${order.supplier.name}`} description={description} back={BACK} badge={<OrderStatusBadge status={order.status} />} />
      {order.status === "draft" ? (
        <DraftEditor
          key={JSON.stringify([order.notes, order.lines.map((line) => [line.ingredientId, line.packSizeId, line.packCount, line.qtyBaseUnit])])}
          orderId={order.id}
          options={options}
          defaults={{ notes: order.notes ?? "", lines: order.lines.map(lineToEntry) }}
          text={order.text}
          supplierEmail={order.supplier.email}
          restaurantName={locationName}
        />
      ) : (
        <div className="flex max-w-2xl flex-col gap-8">
          {order.status === "sent" ? (
            <p className="text-sm text-muted-foreground">
              {order.sentAt ? `Sent ${formatDateTime(order.sentAt, timezone)}. ` : ""}Waiting for the delivery.
            </p>
          ) : null}
          {order.status === "received" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                Received {order.receivedAt ? formatDateTime(order.receivedAt, timezone) : ""}. The delivery is logged and stock is up.
              </p>
              <div>
                <Link href="/deliveries" className={buttonVariants({ variant: "outline", size: "lg" })}>
                  See the delivery
                </Link>
              </div>
            </div>
          ) : null}
          {order.status === "cancelled" ? (
            <p className="text-sm text-muted-foreground">
              Cancelled{order.cancelledAt ? ` ${formatDateTime(order.cancelledAt, timezone)}` : ""}. Nothing was received.
            </p>
          ) : null}
          {order.status === "sent" ? null : (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold tracking-tight">Items</h2>
              <ReadonlyLines lines={order.lines} />
            </section>
          )}
          {order.status === "sent" ? (
            <>
              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold tracking-tight">Items ordered</h2>
                <ReadonlyLines lines={order.lines} />
              </section>
              <SentPanel
                orderId={order.id}
                options={options}
                receiveLines={order.lines.map(lineToEntry)}
                initialDeliveredAt={toDateTimeInput(new Date(), timezone)}
                text={order.text}
                supplierEmail={order.supplier.email}
                restaurantName={locationName}
              />
            </>
          ) : null}
          {order.notes && order.status !== "sent" ? <p className="text-sm text-muted-foreground">Note: {order.notes}</p> : null}
        </div>
      )}
    </>
  );
}
