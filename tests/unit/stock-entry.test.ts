import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { parseDateTimeInput, toDateTimeInput, zonedTimeToUtc } from "@/lib/imports/time";
import { checkMovement, enteredTimeProblem, LedgerError } from "@/lib/ledger/movements";
import { EntryError, resolveEntry } from "@/lib/units/entry";
import { deliveryInputSchema } from "@/lib/validation/stock-entry";

const mozzarella = { id: "11111111-1111-4111-8111-111111111111", baseUnit: "g" as const };
const milk = { id: "22222222-2222-4222-8222-222222222222", baseUnit: "ml" as const };
const packs = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ingredientId: mozzarella.id, label: "Bag 1 kg", qtyInBaseUnit: "1000.000" },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", ingredientId: milk.id, label: "Crate 12×1 L", qtyInBaseUnit: "12000.000" },
];

describe("resolveEntry", () => {
  it("converts the worked example's 5 bags of 1 kg to 5,000 g", () => {
    expect(resolveEntry(mozzarella, packs, new Decimal(5), `pack:${packs[0].id}`)).toEqual({
      qtyBase: "5000.000",
      packSizeId: packs[0].id,
      packCount: "5.000",
    });
  });

  it("converts display units without floats", () => {
    expect(resolveEntry(mozzarella, packs, new Decimal("2.6"), "kg").qtyBase).toBe("2600.000");
    expect(resolveEntry(milk, packs, new Decimal("0.1"), "l").qtyBase).toBe("100.000");
    expect(resolveEntry(milk, packs, new Decimal("33"), "cl")).toEqual({ qtyBase: "330.000", packSizeId: null, packCount: null });
    expect(resolveEntry(milk, packs, new Decimal("1.5"), `pack:${packs[1].id}`).qtyBase).toBe("18000.000");
  });

  it("refuses a unit or pack of another ingredient, and numbers too large to store", () => {
    expect(() => resolveEntry(mozzarella, packs, new Decimal(1), "l")).toThrow(EntryError);
    expect(() => resolveEntry(mozzarella, packs, new Decimal(1), `pack:${packs[1].id}`)).toThrow("no longer exists");
    expect(() => resolveEntry(mozzarella, packs, new Decimal(1), "pack:nope")).toThrow("no longer exists");
    expect(() => resolveEntry(mozzarella, packs, new Decimal("1e12"), "kg")).toThrow("too large");
  });
});

describe("enteredTimeProblem", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  it("accepts now and the recent past", () => {
    expect(enteredTimeProblem(now, 31, now)).toBeNull();
    expect(enteredTimeProblem(new Date("2026-11-18T12:00:30Z"), 31, now)).toBeNull();
    expect(enteredTimeProblem(new Date("2026-10-19T12:00:00Z"), 31, now)).toBeNull();
  });
  it("refuses the future, the distant past and invalid dates", () => {
    expect(enteredTimeProblem(new Date("2026-11-18T12:02:00Z"), 31, now)).toContain("future");
    expect(enteredTimeProblem(new Date("2026-10-17T12:00:00Z"), 31, now)).toContain("31 days");
    expect(enteredTimeProblem(new Date("nope"), 31, now)).toContain("valid");
  });
});

describe("datetime-local values", () => {
  it("parses a value and reads it in the restaurant's timezone", () => {
    const local = parseDateTimeInput("2026-11-16T10:00");
    expect(local).toEqual({ year: 2026, month: 11, day: 16, hour: 10, minute: 0, second: 0 });
    expect(zonedTimeToUtc(local!, "Europe/Amsterdam").toISOString()).toBe("2026-11-16T09:00:00.000Z");
    expect(parseDateTimeInput("2026-11-16T10:00:15")?.second).toBe(15);
  });
  it("refuses what is not a real date and time", () => {
    for (const value of ["", "2026-02-30T10:00", "2026-11-16 10:00", "2026-11-16T25:00", "16/11/2026"]) {
      expect(parseDateTimeInput(value)).toBeNull();
    }
  });
  it("writes an instant back as a value in a timezone", () => {
    expect(toDateTimeInput(new Date("2026-11-16T09:00:00Z"), "Europe/Amsterdam")).toBe("2026-11-16T10:00");
    expect(toDateTimeInput(new Date("2026-07-01T23:30:00Z"), "Europe/Amsterdam")).toBe("2026-07-02T01:30");
  });
});

describe("ledger references for deliveries and waste", () => {
  const base = { ingredientId: mozzarella.id, occurredAt: new Date(), createdBy: null };
  it("lets a delivery point at its delivery line, or (seeded stock) at nothing", () => {
    const refId = "33333333-3333-4333-8333-333333333333";
    expect(checkMovement({ ...base, type: "delivery", qtyDelta: "5000", refTable: "delivery_lines", refId }).refTable).toBe("delivery_lines");
    expect(checkMovement({ ...base, type: "delivery", qtyDelta: "5000" }).qtyDelta).toBe("5000.000");
    expect(() => checkMovement({ ...base, type: "delivery", qtyDelta: "5000", refTable: "count_lines", refId })).toThrow(LedgerError);
    expect(() =>
      checkMovement({ ...base, type: "waste", qtyDelta: "-200", wasteReason: "dropped", refTable: "delivery_lines", refId }),
    ).toThrow("points at nothing");
  });
});

describe("deliveryInputSchema", () => {
  const valid = {
    clientId: "44444444-4444-4444-8444-444444444444",
    supplierName: "  ",
    deliveredAt: "",
    lines: [{ ingredientId: mozzarella.id, amount: " 5 ", unit: `pack:${packs[0].id}` }],
  };
  it("trims and empties optional text", () => {
    const parsed = deliveryInputSchema.parse(valid);
    expect(parsed.supplierName).toBeNull();
    expect(parsed.lines[0].amount).toBe("5");
  });
  it("names the field that is wrong", () => {
    const result = deliveryInputSchema.safeParse({ ...valid, lines: [{ ...valid.lines[0], amount: "" }] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["lines", 0, "amount"]);
    expect(deliveryInputSchema.safeParse({ ...valid, lines: [] }).error?.issues[0].message).toBe("Add at least one item.");
  });
});
