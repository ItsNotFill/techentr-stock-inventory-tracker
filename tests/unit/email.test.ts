import { describe, expect, it } from "vitest";
import { dayKey, isoWeekKey, lowStockSignature } from "@/lib/email/periods";
import { escapeHtml, lowStockEmail, weeklySummaryEmail, type WeeklySummaryData } from "@/lib/email/templates";

describe("e-mail periods", () => {
  it("names ISO weeks in the restaurant's timezone, across the turn of the year", () => {
    expect(isoWeekKey(new Date("2026-11-20T12:00:00Z"), "Europe/Amsterdam")).toBe("2026-W47");
    // Monday 29 December 2025 is in week 1 of 2026; Friday 1 January 2027 is in week 53 of 2026.
    expect(isoWeekKey(new Date("2025-12-29T12:00:00Z"), "Europe/Amsterdam")).toBe("2026-W01");
    expect(isoWeekKey(new Date("2027-01-01T12:00:00Z"), "Europe/Amsterdam")).toBe("2026-W53");
    // Sunday 23:30 in UTC is already Monday in Amsterdam: the next week.
    expect(isoWeekKey(new Date("2026-11-22T23:30:00Z"), "UTC")).toBe("2026-W47");
    expect(isoWeekKey(new Date("2026-11-22T23:30:00Z"), "Europe/Amsterdam")).toBe("2026-W48");
  });

  it("names days in the restaurant's timezone", () => {
    expect(dayKey(new Date("2026-11-20T23:30:00Z"), "Europe/Amsterdam")).toBe("2026-11-21");
    expect(dayKey(new Date("2026-11-20T23:30:00Z"), "America/New_York")).toBe("2026-11-20");
  });

  it("gives the same low-stock signature whatever the order", () => {
    expect(lowStockSignature(["b", "a", "c"])).toBe(lowStockSignature(["c", "b", "a"]));
    expect(lowStockSignature(["a"])).not.toBe(lowStockSignature(["a", "b"]));
  });
});

const week = (overrides: Partial<WeeklySummaryData> = {}): WeeklySummaryData => ({
  restaurantName: "Pizzeria Demo",
  periodLabel: "13 Nov – 20 Nov",
  appUrl: "https://example.com",
  countsApproved: 1,
  unexplainedValue: "-4.00",
  topLosses: [{ name: "Mozzarella", baseUnit: "g", differenceQty: "-500.000", differenceValue: "-4.00" }],
  lowStock: [{ name: "Mozzarella", baseUnit: "g", stock: "1900.000", reorderPoint: "2000.000" }],
  wasteValue: "1.60",
  wasteEntries: 1,
  deliveries: 2,
  countsWaiting: 1,
  needsRecipe: 0,
  ...overrides,
});

describe("the weekly owner summary", () => {
  it("leads with the week's unexplained usage and lists losses, stock and what waits", () => {
    const email = weeklySummaryEmail(week());
    expect(email.subject).toBe("Pizzeria Demo: −€4.00 unexplained usage this week");
    expect(email.text).toContain("Unexplained usage from 1 approved count: −€4.00.");
    expect(email.text).toContain("- Mozzarella: −€4.00 (−500 g)");
    expect(email.text).toContain("- Mozzarella: 1,900 g (reorder at 2,000 g)");
    expect(email.text).toContain("Waste logged: €1.60 in 1 entry. Deliveries logged: 2.");
    expect(email.text).toContain("- 1 count waits for approval");
    expect(email.html).toContain("https://example.com");
  });

  it("says so when there was no count, and when nothing is low", () => {
    const email = weeklySummaryEmail(week({ countsApproved: 0, unexplainedValue: "0.00", topLosses: [], lowStock: [], countsWaiting: 0 }));
    expect(email.subject).toBe("Pizzeria Demo: your week (13 Nov – 20 Nov)");
    expect(email.text).toContain("No count was approved this week");
    expect(email.text).toContain("Nothing is low on stock.");
    expect(email.text).not.toContain("Waiting for you");
  });

  it("escapes what people typed", () => {
    expect(escapeHtml(`<b>"Tom & Jerry's"</b>`)).toBe("&lt;b&gt;&quot;Tom &amp; Jerry&#39;s&quot;&lt;/b&gt;");
    const email = weeklySummaryEmail(week({ restaurantName: "<script>alert(1)</script>" }));
    expect(email.html).not.toContain("<script>");
  });
});

describe("the low-stock alert", () => {
  it("counts and lists what is low", () => {
    const email = lowStockEmail({
      restaurantName: "Pizzeria Demo",
      appUrl: "https://example.com",
      items: [
        { name: "Mozzarella", baseUnit: "g", stock: "1900", reorderPoint: "2000" },
        { name: "Pizza box", baseUnit: "unit", stock: "40", reorderPoint: "100" },
      ],
    });
    expect(email.subject).toBe("Pizzeria Demo: 2 ingredients are low");
    expect(email.text).toContain("- Pizza box: 40 units (reorder at 100 units)");
  });
});
