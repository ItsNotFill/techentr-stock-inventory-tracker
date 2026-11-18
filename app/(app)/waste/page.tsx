import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { RecentWaste } from "@/components/waste/recent-waste";
import { WasteForm } from "@/components/waste/waste-form";
import { requireMembership } from "@/lib/auth/membership";
import { canManage } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { toDateTimeInput } from "@/lib/imports/time";
import { listEntryOptions } from "@/lib/ingredients";
import { listRecentWaste } from "@/lib/waste";

export const metadata: Metadata = { title: "Log waste" };

const DESCRIPTION = "Record what was thrown away and why. Stock goes down as soon as you save.";

export default function WastePage() {
  return (
    <>
      <PageHeader title="Log waste" description={DESCRIPTION} />
      <Suspense fallback={<CardsSkeleton cards={3} />}>
        <WasteContent />
      </Suspense>
    </>
  );
}

async function WasteContent() {
  const membership = await requireMembership();
  const { options, recent } = await withUser(async (tx) => ({
    options: await listEntryOptions(tx, membership.locationId),
    recent: await listRecentWaste(tx, membership.locationId, 20),
  }));
  return (
    <div className="flex flex-col gap-10">
      <WasteForm
        options={options}
        canManage={canManage(membership.role)}
        timeZone={membership.timezone}
        initialOccurredAt={toDateTimeInput(new Date(), membership.timezone)}
      />
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Recent waste</h2>
        <RecentWaste items={recent} userId={membership.userId} timeZone={membership.timezone} />
      </section>
    </div>
  );
}
