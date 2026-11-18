// @ts-check
// Builds the service worker (pwa/sw.ts) into public/sw.js after `next build`:
//   npm run build   ->   next build && serwist build serwist.config.mjs
// Serwist's "configurator mode": it reads the finished build, so it works with
// Turbopack and Cache Components (DECISIONS.md 87).
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { serwist } from "@serwist/next/config";

// Changes with every deploy, so the precached offline screen is refreshed.
const revision =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  randomUUID();

export default serwist({
  swSrc: "pwa/sw.ts",
  swDest: "public/sw.js",
  // Page shells are not precached: they would be served without asking the
  // server, so a signed-out phone would skip the login redirect and a
  // signed-in one would never get fresh figures. Screens are cached at run
  // time instead, network first (pwa/sw.ts).
  precachePrerendered: false,
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
});
