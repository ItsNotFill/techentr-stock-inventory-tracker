import { describe, expect, it } from "vitest";
import { checkMovement, depletionDelta, LedgerError, roundQty, sumDeltas, type NewMovement } from "@/lib/ledger/movements";

const at = new Date("2026-11-16T19:30:00Z");
const base: NewMovement = {
  ingredientId: "00000000-0000-4000-8000-000000000001",
  qtyDelta: "-120",
  type: "sale",
  refTable: "sale_lines",
  refId: "00000000-0000-4000-8000-000000000002",
  occurredAt: at,
  createdBy: null,
};

describe("depletion maths", () => {
  it("matches the SPEC worked example", () => {
    // 30 Margherita at 120 g, 10 Quattro Formaggi at 80 g.
    expect(depletionDelta("30", "120.000")).toBe("-3600.000");
    expect(depletionDelta("10", "80.000")).toBe("-800.000");
    // Opening 2,000 g + delivery 5,000 g - 3,600 g - 800 g = 2,600 g.
    expect(sumDeltas(["2000", "5000", depletionDelta("30", "120"), depletionDelta("10", "80")])).toBe("2600.000");
  });

  it("turns a refund into a positive movement", () => {
    expect(depletionDelta("-1", "120")).toBe("120.000");
    expect(sumDeltas([depletionDelta("3", "120"), depletionDelta("-1", "120")])).toBe("-240.000");
  });

  it("is exact with fractions and rounds half away from zero at three decimals", () => {
    expect(depletionDelta("0.5", "0.25")).toBe("-0.125");
    expect(depletionDelta("3", "0.1")).toBe("-0.300");
    expect(depletionDelta("0.5", "0.001")).toBe("-0.001"); // -0.0005 rounds away from zero
    expect(depletionDelta("-0.5", "0.001")).toBe("0.001");
    expect(depletionDelta("0.2", "0.001")).toBe("0.000"); // too small to move stock
    expect(roundQty("2.0005")).toBe("2.001");
    expect(roundQty("-2.0005")).toBe("-2.001");
  });

  it("sums without float error", () => {
    expect(sumDeltas(["0.1", "0.2"])).toBe("0.300");
    expect(sumDeltas([])).toBe("0.000");
    expect(sumDeltas(Array.from({ length: 1000 }, () => "0.001"))).toBe("1.000");
  });
});

describe("movement rules", () => {
  it("accepts well-formed movements and rounds the quantity for storage", () => {
    expect(checkMovement(base).qtyDelta).toBe("-120.000");
    expect(checkMovement({ ...base, type: "delivery", refTable: null, refId: null, qtyDelta: "5000" }).qtyDelta).toBe("5000.000");
    expect(
      checkMovement({ ...base, type: "waste", refTable: null, refId: null, qtyDelta: "-200", wasteReason: "dropped" })
        .wasteReason,
    ).toBe("dropped");
    expect(checkMovement({ ...base, type: "count_adjust", refTable: null, refId: null, qtyDelta: "-500" }).qtyDelta).toBe("-500.000");
    expect(checkMovement({ ...base, type: "count_adjust", refTable: null, refId: null, qtyDelta: "2000" }).qtyDelta).toBe("2000.000");
    // A refund is a positive sale movement.
    expect(checkMovement({ ...base, qtyDelta: "120" }).qtyDelta).toBe("120.000");
  });

  it("refuses movements that break the ledger's rules", () => {
    const bad: [Partial<NewMovement>, string][] = [
      [{ qtyDelta: "0" }, "cannot be zero"],
      [{ qtyDelta: "0.0004" }, "cannot be zero"],
      [{ refTable: null, refId: null }, "must point at its sale line"],
      [{ refId: null }, "both a table and an id"],
      [{ type: "delivery", refTable: null, refId: null, qtyDelta: "-5" }, "must be positive"],
      [{ type: "waste", refTable: null, refId: null, qtyDelta: "200", wasteReason: "dropped" }, "must be negative"],
      [{ type: "waste", refTable: null, refId: null, qtyDelta: "-200" }, "needs a reason"],
      [{ wasteReason: "expired" }, "Only waste movements"],
      [{ occurredAt: new Date("nope") }, "valid time"],
    ];
    for (const [change, message] of bad) {
      expect(() => checkMovement({ ...base, ...change }), message).toThrow(LedgerError);
      expect(() => checkMovement({ ...base, ...change })).toThrow(message);
    }
    expect(() => checkMovement({ ...base, qtyDelta: "abc" })).toThrow();
  });
});
