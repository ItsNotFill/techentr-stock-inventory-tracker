import { describe, expect, it } from "vitest";
import { REDIRECT_TARGETS, safeRedirectPath } from "@/lib/auth/safe-redirect";

const origin = "https://app.example.com";

describe("safeRedirectPath", () => {
  it("keeps the screens the app's own links lead to", () => {
    expect(safeRedirectPath("/onboarding")).toBe("/onboarding");
    expect(safeRedirectPath("/set-password")).toBe("/set-password");
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
  });

  it("falls back when there is nothing to go to", () => {
    expect(safeRedirectPath(null)).toBe("/dashboard");
    expect(safeRedirectPath("")).toBe("/dashboard");
    expect(safeRedirectPath(undefined, "/onboarding")).toBe("/onboarding");
  });

  it("ignores everything else, including every way of leaving the site", () => {
    const attacks = [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com", // browsers drop the tab: //evil.com
      "/\n/evil.com",
      "/\r/evil.com",
      "\t//evil.com",
      " /dashboard",
      "/dashboard ",
      "/ /evil.com",
      "javascript:alert(1)",
      "evil.com",
      "/@evil.com:80",
      "/path#fragment",
      // Dot segments normalise to //evil.com
      "/..//evil.com",
      "/.//evil.com",
      "/a/..//evil.com",
      "/%2e%2e//evil.com",
      "/%2e//evil.com",
      "/%2F%2Fevil.com",
      "/%09/evil.com",
      "/dashboard/..//evil.com",
      "/dashboard?next=//evil.com",
      "/dashboard//evil.com",
      "/DASHBOARD",
      "/ingredients",
    ];
    for (const attack of attacks) {
      expect(safeRedirectPath(attack), JSON.stringify(attack)).toBe("/dashboard");
    }
  });

  it("only ever returns a path that stays on the site", () => {
    for (const target of REDIRECT_TARGETS) {
      const resolved = new URL(target, origin);
      expect(resolved.origin).toBe(origin);
      expect(resolved.pathname).toBe(target);
    }
  });
});
