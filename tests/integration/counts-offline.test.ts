import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CountError, saveCountEntries, startCount, submitFromSheet } from "@/lib/counts";
import { runAsUser } from "@/lib/db/rls";
import { countLines, countSessions } from "@/lib/db/schema";
import { createIngredient } from "@/lib/ingredients";
import { ingredientFormSchema } from "@/lib/validation/ingredients";
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

const MINUTE = 60_000;

/**
 * Submits sent late from a phone (DECISIONS.md 94), through the same function
 * as the count sheet's Server Action: the count time, retries, and who may.
 */
describe.skipIf(!hasDatabase)("count submits sent late from a phone", () => {
  let testDb: TestDb;
  let owner: TestUser;
  let staff: TestUser;
  let otherStaff: TestUser;
  let restaurant: TestRestaurant;
  let mozzarella: string;

  const as = <T>(user: TestUser, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(testDb.db, user.id, fn);
  const loc = () => restaurant.locationId;
  const entries = (amount: string) => [{ ingredientId: mozzarella, amount, unit: "g" }];

  /** A draft started by `user`, with its start moved `minutesAgo` into the past. */
  async function draft(user: TestUser, minutesAgo: number) {
    const id = await as(user, (tx) => startCount(tx, loc(), user.id, randomUUID()));
    await testDb.db
      .update(countSessions)
      .set({ startedAt: new Date(Date.now() - minutesAgo * MINUTE) })
      .where(eq(countSessions.id, id));
    return id;
  }

  async function session(id: string) {
    const [row] = await testDb.db.select().from(countSessions).where(eq(countSessions.id, id));
    return row;
  }

  beforeAll(async () => {
    testDb = createTestDb();
    [owner, staff, otherStaff] = await Promise.all([
      createTestUser("offline-owner"),
      createTestUser("offline-staff"),
      createTestUser("offline-staff2"),
    ]);
    restaurant = await createTestRestaurant(testDb.db, owner, "Offline Counts");
    await addTestMember(testDb.db, restaurant, staff, "staff");
    await addTestMember(testDb.db, restaurant, otherStaff, "staff");
    mozzarella = await as(owner, (tx) =>
      createIngredient(
        tx,
        loc(),
        ingredientFormSchema.parse({ name: "Mozzarella", baseUnit: "g", costAmount: "8", costUnit: "kg", reorderPoint: "", parLevel: "", levelUnit: "kg", category: "", storageArea: "" }),
      ),
    );
  });

  afterAll(async () => {
    await deleteTestRestaurants(testDb.db, [restaurant]);
    await Promise.all([owner, staff, otherStaff].map(deleteTestUser));
    await testDb.close();
  });

  it("dates a late submit at the tap, and a repeat of it changes nothing", async () => {
    const id = await draft(staff, 30);
    const tappedAt = new Date(Date.now() - 10 * MINUTE);
    const submit = () => as(staff, (tx) => submitFromSheet(tx, loc(), staff.id, id, entries("1900"), { approve: false, tappedAt }));
    expect(await submit()).toBe("submitted");
    const first = await session(id);
    expect(first).toMatchObject({ status: "submitted" });
    expect(first.submittedAt?.getTime()).toBe(tappedAt.getTime());

    // The answer was lost; the phone sends it again.
    expect(await submit()).toBe("already");
    const again = await session(id);
    expect(again.submittedAt?.getTime()).toBe(tappedAt.getTime());
    const lines = await testDb.db.select().from(countLines).where(eq(countLines.sessionId, id));
    expect(lines.map((line) => line.countedQty)).toEqual(["1900.000"]);
  });

  it("keeps a phone's wrong clock inside the count: not before its start, not after now", async () => {
    const early = await draft(staff, 30);
    await as(staff, (tx) => submitFromSheet(tx, loc(), staff.id, early, entries("100"), { approve: false, tappedAt: new Date("2020-01-01T00:00:00Z") }));
    const before = await session(early);
    expect(before.submittedAt?.getTime()).toBe(before.startedAt.getTime());

    const late = await draft(staff, 30);
    const start = Date.now();
    await as(staff, (tx) => submitFromSheet(tx, loc(), staff.id, late, entries("100"), { approve: false, tappedAt: new Date(Date.now() + 3_600_000) }));
    const after = await session(late);
    expect(after.submittedAt!.getTime()).toBeGreaterThanOrEqual(start - 1_000);
    expect(after.submittedAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1_000);
  });

  it("gives a submit tapped online no pass: a second one is an error", async () => {
    const id = await draft(staff, 5);
    await as(staff, (tx) => submitFromSheet(tx, loc(), staff.id, id, entries("50"), { approve: false, tappedAt: null }));
    // Refused (the draft lock no longer sees a submitted count), and nothing changes.
    await expect(as(staff, (tx) => submitFromSheet(tx, loc(), staff.id, id, entries("60"), { approve: false, tappedAt: null }))).rejects.toThrow(
      CountError,
    );
    const lines = await testDb.db.select().from(countLines).where(eq(countLines.sessionId, id));
    expect(lines.map((line) => line.countedQty)).toEqual(["50.000"]);
  });

  it("does not let anyone else's late submit through", async () => {
    const id = await draft(staff, 5);
    await as(staff, (tx) => submitFromSheet(tx, loc(), staff.id, id, entries("50"), { approve: false, tappedAt: null }));
    const error = await as(otherStaff, (tx) =>
      submitFromSheet(tx, loc(), otherStaff.id, id, entries("70"), { approve: false, tappedAt: new Date() }),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CountError);
  });

  it("still approves when a kept 'submit and approve' finds the count only submitted", async () => {
    const id = await draft(owner, 5);
    await as(owner, (tx) => saveCountEntries(tx, loc(), owner.id, id, entries("40")));
    await as(owner, (tx) => submitFromSheet(tx, loc(), owner.id, id, entries("40"), { approve: false, tappedAt: null }));
    expect(await as(owner, (tx) => submitFromSheet(tx, loc(), owner.id, id, entries("40"), { approve: true, tappedAt: new Date() }))).toBe("submitted");
    expect((await session(id)).status).toBe("approved");
  });
});
