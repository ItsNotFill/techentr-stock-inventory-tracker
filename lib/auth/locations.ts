import { asc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { locations, memberships, type MemberRole } from "@/lib/db/schema";

/**
 * Several locations per user (stage 7, DECISIONS.md 98). The location a
 * person works in is chosen in a cookie and checked against their
 * memberships on every request (lib/auth/membership.ts).
 */

/** The cookie that holds the chosen location's id. Its value is never trusted on its own. */
export const LOCATION_COOKIE = "location";

export type MyLocation = {
  locationId: string;
  locationName: string;
  organizationId: string;
  timezone: string;
  role: MemberRole;
};

/** The chosen location when the user belongs to it, else the first one they joined; null without any. */
export function pickLocation<T extends { locationId: string }>(mine: T[], chosen: string | null | undefined): T | null {
  return (chosen ? mine.find((location) => location.locationId === chosen) : undefined) ?? mine[0] ?? null;
}

/** Every location the user belongs to, the first one they joined first. */
export async function listMyLocations(tx: Tx, userId: string): Promise<MyLocation[]> {
  return tx
    .select({
      locationId: memberships.locationId,
      locationName: locations.name,
      organizationId: locations.orgId,
      timezone: locations.timezone,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(locations, eq(locations.id, memberships.locationId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.createdAt), asc(locations.name));
}

export class LocationError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "LocationError";
  }
}

const REFUSALS: Record<string, [string, string | undefined]> = {
  NOT_SIGNED_IN: ["Log in again to add a location.", undefined],
  NOT_AN_OWNER: ["Only an owner can add a location.", undefined],
  BAD_NAME: ["Enter a name of at most 80 characters.", "name"],
  BAD_TIMEZONE: ["Choose a timezone from the list.", "timezone"],
};

/**
 * Adds a location to the organization, owned by the signed-in user, through
 * the database function `create_location` (migration 0017). Returns its id.
 */
export async function createLocation(tx: Tx, organizationId: string, name: string, timezone: string): Promise<string> {
  try {
    const rows = await tx.execute<{ id: string }>(sql`select public.create_location(${organizationId}::uuid, ${name}, ${timezone}) as id`);
    return rows[0].id;
  } catch (error) {
    const message = messageOf(error);
    const refusal = Object.entries(REFUSALS).find(([code]) => message.includes(code));
    if (refusal) throw new LocationError(refusal[1][0], refusal[1][1]);
    throw error;
  }
}

function messageOf(error: unknown): string {
  const parts: string[] = [];
  for (let current = error; current instanceof Error; current = current.cause) parts.push(current.message);
  return parts.join(" | ");
}
