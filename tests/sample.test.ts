import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";

describe("test setup", () => {
  it("runs decimal maths exactly", () => {
    // 0.1 + 0.2 is 0.30000000000000004 with JS numbers; quantities must never use them.
    expect(new Decimal("0.1").plus("0.2").toString()).toBe("0.3");
  });
});
