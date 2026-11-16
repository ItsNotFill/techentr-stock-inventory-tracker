import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { locations, memberships, type MemberRole } from "@/lib/db/schema";

/**
 * Team and restaurant-details data access. Every function takes a transaction
 * from `withUser`, so RLS applies: only an owner's writes get through.
 */

export type TeamMember = {
  userId: string;
  email: string;
  role: MemberRole;
  joinedAt: string;
};

export class TeamError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "TeamError";
  }
}

/** The team with e-mail addresses. Returns nothing unless the user is an owner or manager. */
export async function listTeam(tx: Tx, locationId: string): Promise<TeamMember[]> {
  const rows = await tx.execute<{ user_id: string; email: string; role: MemberRole; created_at: string }>(
    sql`select user_id, email, role, created_at from public.list_location_members(${locationId}::uuid)`,
  );
  return rows.map((row) => ({
    userId: row.user_id,
    email: row.email,
    role: row.role,
    joinedAt: new Date(row.created_at).toISOString(),
  }));
}

/** The id of an existing account with this e-mail address, for an owner of the location. */
export async function findUserIdByEmail(tx: Tx, locationId: string, email: string): Promise<string | null> {
  const [row] = await tx.execute<{ id: string | null }>(
    sql`select public.find_user_id_by_email(${locationId}::uuid, ${email}) as id`,
  );
  return row?.id ?? null;
}

export async function addMember(tx: Tx, locationId: string, userId: string, role: MemberRole): Promise<void> {
  const [existing] = await tx
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.locationId, locationId), eq(memberships.userId, userId)));
  if (existing) throw new TeamError("This person is already on the team.", "email");
  await tx.insert(memberships).values({ locationId, userId, role });
}

/** A location must always keep at least one owner (SCHEMA.md, memberships). */
async function assertNotLastOwner(tx: Tx, locationId: string, userId: string) {
  const owners = await tx
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.locationId, locationId), eq(memberships.role, "owner")))
    .for("update");
  if (owners.length === 1 && owners[0].userId === userId) {
    throw new TeamError("A restaurant needs at least one owner. Make someone else an owner first.");
  }
}

export async function changeMemberRole(tx: Tx, locationId: string, userId: string, role: MemberRole): Promise<void> {
  if (role !== "owner") await assertNotLastOwner(tx, locationId, userId);
  const updated = await tx
    .update(memberships)
    .set({ role })
    .where(and(eq(memberships.locationId, locationId), eq(memberships.userId, userId)))
    .returning({ userId: memberships.userId });
  if (updated.length === 0) throw new TeamError("This person is no longer on the team.");
}

export async function removeMember(tx: Tx, locationId: string, userId: string): Promise<void> {
  await assertNotLastOwner(tx, locationId, userId);
  const removed = await tx
    .delete(memberships)
    .where(and(eq(memberships.locationId, locationId), eq(memberships.userId, userId)))
    .returning({ userId: memberships.userId });
  if (removed.length === 0) throw new TeamError("This person is no longer on the team.");
}

export type RestaurantDetails = { name: string; posProvider: string | null; timezone: string };

export async function getRestaurantDetails(tx: Tx, locationId: string): Promise<RestaurantDetails | null> {
  const [row] = await tx
    .select({ name: locations.name, posProvider: locations.posProvider, timezone: locations.timezone })
    .from(locations)
    .where(eq(locations.id, locationId));
  return row ?? null;
}

export async function updateRestaurantDetails(tx: Tx, locationId: string, details: RestaurantDetails): Promise<void> {
  const updated = await tx
    .update(locations)
    .set(details)
    .where(eq(locations.id, locationId))
    .returning({ id: locations.id });
  if (updated.length === 0) throw new TeamError("You do not have permission to change the restaurant's details.");
}
