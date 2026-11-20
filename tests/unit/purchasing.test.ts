import { describe, expect, it } from "vitest";
import { orderText, suggestQuantity, type SuggestInput } from "@/lib/purchasing/suggest";

const bag = { id: "bag", label: "Bag 1 kg", qtyInBaseUnit: "1000" };
const mozzarella = (overrides: Partial<SuggestInput> = {}): SuggestInput => ({
  baseUnit: "g",
  stock: "1900",
  reorderPoint: "2000",
  parLevel: "8000",
  onOrder: "0",
  pack: bag,
  ...overrides,
});

describe("order suggestions", () => {
  it("tops a low ingredient up to its par level in whole packs", () => {
    // 8,000 - 1,900 = 6,100 g -> 7 bags of 1 kg.
    expect(suggestQuantity(mozzarella())).toEqual({ qtyBaseUnit: "7000.000", packCount: "7.000", packSizeId: "bag" });
  });

  it("suggests nothing above the reorder point, or without one", () => {
    expect(suggestQuantity(mozzarella({ stock: "2000.001" }))).toBeNull();
    expect(suggestQuantity(mozzarella({ reorderPoint: null }))).toBeNull();
  });

  it("counts what is already on order", () => {
    expect(suggestQuantity(mozzarella({ onOrder: "5000" }))?.packCount).toBe("2.000");
    expect(suggestQuantity(mozzarella({ onOrder: "6100" }))).toBeNull();
  });

  it("aims for twice the reorder point without a par level", () => {
    // 2 x 2,000 - 1,900 = 2,100 g -> 3 bags.
    expect(suggestQuantity(mozzarella({ parLevel: null }))?.packCount).toBe("3.000");
  });

  it("orders whole units without a pack, and the exact amount for weights and volumes", () => {
    expect(suggestQuantity({ baseUnit: "unit", stock: "40", reorderPoint: "50", parLevel: "120.5", onOrder: "0", pack: null })).toEqual({
      qtyBaseUnit: "81.000",
      packCount: null,
      packSizeId: null,
    });
    expect(suggestQuantity(mozzarella({ pack: null }))?.qtyBaseUnit).toBe("6100.000");
  });
});

describe("order text", () => {
  it("lists packs and amounts, then the notes", () => {
    expect(
      orderText(
        "Pizzeria Demo",
        "Caseificio Rossi",
        [
          { name: "Mozzarella", baseUnit: "g", qtyBaseUnit: "7000", packCount: "7", packLabel: "Bag 1 kg" },
          { name: "Basil", baseUnit: "g", qtyBaseUnit: "300", packCount: null, packLabel: null },
        ],
        "Deliver before 10:00, please.",
      ),
    ).toBe(
      "Order from Pizzeria Demo for Caseificio Rossi\n\n- Mozzarella: 7 × Bag 1 kg (7,000 g)\n- Basil: 300 g\n\nDeliver before 10:00, please.",
    );
  });
});
