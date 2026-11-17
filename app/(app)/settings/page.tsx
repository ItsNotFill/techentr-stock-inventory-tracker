import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { AddMemberForm } from "@/components/settings/add-member-form";
import { RestaurantForm } from "@/components/settings/restaurant-form";
import { TeamList, type TeamRow } from "@/components/settings/team-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/membership";
import { OWNER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
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
  const { details, team } = await withUser(async (tx) => ({
    details: await getRestaurantDetails(tx, membership.locationId),
    team: await listTeam(tx, membership.locationId),
  }));
  if (!details) notFound();

  const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: details.timezone });
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
