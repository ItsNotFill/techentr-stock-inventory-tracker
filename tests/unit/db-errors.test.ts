import { describe, expect, it } from "vitest";
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/db/errors";

describe("postgres error helpers", () => {
  it("finds the code on the error or on its cause, as Drizzle wraps it", () => {
    const driverError = Object.assign(new Error("duplicate key value"), { code: "23505" });
    expect(isUniqueViolation(driverError)).toBe(true);
    expect(isUniqueViolation(new Error("Failed query", { cause: driverError }))).toBe(true);
    expect(isForeignKeyViolation(new Error("Failed query", { cause: Object.assign(new Error("fk"), { code: "23503" }) }))).toBe(true);
  });

  it("ignores everything else", () => {
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation(Object.assign(new Error("fk"), { code: "23503" }))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
    expect(isUniqueViolation({ code: "ECONNRESET" })).toBe(false);
  });
});
