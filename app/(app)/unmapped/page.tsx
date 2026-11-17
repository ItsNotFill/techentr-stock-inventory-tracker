import { CircleCheck, FileUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import { UnmappedList } from "@/components/unmapped/unmapped-list";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { listUnmappedQueue } from "@/lib/menu";

export const metadata: Metadata = { title: "Needs recipe" };

export default function UnmappedPage() {
  return (
    <>
      <PageHeader
        title="Needs recipe"
        description="Items from your sales that have no recipe yet. Their sales wait here and use stock as soon as you add one."
      />
      <Suspense fallback={<TableSkeleton />}>
        <UnmappedContent />
      </Suspense>
    </>
  );
}

async function UnmappedContent() {
  const membership = await requireRole(MANAGER_ROLES);
  const entries = await withUser((tx) => listUnmappedQueue(tx, membership.locationId));

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={CircleCheck}
        title="Nothing is waiting"
        description="Every item in your sales has a recipe or is ignored. New items show up here after a sales import."
      >
        <Button asChild size="lg">
          <Link href="/import">
            <FileUp aria-hidden />
            Import sales
          </Link>
        </Button>
      </EmptyState>
    );
  }
  return <UnmappedList entries={entries} timezone={membership.timezone} />;
}
