import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { AddMemberForm } from "@/components/settings/add-member-form";
import { EmailCard, type LastRun } from "@/components/settings/email-card";
import { LocationsCard } from "@/components/settings/locations-card";
import { RestaurantForm } from "@/components/settings/restaurant-form";
import { TeamList, type TeamRow } from "@/components/settings/team-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyLocations, requireRole } from "@/lib/auth/membership";
import { OWNER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { emailConfigured } from "@/lib/email/send";
import { getEmailSettings } from "@/lib/email/settings";
import { getRestaurantDetails, listTeam } from "@/lib/team";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Restaurant details and who has access." />
      <Suspense fallback={<CardsSkeleton cards={3} />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  const membership = await requireRole(OWNER_ROLES);
  const { details, team, email } = await withUser(async (tx) => ({
    details: await getRestaurantDetails(tx, membership.locationId),
    team: await listTeam(tx, membership.locationId),
    email: await getEmailSettings(tx, membership.locationId),
  }));
  if (!details) notFound();
  const organizationLocations = (await getMyLocations())
    .filter((location) => location.organizationId === membership.organizationId)
    .map(({ locationId, locationName, timezone }) => ({ locationId, locationName, timezone }));

  const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: details.timezone });
  const lastRun = (run: typeof email.lastWeeklySummary): LastRun =>
    run
      ? { status: run.status as NonNullable<LastRun>["status"], date: dateFormat.format(run.createdAt), recipientCount: run.recipientCount, error: run.error }
      : null;
  const rows: TeamRow[] = team.map((member) => ({
    userId: member.userId,
    email: member.email,
    role: member.role,
    joined: dateFormat.format(new Date(member.joinedAt)),
    isSelf: member.userId === membership.userId,
  }));

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Restaurant details</CardTitle>
        </CardHeader>
        <CardContent>
          <RestaurantForm name={details.name} posProvider={details.posProvider} timezone={details.timezone} />
        </CardContent>
      </Card>

      <EmailCard
        weeklySummary={email.weeklySummaryEnabled}
        lowStockAlerts={email.lowStockAlertsEnabled}
        lastWeeklySummary={lastRun(email.lastWeeklySummary)}
        lastLowStockAlert={lastRun(email.lastLowStockAlert)}
        configured={emailConfigured()}
      />

      <LocationsCard
        locations={organizationLocations}
        currentId={membership.locationId}
        defaultTimezone={details.timezone}
        timezones={Intl.supportedValuesOf("timeZone")}
      />

      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>Everyone who can log in to this restaurant.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <TeamList members={rows} />
          <dl className="flex flex-col gap-2 text-sm">
            <div>
              <dt className="inline font-medium">Owner: </dt>
              <dd className="inline text-muted-foreground">everything, including team and restaurant details.</dd>
            </div>
            <div>
              <dt className="inline font-medium">Manager: </dt>
              <dd className="inline text-muted-foreground">
                ingredients, recipes, sales imports, approving stock counts.
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">Staff: </dt>
              <dd className="inline text-muted-foreground">counting stock, logging deliveries and waste.</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add someone</CardTitle>
          <CardDescription>You get a link to pass on. There is no invitation e-mail.</CardDescription>
        </CardHeader>
        <CardContent>
          <AddMemberForm />
        </CardContent>
      </Card>
    </div>
  );
}
