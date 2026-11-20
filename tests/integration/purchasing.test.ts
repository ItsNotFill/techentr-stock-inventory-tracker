import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAsUser } from "@/lib/db/rls";
import { deliveries, purchaseOrderLines } from "@/lib/db/schema";
import { addPackSize, createIngredient, getIngredient, updateIngredient } from "@/lib/ingredients";
import { appendMovements, stockNow, stockOf } from "@/lib/ledger";
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrder,
  listOrderSuggestions,
  listSuppliers,
  markPurchaseOrderSent,
  PurchasingError,
  receivePurchaseOrder,
  savePurchaseOrder,
  saveSupplier,
} from "@/lib/purchasing";
import { ingredientFormSchema, packSizeFormSchema } from "@/lib/validation/ingredients";
import { purchaseOrderInputSchema, supplierFormSchema } from "@/lib/validation/purchasing";
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

const ingredient = (name: string, reorderKg: string, parKg: string, supplierId?: string) =>
  ingredientFormSchema.parse({
    name,
    baseUnit: "g",
    costAmount: "8",
    costUnit: "kg",
    reorderPoint: reorderKg,
    parLevel: parKg,
    levelUnit: "kg",
    category: "",
    storageArea: "",
    ...(supplierId === undefined ? {} : { supplierId }),
  });
const supplier = (name: string, email = "") => supplierFormSchema.parse({ name, contactName: "", email, phone: "", notes: "" });

/** Suppliers and purchase orders against the real database (DECISIONS.md 97). */
describe.skipIf(!hasDatabase)("suppliers and purchase orders", () => {
  let testDb: TestDb;
  let owner: TestUser;
  let staff: TestUser;
  let otherOwner: TestUser;
  let restaurant: TestRestaurant;
  let otherRestaurant: TestRestaurant;
  let rossi: string;
  let mozzarella: string;
  let basil: string;
  let flour: string;
  let bag: string;
  let orderId: string;

  const as = <T>(user: TestUser, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(testDb.db, user.id, fn);
  const loc = () => restaurant.locationId;
  const stockOfIngredient = async (id: string) => stockOf(await as(owner, (tx) => stockNow(tx, loc())), id);

  beforeAll(async () => {
    testDb = createTestDb();
    [owner, staff, otherOwner] = await Promise.all([createTestUser("po-owner"), createTestUser("po-staff"), createTestUser("po-other")]);
    restaurant = await createTestRestaurant(testDb.db, owner, "Purchasing");
    otherRestaurant = await createTestRestaurant(testDb.db, otherOwner, "Purchasing Other");
    await addTestMember(testDb.db, restaurant, staff, "staff");
    await as(owner, async (tx) => {
      rossi = await saveSupplier(tx, loc(), null, supplier("Caseificio Rossi", "orders@rossi.example.com"));
      mozzarella = await createIngredient(tx, loc(), ingredient("Mozzarella", "2", "8", rossi));
      basil = await createIngredient(tx, loc(), ingredient("Basil", "0.1", "0.3"));
      flour = await createIngredient(tx, loc(), ingredient("Flour", "1", "10"));
      bag = await addPackSize(tx, loc(), mozzarella, packSizeFormSchema.parse({ label: "Bag 1 kg", amount: "1", unit: "kg", isDefault: true }));
      const yesterday = new Date(Date.now() - 24 * 3_600_000);
      await appendMovements(tx, loc(), [
        { ingredientId: mozzarella, qtyDelta: "1900", type: "count_adjust", occurredAt: yesterday, createdBy: owner.id },
        { ingredientId: basil, qtyDelta: "50", type: "count_adjust", occurredAt: yesterday, createdBy: owner.id },
        { ingredientId: flour, qtyDelta: "5000", type: "count_adjust", occurredAt: yesterday, createdBy: owner.id },
      ]);
    });
  });

  afterAll(async () => {
    await deleteTestRestaurants(testDb.db, [restaurant, otherRestaurant]);
    await Promise.all([owner, staff, otherOwner].map(deleteTestUser));
    await testDb.close();
  });

  it("keeps suppliers per restaurant, with unique names, written by owners and managers", async () => {
    await expect(as(owner, (tx) => saveSupplier(tx, loc(), null, supplier("caseificio ROSSI")))).rejects.toThrow("already a supplier");
    await expect(as(staff, (tx) => saveSupplier(tx, loc(), null, supplier("Staff's own")))).rejects.toThrow();
    const list = await as(owner, (tx) => listSuppliers(tx, loc()));
    expect(list).toEqual([expect.objectContaining({ name: "Caseificio Rossi", email: "orders@rossi.example.com", ingredientCount: 1, openOrders: 0 })]);
    expect(await as(otherOwner, (tx) => listSuppliers(tx, loc()))).toEqual([]);
    // The ingredient form without a supplier field keeps the supplier.
    await as(owner, (tx) => updateIngredient(tx, loc(), mozzarella, ingredient("Mozzarella", "2", "8")));
    expect((await as(owner, (tx) => getIngredient(tx, loc(), mozzarella)))?.supplierId).toBe(rossi);
  });

  it("suggests what is low, per supplier, in whole packs", async () => {
    const groups = await as(owner, (tx) => listOrderSuggestions(tx, loc()));
    expect(groups.map((group) => [group.supplier?.name ?? null, group.lines.map((line) => [line.name, line.qtyBaseUnit, line.packCount])])).toEqual([
      // 8,000 - 1,900 = 6,100 g: 7 bags.
      ["Caseificio Rossi", [["Mozzarella", "7000.000", "7.000"]]],
      // 300 - 50 = 250 g, no pack; flour is not low.
      [null, [["Basil", "250.000", null]]],
    ]);
  });

  it("makes an order from the suggestions, and then suggests nothing more for it", async () => {
    orderId = await as(owner, (tx) => createPurchaseOrder(tx, loc(), owner.id, rossi, { fromSuggestions: true }));
    const order = await as(owner, (tx) => getPurchaseOrder(tx, loc(), orderId));
    expect(order).toMatchObject({ status: "draft", supplier: { name: "Caseificio Rossi" } });
    expect(order?.lines).toEqual([expect.objectContaining({ name: "Mozzarella", packSizeId: bag, packCount: "7.000", qtyBaseUnit: "7000.000" })]);
    expect(order?.text).toContain("- Mozzarella: 7 × Bag 1 kg (7,000 g)");
    const groups = await as(owner, (tx) => listOrderSuggestions(tx, loc()));
    expect(groups.map((group) => group.supplier?.name ?? null)).toEqual([null]);
  });

  it("edits a draft, sends it, and then refuses changes", async () => {
    const input = (lines: { ingredientId: string; amount: string; unit: string }[]) => purchaseOrderInputSchema.parse({ notes: "Before 10:00", lines });
    await expect(
      as(owner, (tx) =>
        savePurchaseOrder(tx, loc(), orderId, input([
          { ingredientId: mozzarella, amount: "6", unit: `pack:${bag}` },
          { ingredientId: mozzarella, amount: "1", unit: "kg" },
        ])),
      ),
    ).rejects.toThrow("twice");
    await as(owner, (tx) =>
      savePurchaseOrder(tx, loc(), orderId, input([
        { ingredientId: mozzarella, amount: "6", unit: `pack:${bag}` },
        { ingredientId: flour, amount: "2,5", unit: "kg" },
      ])),
    );
    await as(owner, (tx) => markPurchaseOrderSent(tx, loc(), owner.id, orderId));
    const sent = await as(owner, (tx) => getPurchaseOrder(tx, loc(), orderId));
    expect(sent).toMatchObject({ status: "sent", notes: "Before 10:00" });
    expect(sent?.text).toContain("Before 10:00");
    await expect(as(owner, (tx) => savePurchaseOrder(tx, loc(), orderId, input([])))).rejects.toThrow("Only a draft");
    // Even straight at the table: lines of a sent order are closed to the app role.
    const changed = await as(owner, (tx) =>
      tx.update(purchaseOrderLines).set({ qtyBaseUnit: "1" }).where(eq(purchaseOrderLines.purchaseOrderId, orderId)).returning({ id: purchaseOrderLines.id }),
    );
    expect(changed).toEqual([]);
  });

  it("receives what really arrived as a delivery, once, and the stock goes up", async () => {
    const clientId = randomUUID();
    const receive = () =>
      as(owner, (tx) =>
        receivePurchaseOrder(tx, loc(), owner.id, orderId, {
          clientId,
          deliveredAt: new Date(),
          // Five bags came, not six; the flour came as ordered.
          lines: [
            { ingredientId: mozzarella, amount: "5", unit: `pack:${bag}` },
            { ingredientId: flour, amount: "2.5", unit: "kg" },
          ],
        }),
      );
    const first = await receive();
    expect(first.alreadyReceived).toBe(false);
    expect(await stockOfIngredient(mozzarella)).toBe("6900.000");
    expect(await stockOfIngredient(flour)).toBe("7500.000");
    const [delivery] = await testDb.db.select().from(deliveries).where(eq(deliveries.id, first.deliveryId));
    expect(delivery).toMatchObject({ status: "confirmed", supplierName: "Caseificio Rossi" });
    expect((await as(owner, (tx) => getPurchaseOrder(tx, loc(), orderId)))).toMatchObject({ status: "received", deliveryId: first.deliveryId });

    // The answer was lost; the same submit again changes nothing.
    expect(await receive()).toEqual({ deliveryId: first.deliveryId, alreadyReceived: true });
    expect(await stockOfIngredient(mozzarella)).toBe("6900.000");
  });

  it("cancels an open order, never a received one", async () => {
    const draft = await as(owner, (tx) => createPurchaseOrder(tx, loc(), owner.id, rossi, { fromSuggestions: false }));
    await expect(as(owner, (tx) => markPurchaseOrderSent(tx, loc(), owner.id, draft))).rejects.toThrow("at least one line");
    await as(owner, (tx) => cancelPurchaseOrder(tx, loc(), draft));
    expect((await as(owner, (tx) => getPurchaseOrder(tx, loc(), draft)))?.status).toBe("cancelled");
    const error = await as(owner, (tx) => cancelPurchaseOrder(tx, loc(), orderId)).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PurchasingError);
  });

  it("keeps orders to owners and managers, and restaurants apart", async () => {
    await expect(as(staff, (tx) => createPurchaseOrder(tx, loc(), staff.id, rossi, { fromSuggestions: false }))).rejects.toThrow();
    // Another restaurant cannot order from this one's supplier, nor see its orders.
    await expect(
      as(otherOwner, (tx) => createPurchaseOrder(tx, otherRestaurant.locationId, otherOwner.id, rossi, { fromSuggestions: false })),
    ).rejects.toThrow("no longer exists");
    expect(await as(otherOwner, (tx) => getPurchaseOrder(tx, loc(), orderId))).toBeNull();
  });
});
