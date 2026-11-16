import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { withUserId } from "@/lib/db/client";
import { locations, memberships } from "@/lib/db/schema";
import type { MemberRole } from "@/lib/db/schema";
import { getCurrentUser } from "./session";

export type Membership = {
  userId: string;
  email: string | null;
  locationId: string;
  locationName: string;
  organizationId: string;
  timezone: string;
  role: MemberRole;
};

/**
 * The signed-in user's restaurant and role, or null when signed out or not yet
 * part of a restaurant. The MVP shows one location per user: the first one
 * they joined. Cached for the length of one request.
 */
export const getCurrentMembership = cache(async (): Promise<Membership | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const [row] = await withUserId(user.id, (tx) =>
    tx
      .select({
        locationId: memberships.locationId,
        role: memberships.role,
        locationName: locations.name,
        organizationId: locations.orgId,
        timezone: locations.timezone,
      })
      .from(memberships)
      .innerJoin(locations, eq(locations.id, memberships.locationId))
      .where(eq(memberships.userId, user.id))
      .orderBy(asc(memberships.createdAt))
      .limit(1),
  );
  if (!row) return null;
  return { userId: user.id, email: user.email, ...row };
});

/**
 * For pages: the membership, or a redirect to /login (signed out) or
 * /onboarding (no restaurant yet).
 */
export async function requireMembership(): Promise<Membership> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding");
  return membership;
}

/** For pages: like requireMembership, but sends other roles back to the dashboard. */
export async function requireRole(allowed: readonly MemberRole[]): Promise<Membership> {
  const membership = await requireMembership();
  if (!allowed.includes(membership.role)) redirect("/dashboard");
  return membership;
}

/**
 * For Server Actions: the membership when the user has one of the roles, else
 * null. The action then returns PERMISSION_DENIED instead of redirecting.
 */
export async function checkRole(allowed: readonly MemberRole[]): Promise<Membership | null> {
  const membership = await getCurrentMembership();
  if (!membership || !allowed.includes(membership.role)) return null;
  return membership;
}
