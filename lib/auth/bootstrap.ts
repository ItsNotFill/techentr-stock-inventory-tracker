import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db/rls";
import { locations, memberships, organizations } from "@/lib/db/schema";

export type NewRestaurant = {
  userId: string;
  restaurantName: string;
  /** IANA timezone name, e.g. "Europe/Amsterdam". */
  timezone: string;
};

/**
 * Sign-up bootstrap: creates a user's first organization, location and owner
 * membership in one transaction. It needs the admin connection, because RLS
 * lets nobody insert organizations or locations. A user who already belongs
 * to a location gets that one back instead of a second restaurant.
 */
export async function createRestaurantForUser(
  adminDb: Database,
  input: NewRestaurant,
): Promise<{ organizationId: string | null; locationId: string; created: boolean }> {
  return adminDb.transaction(async (tx) => {
    const [existing] = await tx
      .select({ locationId: memberships.locationId })
      .from(memberships)
      .where(eq(memberships.userId, input.userId))
      .limit(1);
    if (existing) {
      return { organizationId: null, locationId: existing.locationId, created: false };
    }

    const [organization] = await tx
      .insert(organizations)
      .values({ name: input.restaurantName })
      .returning({ id: organizations.id });
    const [location] = await tx
      .insert(locations)
      .values({ orgId: organization.id, name: input.restaurantName, timezone: input.timezone })
      .returning({ id: locations.id });
    await tx.insert(memberships).values({ userId: input.userId, locationId: location.id, role: "owner" });

    return { organizationId: organization.id, locationId: location.id, created: true };
  });
}
