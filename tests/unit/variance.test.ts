import { describe, expect, it } from "vitest";
import { totalUnexplainedValue, unexplainedQty, unexplainedValue } from "@/lib/variance/math";

describe("unexplained usage", () => {
  it("gives the SPEC worked example: counted 1,900 g against 2,400 g is -500 g and -EUR 4.00", () => {
    const line = { countedQty: "1900.000", theoreticalQty: "2400.000", lateAdjustQty: "0.000", unitCost: "0.008000" };
    expect(unexplainedQty(line)).toBe("-500.000");
    expect(unexplainedValue(line)).toBe("-4.00");
  });

  it("includes late corrections: 5 late Margherita turn -500 g into +100 g", () => {
    const line = { countedQty: "1900.000", theoreticalQty: "2400.000", lateAdjustQty: "-600.000", unitCost: "0.008000" };
    expect(unexplainedQty(line)).toBe("100.000");
    expect(unexplainedValue(line)).toBe("0.80");
  });

  it("is zero when the count matches, and positive when there is more than expected", () => {
    expect(unexplainedQty({ countedQty: "12", theoreticalQty: "12", lateAdjustQty: "0" })).toBe("0.000");
    expect(unexplainedValue({ countedQty: "750", theoreticalQty: "700", lateAdjustQty: "0", unitCost: "0.006" })).toBe("0.30");
  });

  it("has no figure before there is a theoretical stock or a cost", () => {
    expect(unexplainedQty({ countedQty: "5", theoreticalQty: null, lateAdjustQty: "0" })).toBeNull();
    expect(unexplainedValue({ countedQty: "5", theoreticalQty: "4", lateAdjustQty: "0", unitCost: null })).toBeNull();
  });

  it("is exact and rounds euros half away from zero", () => {
    expect(unexplainedValue({ countedQty: "0.3", theoreticalQty: "0.1", lateAdjustQty: "0.2", unitCost: "1" })).toBe("0.00");
    expect(unexplainedValue({ countedQty: "0", theoreticalQty: "1", lateAdjustQty: "0", unitCost: "0.005" })).toBe("-0.01");
  });

  it("leaves opening counts out of the total", () => {
    const total = totalUnexplainedValue([
      { countedQty: "1900", theoreticalQty: "2400", lateAdjustQty: "0", unitCost: "0.008", isOpening: false },
      { countedQty: "2000", theoreticalQty: "0", lateAdjustQty: "0", unitCost: "0.008", isOpening: true },
      { countedQty: "11", theoreticalQty: "12", lateAdjustQty: "0", unitCost: "0.6", isOpening: false },
    ]);
    expect(total).toBe("-4.60");
  });
});
