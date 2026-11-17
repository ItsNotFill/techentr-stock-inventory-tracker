import { describe, expect, it } from "vitest";
import { amountTone } from "@/components/amount-tone";
import { amountTone as reExported } from "@/components/unexplained-usage/tone";

describe("amountTone", () => {
  it("colours a negative amount red and leaves a positive one plain", () => {
    expect(amountTone("-4.00")).toBe("text-destructive");
    expect(amountTone("-0.001")).toBe("text-destructive");
    expect(amountTone("12.50")).toBe("text-foreground");
  });

  it("mutes zero at normal weight, whatever its spelling", () => {
    for (const zero of ["0", "0.00", "0.000", "-0", "-0.00"]) {
      expect(amountTone(zero)).toBe("text-muted-foreground font-normal");
    }
  });

  it("adds emphasis to non-zero amounts only", () => {
    expect(amountTone("-4.00", { emphasis: true })).toBe("text-destructive font-semibold");
    expect(amountTone("4.00", { emphasis: true })).toBe("text-foreground font-semibold");
    expect(amountTone("0.00", { emphasis: true })).toBe("text-muted-foreground font-normal");
  });

  it("rejects what is not a number", () => {
    expect(() => amountTone("abc")).toThrow();
  });

  it("is still exported from the old unexplained-usage path", () => {
    expect(reExported).toBe(amountTone);
  });
});
