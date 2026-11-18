import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DashboardMetrics, DashboardNotices } from "@/components/dashboard/dashboard-cards";
import { GetStarted, StaffStart } from "@/components/dashboard/get-started";
import { LowStockList } from "@/components/dashboard/low-stock-list";
import { TopUnexplainedChart } from "@/components/dashboard/top-unexplained-chart";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireMembership } from "@/lib/auth/membership";
import { canManage, canSeeMoney, ROLE_LABELS } from "@/lib/auth/roles";
import { getDashboard } from "@/lib/dashboard";
import { withUser } from "@/lib/db/client";

export const metadata: Metadata = { title: "Dashboard" };

const DESCRIPTION = "Your restaurant at a glance.";

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Dashboard" description={DESCRIPTION} />
          <CardsSkeleton cards={3} />
        </>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  const membership = await requireMembership();
  const manager = canManage(membership.role);
  const data = await withUser((tx) => getDashboard(tx, membership.locationId, { withMoney: canSeeMoney(membership.role) }));
  // A restaurant with no data yet gets the "Get started" steps instead of empty figures.
  const isNew = !data.lastImport && !data.lastCount && data.lowStock.length === 0 && data.countsWaiting === 0;

  const details = (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{membership.locationName}</span>
        <span className="text-muted-foreground">Signed in as {ROLE_LABELS[membership.role].toLowerCase()}</span>
        <span className="text-muted-foreground">Timezone: {membership.timezone}</span>
      </CardContent>
    </Card>
  );
  const lowStock = (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Low stock</h2>
      <LowStockList items={data.lowStock} linkToIngredients={manager} />
    </section>
  );

  return (
    <>
      <PageHeader title="Dashboard" description={DESCRIPTION}>
        {manager ? (
          <Button asChild size="lg">
            <Link href="/import">Import sales</Link>
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg">
              <Link href="/deliveries">Log delivery</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/count">Count stock</Link>
            </Button>
          </div>
        )}
      </PageHeader>
      {manager ? (
        <div className="flex flex-col gap-8">
          {isNew ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
              <GetStarted />
              {details}
            </div>
          ) : (
            <>
              <DashboardMetrics data={data} timeZone={membership.timezone} />
              <DashboardNotices needsRecipe={data.needsRecipe} countsWaiting={data.countsWaiting} />
              {data.lastCount ? <TopUnexplainedChart top={data.lastCount.top} /> : null}
              {lowStock}
              <div className="max-w-sm">{details}</div>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <StaffStart />
          {lowStock}
          <div className="max-w-sm">{details}</div>
        </div>
      )}
    </>
  );
}
