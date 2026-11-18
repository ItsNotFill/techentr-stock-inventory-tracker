import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAsUser } from "@/lib/db/rls";
import { deliveries, deliveryLines } from "@/lib/db/schema";
import { addPackSize, createIngredient, deletePackSize } from "@/lib/ingredients";
import { ingredientFormSchema, packSizeFormSchema } from "@/lib/validation/ingredients";
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

/** Every message down an error's `cause` chain: Drizzle wraps the Postgres error. */
function messages(error: unknown): string {
  const parts: string[] = [];
  for (let current = error; current instanceof Error; current = current.cause) parts.push(current.message);
  return parts.join(" | ");
}

async function expectRefused(promise: Promise<unknown>, text: string) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error, "expected the database to refuse").not.toBeNull();
  expect(messages(error)).toContain(text);
}

/**
 * The deliveries tables on their own (migration 0013): who may write what,
 * tenant keys, and that a confirmed delivery cannot change. The delivery
 * logic itself is tested in deliveries.test.ts.
 */
describe.skipIf(!hasDatabase)("deliveries and delivery_lines tables", () => {
  let testDb: TestDb;
  let owner: TestUser;
  let staff: TestUser;
  let otherStaff: TestUser;
  let otherOwner: TestUser;
  let restaurant: TestRestaurant;
  let otherRestaurant: TestRestaurant;
  let mozzarella: string;
  let bag: string;
  let otherIngredient: string;

  const as = <T>(user: TestUser, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(testDb.db, user.id, fn);
  const loc = () => restaurant.locationId;

  /** A draft delivery with one line of 5 bags, made by `user`. */
  async function draftWithLine(user: TestUser, source: "manual" | "invoice_photo" = "manual") {
    return as(user, async (tx) => {
      const [delivery] = await tx
        .insert(deliveries)
        .values({
          locationId: loc(),
          source,
          status: "draft",
          createdBy: user.id,
          photoPath: source === "invoice_photo" ? `${loc()}/supplier_invoice/test.jpg` : null,
        })
        .returning({ id: deliveries.id });
      const [line] = await tx
        .insert(deliveryLines)
        .values({ locationId: loc(), deliveryId: delivery.id, ingredientId: mozzarella, packSizeId: bag, packCount: "5", qtyBaseUnit: "5000" })
        .returning({ id: deliveryLines.id });
      return { deliveryId: delivery.id, lineId: line.id };
    });
  }

  const confirm = (user: TestUser, deliveryId: string) =>
    as(user, (tx) =>
      tx
        .update(deliveries)
        .set({ status: "confirmed", confirmedBy: user.id, confirmedAt: new Date() })
        .where(eq(deliveries.id, deliveryId))
        .returning({ id: deliveries.id }),
    );

  beforeAll(async () => {
    testDb = createTestDb();
    [owner, staff, otherStaff, otherOwner] = await Promise.all([
      createTestUser("delivery-tables-owner"),
      createTestUser("delivery-tables-staff"),
      createTestUser("delivery-tables-staff2"),
      createTestUser("delivery-tables-other"),
    ]);
    restaurant = await createTestRestaurant(testDb.db, owner, "Delivery Tables");
    otherRestaurant = await createTestRestaurant(testDb.db, otherOwner, "Delivery Tables Other");
    await addTestMember(testDb.db, restaurant, staff, "staff");
    await addTestMember(testDb.db, restaurant, otherStaff, "staff");
    [mozzarella, bag] = await as(owner, async (tx) => {
      const id = await createIngredient(tx, loc(), ingredient("Mozzarella"));
      const pack = await addPackSize(tx, loc(), id, packSizeFormSchema.parse({ label: "Bag 1 kg", amount: "1", unit: "kg", isDefault: true }));
      return [id, pack];
    });
    otherIngredient = await as(otherOwner, (tx) => createIngredient(tx, otherRestaurant.locationId, ingredient("Other cheese")));
  });

  afterAll(async () => {
    await deleteTestRestaurants(testDb.db, [restaurant, otherRestaurant]);
    await Promise.all([owner, staff, otherStaff, otherOwner].map(deleteTestUser));
    await testDb.close();
  });

  it("lets staff write a manual delivery as a draft and confirm it", async () => {
    const { deliveryId } = await draftWithLine(staff);
    expect(await confirm(staff, deliveryId)).toHaveLength(1);
    const [row] = await testDb.db.select().from(deliveries).where(eq(deliveries.id, deliveryId));
    expect(row.status).toBe("confirmed");
  });

  it("refuses a delivery that starts confirmed or in someone else's name", async () => {
    await expect(
      as(staff, (tx) =>
        tx.insert(deliveries).values({ locationId: loc(), source: "manual", status: "confirmed", createdBy: staff.id, confirmedAt: new Date() }),
      ),
    ).rejects.toThrow();
    await expect(
      as(staff, (tx) => tx.insert(deliveries).values({ locationId: loc(), source: "manual", status: "draft", createdBy: owner.id })),
    ).rejects.toThrow();
  });

  it("keeps invoice photos for owners and managers to confirm", async () => {
    const { deliveryId } = await draftWithLine(staff, "invoice_photo");
    // RLS refuses the new row: staff may only confirm a manual delivery.
    await expect(confirm(staff, deliveryId)).rejects.toThrow();
    expect(await confirm(owner, deliveryId)).toHaveLength(1);
  });

  it("lets nobody but its author or a manager touch a draft", async () => {
    const { deliveryId, lineId } = await draftWithLine(staff);
    expect(await confirm(otherStaff, deliveryId)).toHaveLength(0);
    const changed = await as(otherStaff, (tx) =>
      tx.update(deliveryLines).set({ qtyBaseUnit: "1" }).where(eq(deliveryLines.id, lineId)).returning({ id: deliveryLines.id }),
    );
    expect(changed).toHaveLength(0);
    await expect(
      as(otherStaff, (tx) => tx.insert(deliveryLines).values({ locationId: loc(), deliveryId, ingredientId: mozzarella, qtyBaseUnit: "1" })),
    ).rejects.toThrow();
  });

  it("refuses to confirm a delivery without lines or with an incomplete line", async () => {
    const [empty] = await as(staff, (tx) =>
      tx.insert(deliveries).values({ locationId: loc(), source: "manual", status: "draft", createdBy: staff.id }).returning({ id: deliveries.id }),
    );
    await expectRefused(confirm(staff, empty.id), "at least one line");

    const incomplete = await draftWithLine(staff);
    await as(staff, (tx) => tx.insert(deliveryLines).values({ locationId: loc(), deliveryId: incomplete.deliveryId, ingredientId: mozzarella }));
    await expectRefused(confirm(staff, incomplete.deliveryId), "needs an ingredient and a quantity");
  });

  it("freezes a confirmed delivery and its lines, for every role", async () => {
    const { deliveryId, lineId } = await draftWithLine(staff);
    await confirm(staff, deliveryId);

    // The app role: nothing matches its policies any more.
    const updated = await as(owner, (tx) =>
      tx.update(deliveries).set({ supplierName: "Changed" }).where(eq(deliveries.id, deliveryId)).returning({ id: deliveries.id }),
    );
    expect(updated).toHaveLength(0);
    await expect(
      as(owner, (tx) => tx.insert(deliveryLines).values({ locationId: loc(), deliveryId, ingredientId: mozzarella, qtyBaseUnit: "1" })),
    ).rejects.toThrow();

    // The admin connection: the triggers refuse.
    await expectRefused(testDb.db.update(deliveries).set({ supplierName: "Changed" }).where(eq(deliveries.id, deliveryId)), "confirmed delivery");
    await expectRefused(testDb.db.delete(deliveries).where(eq(deliveries.id, deliveryId)), "confirmed delivery");
    await expectRefused(testDb.db.update(deliveryLines).set({ qtyBaseUnit: "1" }).where(eq(deliveryLines.id, lineId)), "confirmed delivery");
    await expectRefused(testDb.db.delete(deliveryLines).where(eq(deliveryLines.id, lineId)), "confirmed delivery");
    await expectRefused(
      testDb.db.insert(deliveryLines).values({ locationId: loc(), deliveryId, ingredientId: mozzarella, qtyBaseUnit: "1" }),
      "confirmed delivery",
    );
  });

  it("still lets a pack size be deleted: old lines keep their quantity", async () => {
    const pack = await as(owner, (tx) =>
      addPackSize(tx, loc(), mozzarella, packSizeFormSchema.parse({ label: "Box 5 kg", amount: "5", unit: "kg", isDefault: false })),
    );
    const { deliveryId, lineId } = await as(staff, async (tx) => {
      const [delivery] = await tx
        .insert(deliveries)
        .values({ locationId: loc(), source: "manual", status: "draft", createdBy: staff.id })
        .returning({ id: deliveries.id });
      const [line] = await tx
        .insert(deliveryLines)
        .values({ locationId: loc(), deliveryId: delivery.id, ingredientId: mozzarella, packSizeId: pack, packCount: "2", qtyBaseUnit: "10000" })
        .returning({ id: deliveryLines.id });
      return { deliveryId: delivery.id, lineId: line.id };
    });
    await confirm(staff, deliveryId);

    await as(owner, (tx) => deletePackSize(tx, loc(), pack));
    const [line] = await testDb.db.select().from(deliveryLines).where(eq(deliveryLines.id, lineId));
    expect(line.packSizeId).toBeNull();
    expect(line.locationId).toBe(loc());
    expect(line.qtyBaseUnit).toBe("10000.000");
  });

  it("keeps restaurants apart", async () => {
    const { deliveryId } = await draftWithLine(owner);
    // The other restaurant sees none of it.
    const seen = await as(otherOwner, (tx) => tx.select().from(deliveries).where(eq(deliveries.id, deliveryId)));
    expect(seen).toHaveLength(0);
    const seenLines = await as(otherOwner, (tx) => tx.select().from(deliveryLines).where(eq(deliveryLines.deliveryId, deliveryId)));
    expect(seenLines).toHaveLength(0);

    // A line cannot point at another restaurant's ingredient, even from the admin connection (composite key).
    await expect(
      testDb.db.insert(deliveryLines).values({ locationId: loc(), deliveryId, ingredientId: otherIngredient, qtyBaseUnit: "1" }),
    ).rejects.toThrow();
    // Nor be filed under another restaurant's delivery.
    await expect(
      as(otherOwner, (tx) =>
        tx.insert(deliveryLines).values({ locationId: otherRestaurant.locationId, deliveryId, ingredientId: otherIngredient, qtyBaseUnit: "1" }),
      ),
    ).rejects.toThrow();
  });

  it("lets the author delete an unconfirmed draft, lines and all", async () => {
    const { deliveryId } = await draftWithLine(staff);
    const removed = await as(staff, (tx) =>
      tx
        .delete(deliveries)
        .where(and(eq(deliveries.id, deliveryId), eq(deliveries.locationId, loc())))
        .returning({ id: deliveries.id }),
    );
    expect(removed).toHaveLength(1);
    const lines = await testDb.db.select().from(deliveryLines).where(eq(deliveryLines.deliveryId, deliveryId));
    expect(lines).toHaveLength(0);
  });
});
