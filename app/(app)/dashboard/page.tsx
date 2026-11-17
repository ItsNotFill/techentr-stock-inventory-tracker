import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
          <CardsSkeleton cards={1} />
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
  return (
    <>
      <PageHeader title="Dashboard" description={DESCRIPTION}>
        <Button asChild size="lg">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      </PageHeader>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{membership.locationName}</CardTitle>
          <CardDescription>
            You are signed in as {ROLE_LABELS[membership.role].toLowerCase()}. Low stock, the last import and unexplained
            usage will appear here as the restaurant starts using the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Timezone: {membership.timezone}</CardContent>
      </Card>
    </>
  );
}
