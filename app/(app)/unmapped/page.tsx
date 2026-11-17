import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
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
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
        <p className="font-medium">Nothing is waiting</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Every item in your sales has a recipe or is ignored.
        </p>
        <Button asChild size="lg" className="h-11">
          <Link href="/import">Import sales</Link>
        </Button>
      </div>
    );
  }
  return <UnmappedList entries={entries} timezone={membership.timezone} />;
}
