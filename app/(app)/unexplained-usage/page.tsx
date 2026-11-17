import { ClipboardList, TrendingDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import { CountList } from "@/components/unexplained-usage/count-list";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { listApprovedCounts } from "@/lib/variance";

export const metadata: Metadata = { title: "Unexplained usage" };

export default function UnexplainedUsagePage() {
  return (
    <>
      <PageHeader
        title="Unexplained usage"
        description="What was counted compared with what sales, deliveries and waste say should be on the shelf. A minus means more was used than the app can explain."
      />
      <Suspense fallback={<TableSkeleton />}>
        <UnexplainedUsageContent />
      </Suspense>
    </>
  );
}

async function UnexplainedUsageContent() {
  const membership = await requireRole(MANAGER_ROLES);
  const counts = await withUser((tx) => listApprovedCounts(tx, membership.locationId));

  if (counts.length === 0) {
    return (
      <EmptyState
        icon={TrendingDown}
        title="No approved counts yet"
        description="Unexplained usage appears after a stock count is approved."
      >
        <Button asChild size="lg">
          <Link href="/count">
            <ClipboardList aria-hidden />
            Start a count
          </Link>
        </Button>
      </EmptyState>
    );
  }
  return <CountList counts={counts} timezone={membership.timezone} />;
}
