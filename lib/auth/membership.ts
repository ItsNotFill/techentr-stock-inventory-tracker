import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { withUserId } from "@/lib/db/client";
import type { MemberRole } from "@/lib/db/schema";
import { listMyLocations, LOCATION_COOKIE, pickLocation, type MyLocation } from "./locations";
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
 * Every location the signed-in user belongs to (for the location switcher).
 * Cached for the length of one request.
 */
export const getMyLocations = cache(async (): Promise<MyLocation[]> => {
  const user = await getCurrentUser();
  if (!user) return [];
  return withUserId(user.id, (tx) => listMyLocations(tx, user.id));
});

/**
 * The signed-in user's restaurant and role, or null when signed out or not yet
 * part of a restaurant: the location chosen in the `location` cookie when the
 * user belongs to it, else the first one they joined (DECISIONS.md 98).
 * Cached for the length of one request.
 */
export const getCurrentMembership = cache(async (): Promise<Membership | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const chosen = (await cookies()).get(LOCATION_COOKIE)?.value;
  const location = pickLocation(await getMyLocations(), chosen);
  if (!location) return null;
  return {
    userId: user.id,
    email: user.email,
    locationId: location.locationId,
    locationName: location.locationName,
    organizationId: location.organizationId,
    timezone: location.timezone,
    role: location.role,
  };
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
