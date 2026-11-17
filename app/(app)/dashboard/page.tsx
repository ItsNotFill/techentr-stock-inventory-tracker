import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GetStarted, StaffStart } from "@/components/dashboard/get-started";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireMembership } from "@/lib/auth/membership";
import { canManage, ROLE_LABELS } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Dashboard" };

const DESCRIPTION = "Your restaurant at a glance.";

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Dashboard" description={DESCRIPTION} />
          <CardsSkeleton cards={2} />
        </>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  const membership = await requireMembership();
  // The main action follows the role: managers import sales, staff count.
  const action = canManage(membership.role)
    ? { href: "/import", label: "Import sales" }
    : { href: "/count", label: "Count stock" };
  const details = (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{membership.locationName}</span>
        <span className="text-muted-foreground">Signed in as {ROLE_LABELS[membership.role].toLowerCase()}</span>
        <span className="text-muted-foreground">Timezone: {membership.timezone}</span>
      </CardContent>
    </Card>
  );
  return (
    <>
      <PageHeader title="Dashboard" description={DESCRIPTION}>
        <Button asChild size="lg">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      </PageHeader>
      {canManage(membership.role) ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
          <GetStarted />
          {details}
        </div>
      ) : (
        <div className="flex max-w-xl flex-col gap-4">
          {details}
          <StaffStart />
        </div>
      )}
    </>
  );
}
