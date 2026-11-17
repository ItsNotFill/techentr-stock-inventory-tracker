import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAsUser } from "@/lib/db/rls";
import {
  addMember,
  changeMemberRole,
  findUserIdByEmail,
  getRestaurantDetails,
  listTeam,
  removeMember,
  TeamError,
  updateRestaurantDetails,
} from "@/lib/team";
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

describe.skipIf(!hasDatabase)("team and restaurant details", () => {
  let testDb: TestDb;
  let owner: TestUser;
  let manager: TestUser;
  let staff: TestUser;
  let outsider: TestUser;
  let restaurant: TestRestaurant;
  let otherRestaurant: TestRestaurant;
  let invitedUserId: string | undefined;

  const as = <T>(user: TestUser, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(testDb.db, user.id, fn);

  beforeAll(async () => {
    testDb = createTestDb();
    [owner, manager, staff, outsider] = await Promise.all([
      createTestUser("team-owner"),
      createTestUser("team-manager"),
      createTestUser("team-staff"),
      createTestUser("team-outsider"),
    ]);
    restaurant = await createTestRestaurant(testDb.db, owner, "Team Test");
    otherRestaurant = await createTestRestaurant(testDb.db, outsider, "Team Other");
    await addTestMember(testDb.db, restaurant, manager, "manager");
    await addTestMember(testDb.db, restaurant, staff, "staff");
  });

  afterAll(async () => {
    await deleteTestRestaurants(testDb.db, [restaurant, otherRestaurant]);
    await Promise.all([owner, manager, staff, outsider].map(deleteTestUser));
    if (invitedUserId) await deleteTestUser({ id: invitedUserId });
    await testDb.close();
  });

  it("lists the team with e-mail addresses for owners and managers only", async () => {
    const seenByOwner = await as(owner, (tx) => listTeam(tx, restaurant.locationId));
    expect(seenByOwner.map((member) => [member.email, member.role]).sort()).toEqual(
      [
        [owner.email, "owner"],
        [manager.email, "manager"],
        [staff.email, "staff"],
      ].sort(),
    );
    expect(await as(manager, (tx) => listTeam(tx, restaurant.locationId))).toHaveLength(3);
    expect(await as(staff, (tx) => listTeam(tx, restaurant.locationId))).toEqual([]);
    expect(await as(outsider, (tx) => listTeam(tx, restaurant.locationId))).toEqual([]);
  });

  it("lets only an owner of the location look up an account by e-mail", async () => {
    expect(await as(owner, (tx) => findUserIdByEmail(tx, restaurant.locationId, outsider.email.toUpperCase()))).toBe(
      outsider.id,
    );
    expect(await as(manager, (tx) => findUserIdByEmail(tx, restaurant.locationId, outsider.email))).toBeNull();
    expect(await as(outsider, (tx) => findUserIdByEmail(tx, restaurant.locationId, owner.email))).toBeNull();
  });

  it("lets only the owner change roles and remove people", async () => {
    await expect(as(manager, (tx) => changeMemberRole(tx, restaurant.locationId, staff.id, "manager"))).rejects.toThrow(
      TeamError,
    );
    await expect(as(staff, (tx) => removeMember(tx, restaurant.locationId, manager.id))).rejects.toThrow(TeamError);
    await expect(as(manager, (tx) => addMember(tx, restaurant.locationId, outsider.id, "staff"))).rejects.toThrow();

    await as(owner, (tx) => changeMemberRole(tx, restaurant.locationId, staff.id, "manager"));
    await as(owner, (tx) => changeMemberRole(tx, restaurant.locationId, staff.id, "staff"));
    await expect(as(owner, (tx) => addMember(tx, restaurant.locationId, staff.id, "staff"))).rejects.toThrow(
      "already on the team",
    );
  });

  it("never leaves a restaurant without an owner", async () => {
    await expect(as(owner, (tx) => changeMemberRole(tx, restaurant.locationId, owner.id, "manager"))).rejects.toThrow(
      "at least one owner",
    );
    await expect(as(owner, (tx) => removeMember(tx, restaurant.locationId, owner.id))).rejects.toThrow(
      "at least one owner",
    );

    // With a second owner, the first one may step down.
    await as(owner, (tx) => changeMemberRole(tx, restaurant.locationId, manager.id, "owner"));
    await as(owner, (tx) => changeMemberRole(tx, restaurant.locationId, owner.id, "manager"));
    await as(manager, (tx) => changeMemberRole(tx, restaurant.locationId, owner.id, "owner"));
    await as(owner, (tx) => changeMemberRole(tx, restaurant.locationId, manager.id, "manager"));
  });

  it("lets only the owner change the restaurant's details", async () => {
    const details = { name: "Renamed Pizzeria", posProvider: "lightspeed", timezone: "Europe/Rome" };
    await expect(as(manager, (tx) => updateRestaurantDetails(tx, restaurant.locationId, details))).rejects.toThrow(
      TeamError,
    );
    await expect(as(outsider, (tx) => updateRestaurantDetails(tx, restaurant.locationId, details))).rejects.toThrow(
      TeamError,
    );
    await as(owner, (tx) => updateRestaurantDetails(tx, restaurant.locationId, details));
    expect(await as(staff, (tx) => getRestaurantDetails(tx, restaurant.locationId))).toEqual(details);
  });

  it("an invite link signs the new person in once, so they can choose a password", async () => {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const email = `test-invited-${randomUUID()}@example.com`;
    const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email });
    expect(error).toBeNull();
    invitedUserId = data.user?.id;
    expect(invitedUserId).toBeTruthy();

    await as(owner, (tx) => addMember(tx, restaurant.locationId, invitedUserId!, "staff"));

    const browser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const verified = await browser.auth.verifyOtp({ token_hash: data.properties!.hashed_token, type: "invite" });
    expect(verified.error).toBeNull();
    expect(verified.data.user?.id).toBe(invitedUserId);

    const again = await browser.auth.verifyOtp({ token_hash: data.properties!.hashed_token, type: "invite" });
    expect(again.error).not.toBeNull();
  });
});
