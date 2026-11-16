import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  baseToPacks,
  costPerBaseUnit,
  formatMoney,
  formatNumber,
  formatQty,
  formatUnitCost,
  fromBaseUnits,
  packsToBase,
  parseQuantityInput,
  toBaseUnits,
  toDbMoney,
  toDbQty,
  toDbUnitCost,
  toDecimal,
  valueOf,
} from "@/lib/units";

describe("pack conversion", () => {
  it("converts the SPEC examples", () => {
    // "2 x case 12x1 L": a case is 12,000 ml.
    expect(packsToBase("2", "12000.000").toString()).toBe("24000");
    // Delivery of 5 x 1 kg bags of mozzarella.
    expect(packsToBase("5", "1000").toString()).toBe("5000");
  });

  it("handles fractional packs exactly", () => {
    expect(packsToBase("0.5", "12000").toString()).toBe("6000");
    expect(packsToBase("0.1", "0.3").toString()).toBe("0.03");
    expect(packsToBase("1.5", "700").toString()).toBe("1050");
  });

  it("converts base units back to packs", () => {
    expect(baseToPacks("24000", "12000").toString()).toBe("2");
    expect(baseToPacks("1900", "1000").toString()).toBe("1.9");
  });

  it("refuses a pack size of zero or less", () => {
    expect(() => baseToPacks("100", "0")).toThrow();
    expect(() => baseToPacks("100", "-5")).toThrow();
  });
});

describe("display units", () => {
  it("converts kg, cl and l to base units", () => {
    expect(toBaseUnits("2.6", "kg", "g").toString()).toBe("2600");
    expect(toBaseUnits("70", "cl", "ml").toString()).toBe("700");
    expect(toBaseUnits("1.5", "l", "ml").toString()).toBe("1500");
    expect(toBaseUnits("3", "unit", "unit").toString()).toBe("3");
  });

  it("converts base units to display units", () => {
    expect(fromBaseUnits("2600.000", "kg", "g").toString()).toBe("2.6");
    expect(fromBaseUnits("750", "l", "ml").toString()).toBe("0.75");
  });

  it("refuses units that do not belong to the base unit", () => {
    expect(() => toBaseUnits("1", "kg", "ml")).toThrow();
    expect(() => toBaseUnits("1", "l", "unit")).toThrow();
  });
});

describe("costs and values", () => {
  it("computes cost per base unit: EUR 8 per kg is 0.008 per g", () => {
    expect(costPerBaseUnit("8", "1000").toString()).toBe("0.008");
    expect(toDbUnitCost(costPerBaseUnit("8", "1000"))).toBe("0.008000");
  });

  it("values the worked example: -500 g of mozzarella is -EUR 4.00", () => {
    expect(toDbMoney(valueOf("-500", "0.008000"))).toBe("-4.00");
  });

  it("refuses a cost for a quantity of zero", () => {
    expect(() => costPerBaseUnit("8", "0")).toThrow();
  });
});

describe("exactness", () => {
  it("does not pick up float errors", () => {
    expect(toDecimal("0.1").plus("0.2").toString()).toBe("0.3");
    expect(packsToBase("3", "0.1").toString()).toBe("0.3");
  });

  it("rejects values that are not finite numbers", () => {
    expect(() => toDecimal("abc")).toThrow();
    expect(() => toDecimal(new Decimal(Infinity))).toThrow();
    expect(() => toDecimal("NaN")).toThrow();
  });

  it("rounds half up to the database scale", () => {
    expect(toDbQty("1.0005")).toBe("1.001");
    expect(toDbQty("1.0004")).toBe("1.000");
    expect(toDbQty("2600")).toBe("2600.000");
    expect(toDbMoney("3.995")).toBe("4.00");
    expect(toDbMoney("-3.995")).toBe("-4.00");
  });
});

describe("parsing typed quantities", () => {
  it("accepts dots, commas and spaces", () => {
    expect(parseQuantityInput("1.5")?.toString()).toBe("1.5");
    expect(parseQuantityInput("1,5")?.toString()).toBe("1.5");
    expect(parseQuantityInput(" 12 ")?.toString()).toBe("12");
    expect(parseQuantityInput("2 600")?.toString()).toBe("2600");
    expect(parseQuantityInput(".5")?.toString()).toBe("0.5");
    expect(parseQuantityInput("-3")?.toString()).toBe("-3");
  });

  it("returns null for anything else", () => {
    for (const input of ["", "abc", "1.2.3", "1e5", "--1", "12g", "Infinity"]) {
      expect(parseQuantityInput(input)).toBeNull();
    }
  });
});

describe("formatting", () => {
  it("formats quantities in base units", () => {
    expect(formatQty("2600.000", "g")).toBe("2,600 g");
    expect(formatQty("750.500", "ml")).toBe("750.5 ml");
    expect(formatQty("1", "unit")).toBe("1 unit");
    expect(formatQty("12", "unit")).toBe("12 units");
    expect(formatQty("-500", "g")).toBe("−500 g");
  });

  it("formats numbers without float artefacts", () => {
    expect(formatNumber("1234567.891")).toBe("1,234,567.891");
    expect(formatNumber("0.300")).toBe("0.3");
    expect(formatNumber("1000")).toBe("1,000");
  });

  it("formats money and unit costs", () => {
    expect(formatMoney("4")).toBe("€4.00");
    expect(formatMoney("-4")).toBe("−€4.00");
    expect(formatMoney("1234.5")).toBe("€1,234.50");
    expect(formatMoney("-0.001")).toBe("€0.00");
    expect(formatUnitCost("0.008000", "g")).toBe("€8.00 per kg");
    expect(formatUnitCost("0.012500", "ml")).toBe("€12.50 per l");
    expect(formatUnitCost("0.35", "unit")).toBe("€0.35 per unit");
  });
});
