import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocation, listMyLocations, LocationError, pickLocation } from "@/lib/auth/locations";
import { runAsUser } from "@/lib/db/rls";
import { createIngredient, listIngredients } from "@/lib/ingredients";
import { ingredientFormSchema } from "@/lib/validation/ingredients";
import {
  addTestMember,
  createTestDb,
  createTestRestaurant,
  createTestUser,
  deleteRestaurantData,
  deleteTestRestaurants,
  deleteTestUser,
  hasDatabase,
  type TestDb,
  type TestRestaurant,
  type TestUser,
} from "../helpers/db";

const ingredient = (name: string) =>
  ingredientFormSchema.parse({
    name,
    baseUnit: "g",
    costAmount: "8",
    costUnit: "kg",
    reorderPoint: "",
    parLevel: "",
    levelUnit: "kg",
    category: "",
    storageArea: "",
  });

describe("choosing a location", () => {
  const mine = [{ locationId: "a" }, { locationId: "b" }];
  it("takes the chosen location when the user belongs to it, else the first", () => {
    expect(pickLocation(mine, "b")).toEqual({ locationId: "b" });
    expect(pickLocation(mine, "someone-else's")).toEqual({ locationId: "a" });
    expect(pickLocation(mine, undefined)).toEqual({ locationId: "a" });
    expect(pickLocation([], "a")).toBeNull();
  });
});

/** Several locations per organization (DECISIONS.md 98), against the real database. */
describe.skipIf(!hasDatabase)("locations", () => {
  let testDb: TestDb;
  let owner: TestUser;
  let manager: TestUser;
  let otherOwner: TestUser;
  let restaurant: TestRestaurant;
  let otherRestaurant: TestRestaurant;
  let second: string;

  const as = <T>(user: TestUser, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(testDb.db, user.id, fn);

  beforeAll(async () => {
    testDb = createTestDb();
    [owner, manager, otherOwner] = await Promise.all([createTestUser("loc-owner"), createTestUser("loc-manager"), createTestUser("loc-other")]);
    restaurant = await createTestRestaurant(testDb.db, owner, "Locations One");
    otherRestaurant = await createTestRestaurant(testDb.db, otherOwner, "Locations Other");
    await addTestMember(testDb.db, restaurant, manager, "manager");
  });

  afterAll(async () => {
    // The second location shares the organization, so it goes first.
    if (second) await deleteRestaurantData(testDb.db, [second], []);
    await deleteTestRestaurants(testDb.db, [restaurant, otherRestaurant]);
    await Promise.all([owner, manager, otherOwner].map(deleteTestUser));
    await testDb.close();
  });

  it("lets an owner add a location to the organization and own it", async () => {
    second = await as(owner, (tx) => createLocation(tx, restaurant.organizationId, "  Pizzeria Centro  ", "Europe/Rome"));
    const mine = await as(owner, (tx) => listMyLocations(tx, owner.id));
    expect(mine.map((location) => [location.locationName, location.role])).toEqual([
      [expect.stringContaining("Locations One"), "owner"],
      ["Pizzeria Centro", "owner"],
    ]);
    expect(mine[1]).toMatchObject({ organizationId: restaurant.organizationId, timezone: "Europe/Rome" });
  });

  it("refuses managers, owners of another organization, bad names and bad timezones", async () => {
    const refusal = async (user: TestUser, org: string, name: string, tz: string) => {
      const error = await as(user, (tx) => createLocation(tx, org, name, tz)).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(LocationError);
      return error as LocationError;
    };
    expect((await refusal(manager, restaurant.organizationId, "Manager's own", "Europe/Rome")).message).toContain("Only an owner");
    expect((await refusal(otherOwner, restaurant.organizationId, "Takeover", "Europe/Rome")).message).toContain("Only an owner");
    expect((await refusal(owner, restaurant.organizationId, "   ", "Europe/Rome")).field).toBe("name");
    expect((await refusal(owner, restaurant.organizationId, "Somewhere", "Mars/Olympus")).field).toBe("timezone");
  });

  it("keeps each location's data to itself", async () => {
    await as(owner, (tx) => createIngredient(tx, second, ingredient("Centro mozzarella")));
    const first = await as(owner, (tx) => listIngredients(tx, restaurant.locationId));
    const centro = await as(owner, (tx) => listIngredients(tx, second));
    expect(first.map((row) => row.name)).not.toContain("Centro mozzarella");
    expect(centro.map((row) => row.name)).toEqual(["Centro mozzarella"]);
    // The manager of the first location is not part of the second.
    expect(await as(manager, (tx) => listIngredients(tx, second))).toEqual([]);
    expect((await as(manager, (tx) => listMyLocations(tx, manager.id))).map((row) => row.locationId)).toEqual([restaurant.locationId]);
  });
});
