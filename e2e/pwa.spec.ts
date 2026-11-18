import { spawn, type ChildProcess } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { runAsUser } from "../lib/db/rls";
import { createIngredient } from "../lib/ingredients";
import { ingredientFormSchema } from "../lib/validation/ingredients";
import {
  addTestMember,
  createTestDb,
  createTestRestaurant,
  createTestUser,
  deleteTestRestaurants,
  deleteTestUser,
  type TestDb,
  type TestRestaurant,
  type TestUser,
} from "../tests/helpers/db";

/**
 * The installable app against a PRODUCTION build: the service worker is only
 * registered there (components/pwa/service-worker-registration.tsx). This spec
 * starts and stops its own `next start`, because stopping the server is how it
 * takes the signal away: Playwright's setOffline() blocks requests before the
 * service worker can answer them, which a phone without signal never does.
 *
 *   npm run build
 *   E2E_PWA=1 E2E_BASE_URL=http://localhost:3220 npx playwright test pwa
 *
 * Checks the manifest and icons, that the app shell opens with no signal
 * (a screen opened before, and the offline screen for one never opened), and
 * that logging out removes the offline copies.
 */

test.skip(!process.env.E2E_PWA, "Needs a production build: run npm run build, then set E2E_PWA=1 and E2E_BASE_URL");
test.describe.configure({ mode: "serial", timeout: 180_000 });

const PORT = 3220;
const BASE = `http://localhost:${PORT}`;
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

let server: ChildProcess | null = null;

async function isUp(): Promise<boolean> {
  try {
    return (await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(2_000) })).ok;
  } catch {
    return false;
  }
}

/** Starts `next start` (it reads .env.local itself) and waits until it answers. */
async function startServer() {
  server = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { detached: true, stdio: "ignore" });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await isUp()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("next start did not come up");
}

/** Stops the server: from now on the phone has "no signal". */
async function stopServer() {
  // SIGKILL: a graceful stop waits for the browser's open connections, and losing signal is not graceful either.
  if (server?.pid) process.kill(-server.pid, "SIGKILL");
  server = null;
  for (let attempt = 0; attempt < 40 && (await isUp()); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  expect(await isUp(), "the server should be down").toBe(false);
}

let testDb: TestDb;
let owner: TestUser;
let staff: TestUser;
let restaurant: TestRestaurant;

test.beforeAll(async () => {
  if (await isUp()) throw new Error(`Port ${PORT} is in use: stop that server first, this spec runs its own.`);
  await startServer();
  testDb = createTestDb();
  [owner, staff] = await Promise.all([createTestUser("e2e-pwa-owner"), createTestUser("e2e-pwa-staff")]);
  restaurant = await createTestRestaurant(testDb.db, owner, "E2E PWA");
  await addTestMember(testDb.db, restaurant, staff, "staff");
  await runAsUser(testDb.db, owner.id, (tx) =>
    createIngredient(
      tx,
      restaurant.locationId,
      ingredientFormSchema.parse({
        name: "Mozzarella",
        baseUnit: "g",
        costAmount: "8",
        costUnit: "kg",
        reorderPoint: "",
        parLevel: "",
        levelUnit: "kg",
        category: "",
        storageArea: "",
      }),
    ),
  );
});

test.afterAll(async () => {
  if (server) await stopServer();
  await deleteTestRestaurants(testDb.db, [restaurant]);
  await Promise.all([owner, staff].map(deleteTestUser));
  await testDb.close();
});

/**
 * Waits until the service worker controls the page AND has precached the
 * offline screen. "Active and controlling" alone is not enough: right after
 * activation the first navigations can still miss it.
 */
async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(
    async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.active?.state !== "activated" || !navigator.serviceWorker.controller) return false;
      for (const name of await caches.keys()) {
        if (!name.includes("precache")) continue;
        if ((await (await caches.open(name)).keys()).some((request) => request.url.includes("/~offline"))) return true;
      }
      return false;
    },
    undefined,
    { timeout: 30_000, polling: 250 },
  );
  // Chromium routes navigations through a worker that has just activated only after a moment.
  await page.waitForTimeout(1_000);
}

async function cachedPaths(page: Page, cacheName: string): Promise<string[]> {
  return page.evaluate(async (name) => {
    if (!(await caches.has(name))) return [];
    const cache = await caches.open(name);
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  }, cacheName);
}

test("the manifest and its icons are served", async ({ request }) => {
  const response = await request.get(`${BASE}/manifest.webmanifest`);
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: expect.any(String) });
  const sizes = (manifest.icons as { sizes: string; src: string }[]).map((icon) => icon.sizes);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(`${BASE}${icon.src}`)).ok(), icon.src).toBe(true);
  }
  const worker = await request.get(`${BASE}/sw.js`);
  expect(worker.ok()).toBe(true);
  expect(worker.headers()["content-type"]).toContain("javascript");
});

test("Chrome finds nothing that stops the app from being installed", async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await waitForServiceWorker(page);
  // What Chrome checks before it offers "Install app" / "Add to Home screen".
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  expect(installabilityErrors).toEqual([]);
  await context.close();
});

test("the app shell opens offline and logging out removes the offline copies", async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();

  // Signed out: the worker installs on the login page.
  await page.goto(`${BASE}/login`);
  await waitForServiceWorker(page);

  // A screen this phone never opened, with no signal: the offline screen.
  await stopServer();
  await page.goto(`${BASE}/count`);
  await expect(page.getByRole("heading", { name: "No connection" })).toBeVisible();
  await startServer();

  // Log in as staff and open the delivery screen once.
  await page.goto(`${BASE}/login`);
  await page.getByLabel("E-mail").fill(staff.email);
  await page.getByLabel("Password").fill(staff.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/dashboard");
  await page.goto(`${BASE}/deliveries`);
  await expect(page.getByRole("heading", { name: "Log delivery" })).toBeVisible();
  await expect.poll(() => cachedPaths(page, "pages")).toContain("/deliveries");

  // No signal: the delivery screen still opens, from this phone's copy, and its form works.
  await stopServer();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Log delivery" })).toBeVisible();
  await page.getByLabel("Ingredient").filter({ visible: true }).first().selectOption({ label: "Mozzarella" });
  await expect(page.getByLabel("Unit").filter({ visible: true }).first()).toBeEnabled();
  await startServer();

  // Log out: the login page removes the copies, so the next person cannot open them offline.
  await page.goto(`${BASE}/dashboard`);
  await page.getByRole("button", { name: "Log out" }).filter({ visible: true }).first().click();
  await page.waitForURL("**/login");
  await expect.poll(() => cachedPaths(page, "pages")).not.toContain("/deliveries");

  await context.close();
});
