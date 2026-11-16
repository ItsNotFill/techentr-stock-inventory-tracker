import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAsUser } from "@/lib/db/rls";
import { locations, memberships, organizations } from "@/lib/db/schema";
import {
  addTestMember,
  createTestDb,
  createTestRestaurant,
  createTestUser,
  deleteTestRestaurants,
  deleteTestUser,
  hasDatabase,
  type TestDb,
  type TestRestaurant,
  type TestUser,
} from "../helpers/db";

describe.skipIf(!hasDatabase)("RLS client and tenancy policies", () => {
  let testDb: TestDb;
  let ownerA: TestUser;
  let staffA: TestUser;
  let ownerB: TestUser;
  let restaurantA: TestRestaurant;
  let restaurantB: TestRestaurant;

  beforeAll(async () => {
    testDb = createTestDb();
    [ownerA, staffA, ownerB] = await Promise.all([
      createTestUser("owner-a"),
      createTestUser("staff-a"),
      createTestUser("owner-b"),
    ]);
    restaurantA = await createTestRestaurant(testDb.db, ownerA, "Test Pizzeria A");
    restaurantB = await createTestRestaurant(testDb.db, ownerB, "Test Pizzeria B");
    await addTestMember(testDb.db, restaurantA, staffA, "staff");
  });

  afterAll(async () => {
    await deleteTestRestaurants(testDb.db, [restaurantA, restaurantB]);
    await Promise.all([deleteTestUser(ownerA), deleteTestUser(staffA), deleteTestUser(ownerB)]);
    await testDb.close();
  });

  it("shows a user only their own location and organization", async () => {
    const seen = await runAsUser(testDb.db, ownerA.id, async (tx) => ({
      locations: await tx.select({ id: locations.id }).from(locations),
      organizations: await tx.select({ id: organizations.id }).from(organizations),
    }));
    expect(seen.locations.map((l) => l.id)).toEqual([restaurantA.locationId]);
    expect(seen.organizations.map((o) => o.id)).toEqual([restaurantA.organizationId]);
  });

  it("shows members of a location to each other, and nobody else's", async () => {
    const seen = await runAsUser(testDb.db, staffA.id, (tx) =>
      tx.select({ userId: memberships.userId }).from(memberships),
    );
    expect(seen.map((m) => m.userId).sort()).toEqual([ownerA.id, staffA.id].sort());
  });

  it("does not let the app role create organizations or locations", async () => {
    await expect(
      runAsUser(testDb.db, ownerA.id, (tx) => tx.insert(organizations).values({ name: "Sneaky" })),
    ).rejects.toThrow();
    await expect(
      runAsUser(testDb.db, ownerA.id, (tx) =>
        tx.insert(locations).values({ orgId: restaurantA.organizationId, name: "Sneaky", timezone: "UTC" }),
      ),
    ).rejects.toThrow();
  });

  it("lets an owner rename their location, but not staff and not another restaurant's owner", async () => {
    const rename = (userId: string, name: string) =>
      runAsUser(testDb.db, userId, (tx) =>
        tx
          .update(locations)
          .set({ name })
          .where(eq(locations.id, restaurantA.locationId))
          .returning({ id: locations.id }),
      );
    expect(await rename(staffA.id, "Renamed by staff")).toHaveLength(0);
    expect(await rename(ownerB.id, "Renamed by a stranger")).toHaveLength(0);
    expect(await rename(ownerA.id, "Renamed by the owner")).toHaveLength(1);
  });

  it("lets only an owner add members, and only to their own location", async () => {
    const add = (asUser: string, locationId: string) =>
      runAsUser(testDb.db, asUser, (tx) =>
        tx.insert(memberships).values({ userId: ownerB.id, locationId, role: "manager" }),
      );
    await expect(add(staffA.id, restaurantA.locationId)).rejects.toThrow();
    await expect(add(ownerB.id, restaurantA.locationId)).rejects.toThrow();
    await add(ownerA.id, restaurantA.locationId);
    const seen = await runAsUser(testDb.db, ownerB.id, (tx) =>
      tx.select({ id: locations.id }).from(locations),
    );
    expect(seen.map((l) => l.id).sort()).toEqual([restaurantA.locationId, restaurantB.locationId].sort());
  });

  it("does not leak the role or the user outside the transaction", async () => {
    await runAsUser(testDb.db, ownerA.id, (tx) => tx.select().from(locations));
    const [row] = await testDb.db.execute<{ role: string; claims: string | null }>(
      sql`select current_user as role, current_setting('request.jwt.claims', true) as claims`,
    );
    expect(row.role).not.toBe("app_user");
    expect(row.claims ?? "").toBe("");
  });
});
