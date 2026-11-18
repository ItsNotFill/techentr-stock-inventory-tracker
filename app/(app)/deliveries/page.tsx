import type { Metadata } from "next";
import { Suspense } from "react";
import { DeliveryForm } from "@/components/deliveries/delivery-form";
import { RecentDeliveries } from "@/components/deliveries/recent-deliveries";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { requireMembership } from "@/lib/auth/membership";
import { canManage } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { listDeliveries } from "@/lib/deliveries";
import { toDateTimeInput } from "@/lib/imports/time";
import { listEntryOptions } from "@/lib/ingredients";

export const metadata: Metadata = { title: "Log delivery" };

const DESCRIPTION = "Add what a supplier brought. Stock goes up as soon as you save.";

export default function DeliveriesPage() {
  return (
    <>
      <PageHeader title="Log delivery" description={DESCRIPTION} />
      <Suspense fallback={<CardsSkeleton cards={3} />}>
        <DeliveriesContent />
      </Suspense>
    </>
  );
}

async function DeliveriesContent() {
  const membership = await requireMembership();
  const { options, recent } = await withUser(async (tx) => ({
    options: await listEntryOptions(tx, membership.locationId),
    recent: await listDeliveries(tx, membership.locationId, 20),
  }));
  return (
    <div className="flex flex-col gap-10">
      <DeliveryForm
        options={options}
        canManage={canManage(membership.role)}
        timeZone={membership.timezone}
        initialDeliveredAt={toDateTimeInput(new Date(), membership.timezone)}
      />
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Recent deliveries</h2>
        <RecentDeliveries deliveries={recent} userId={membership.userId} timeZone={membership.timezone} />
      </section>
    </div>
  );
}
