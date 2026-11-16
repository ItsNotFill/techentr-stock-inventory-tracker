import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";

const origin = "https://app.example.com";

describe("safeRedirectPath", () => {
  it("keeps paths on this site", () => {
    expect(safeRedirectPath("/onboarding", origin)).toBe("/onboarding");
    expect(safeRedirectPath("/set-password", origin)).toBe("/set-password");
    expect(safeRedirectPath("/ingredients?archived=1", origin)).toBe("/ingredients?archived=1");
  });

  it("falls back when there is nothing to go to", () => {
    expect(safeRedirectPath(null, origin)).toBe("/dashboard");
    expect(safeRedirectPath("", origin)).toBe("/dashboard");
    expect(safeRedirectPath(undefined, origin, "/login")).toBe("/login");
  });

  it("refuses every way of leaving the site", () => {
    const attacks = [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com", // browsers drop the tab: //evil.com
      "/\n/evil.com",
      "/\r/evil.com",
      "\t//evil.com",
      " /dashboard",
      "/ /evil.com",
      "javascript:alert(1)",
      "evil.com",
      "/@evil.com:80",
      "/path#fragment",
    ];
    for (const attack of attacks) {
      const result = safeRedirectPath(attack, origin);
      expect(result, JSON.stringify(attack)).toBe("/dashboard");
      expect(new URL(result, origin).origin).toBe(origin);
    }
  });

  it("never returns something that resolves to another origin", () => {
    for (const next of ["/%2F%2Fevil.com", "/..%2F..%2Fevil.com", "/a/../../b", "/%09/evil.com"]) {
      expect(new URL(safeRedirectPath(next, origin), origin).origin).toBe(origin);
    }
  });
});
