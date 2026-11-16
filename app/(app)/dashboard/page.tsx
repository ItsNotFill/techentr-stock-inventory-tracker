import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMembership } from "@/lib/auth/membership";
import { ROLE_LABELS } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" />
      <Suspense fallback={<CardsSkeleton cards={1} />}>
        <DashboardContent />
      </Suspense>
    </>
  );
}

async function DashboardContent() {
  const membership = await requireMembership();
  return (
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
  );
}
