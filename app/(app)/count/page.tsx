import type { Metadata } from "next";
import { Suspense } from "react";
import { RecentCounts, WaitingList } from "@/components/count/count-list";
import { StartCountButton } from "@/components/count/start-count-button";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { requireMembership } from "@/lib/auth/membership";
import { canManage } from "@/lib/auth/roles";
import { listCounts } from "@/lib/counts";
import { withUser } from "@/lib/db/client";

export const metadata: Metadata = { title: "Count" };

export default function CountPage() {
  return (
    <>
      <PageHeader title="Count" />
      <Suspense fallback={<CardsSkeleton cards={3} />}>
        <CountContent />
      </Suspense>
    </>
  );
}

async function CountContent() {
  const membership = await requireMembership();
  const counts = await withUser((tx) => listCounts(tx, membership.locationId));
  const manager = canManage(membership.role);
  const hasDraft = counts.some((count) => count.status === "draft" && count.countedBy === membership.userId);
  const waiting = counts.filter((count) => count.status === "submitted");
  return (
    <div className="flex flex-col gap-10">
      <StartCountButton hasDraft={hasDraft} />
      {manager ? (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            Waiting for approval
            <Badge variant={waiting.length > 0 ? "default" : "outline"}>{waiting.length}</Badge>
          </h2>
          <WaitingList counts={waiting} userId={membership.userId} timeZone={membership.timezone} />
        </section>
      ) : null}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Recent counts</h2>
        <RecentCounts counts={counts} userId={membership.userId} timeZone={membership.timezone} canManage={manager} />
      </section>
    </div>
  );
}
