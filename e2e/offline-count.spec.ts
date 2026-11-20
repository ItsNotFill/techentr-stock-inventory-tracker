import { spawn, type ChildProcess } from "node:child_process";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { runAsUser } from "../lib/db/rls";
import { countLines, countSessions } from "../lib/db/schema";
import { addPackSize, createIngredient } from "../lib/ingredients";
import { appendMovements } from "../lib/ledger";
import { ingredientFormSchema, packSizeFormSchema } from "../lib/validation/ingredients";
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
 * The airplane-mode test: a count carried out with no signal (DECISIONS.md 94).
 * Staff on a phone open a count online, lose the signal in the walk-in fridge,
 * type figures, reload the page, tap Submit, and get signal back. The count
 * must reach the server with the time of the tap, not the time of the sync.
 *
 * Runs against a PRODUCTION build and starts and stops its own `next start`:
 * stopping the server is how it takes the signal away, because Playwright's
 * setOffline() blocks requests before the service worker can answer them,
 * which a phone without signal never does (see pwa.spec.ts).
 *
 *   npm run build
 *   E2E_PWA=1 node --env-file=.env.local node_modules/.bin/playwright test offline-count
 */

test.skip(!process.env.E2E_PWA, "Needs a production build: run npm run build, then set E2E_PWA=1");
test.describe.configure({ mode: "serial", timeout: 240_000 });

const PORT = Number(process.env.E2E_OFFLINE_PORT ?? 3270);
const BASE = `http://localhost:${PORT}`;
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

const shown = (locator: Locator) => locator.filter({ visible: true }).first();

let server: ChildProcess | null = null;

async function isUp(): Promise<boolean> {
  try {
    return (await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(2_000) })).ok;
  } catch {
    return false;
  }
}

/** Starts `next start` (it inherits this process's environment) and waits until it answers. */
async function startServer() {
  server = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { detached: true, stdio: "ignore" });
  for (let attempt = 0; attempt < 120; attempt += 1) {
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
let mozzarellaId: string;
let basilId: string;

const ingredient = (name: string, cost: string) =>
  ingredientFormSchema.parse({
    name,
    baseUnit: "g",
    costAmount: cost,
    costUnit: "kg",
    reorderPoint: "",
    parLevel: "",
    levelUnit: "kg",
    category: "",
    storageArea: "Walk-in fridge",
  });

test.beforeAll(async () => {
  if (await isUp()) throw new Error(`Port ${PORT} is in use: stop that server first, this spec runs its own.`);
  await startServer();
  testDb = createTestDb();
  [owner, staff] = await Promise.all([createTestUser("e2e-offline-owner"), createTestUser("e2e-offline-staff")]);
  restaurant = await createTestRestaurant(testDb.db, owner, "E2E Offline Count");
  await addTestMember(testDb.db, restaurant, staff, "staff");
  await runAsUser(testDb.db, owner.id, async (tx) => {
    mozzarellaId = await createIngredient(tx, restaurant.locationId, ingredient("Mozzarella", "8"));
    basilId = await createIngredient(tx, restaurant.locationId, ingredient("Basil", "25"));
    await addPackSize(tx, restaurant.locationId, mozzarellaId, packSizeFormSchema.parse({ label: "Bag 1 kg", amount: "1", unit: "kg", isDefault: true }));
    const yesterday = new Date(Date.now() - 24 * 3_600_000);
    await appendMovements(tx, restaurant.locationId, [
      { ingredientId: mozzarellaId, qtyDelta: "3000", type: "count_adjust", occurredAt: yesterday, createdBy: owner.id },
      { ingredientId: basilId, qtyDelta: "500", type: "count_adjust", occurredAt: yesterday, createdBy: owner.id },
    ]);
  });
});

test.afterAll(async () => {
  if (server) await stopServer();
  await deleteTestRestaurants(testDb.db, [restaurant]);
  await Promise.all([owner, staff].map(deleteTestUser));
  await testDb.close();
});

/** Copied from pwa.spec.ts: the worker controls the page and has precached the offline screen. */
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
  await page.waitForTimeout(1_000);
}

async function cachedPaths(page: Page, cacheName: string): Promise<string[]> {
  return page.evaluate(async (name) => {
    if (!(await caches.has(name))) return [];
    const cache = await caches.open(name);
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  }, cacheName);
}

test("a count typed and submitted with no signal reaches the server, with the phone's time of the tap", async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();

  await test.step("log in and wait for the worker", async () => {
    await page.goto(`${BASE}/login`);
    await waitForServiceWorker(page);
    await page.getByRole("textbox", { name: "E-mail", exact: true }).fill(staff.email);
    await page.getByRole("textbox", { name: "Password", exact: true }).fill(staff.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("**/dashboard");
  });

  let sheetPath = "";
  await test.step("start a count online: the sheet opens and the worker keeps a copy", async () => {
    await page.goto(`${BASE}/count`);
    await shown(page.getByRole("button", { name: "Start a count" })).click();
    await expect(page).toHaveURL(/\/count\/[0-9a-f-]{36}$/);
    sheetPath = new URL(page.url()).pathname;
    await expect(page.getByRole("textbox", { name: "Mozzarella", exact: true })).toBeVisible();
    await expect.poll(() => cachedPaths(page, "pages"), { timeout: 20_000 }).toContain(sheetPath);
  });

  const stoppedAt = new Date();
  await test.step("the signal goes: figures are typed and kept on the phone", async () => {
    await stopServer();
    // Typed by the phone: Mozzarella 1,9 kg (unit: kg), Basil 0.2 kg.
    await page.getByRole("combobox", { name: "Unit for Mozzarella" }).click();
    await page.getByRole("option", { name: "kg", exact: true }).click();
    const mozzarella = page.getByRole("textbox", { name: "Mozzarella", exact: true });
    await mozzarella.fill("1,9");
    await mozzarella.blur();
    await page.getByRole("combobox", { name: "Unit for Basil" }).click();
    await page.getByRole("option", { name: "kg", exact: true }).click();
    const basil = page.getByRole("textbox", { name: "Basil", exact: true });
    await basil.fill("0.2");
    await basil.blur();

    await expect(page.getByRole("status").getByText("No connection · 2 figures kept on this phone")).toBeVisible();
    await expect(page.getByText("Kept on this phone", { exact: true })).toHaveCount(2);
    // Optional: look at the state (OFFLINE_SHOTS=<folder>).
    if (process.env.OFFLINE_SHOTS) await page.screenshot({ path: `${process.env.OFFLINE_SHOTS}/no-connection.png` });
  });

  await test.step("reload with no signal: the page opens from the phone's copy and the figures are back", async () => {
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Mozzarella", exact: true })).toHaveValue("1,9");
    await expect(page.getByRole("textbox", { name: "Basil", exact: true })).toHaveValue("0.2");
    await expect(page.getByRole("status").getByText("No connection · 2 figures kept on this phone")).toBeVisible();
  });

  await test.step("Submit count with no signal: it waits", async () => {
    await page.getByRole("button", { name: "Submit count" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Submit count" }).click();
    await expect(page.getByRole("status").getByText("Submit waiting for signal")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${sheetPath}$`));
  });

  await test.step("signal returns: the count is submitted and the page goes back to the list", async () => {
    await page.waitForTimeout(1_000);
    await startServer();
    const startedAt = new Date();
    // What the phone does when it finds signal again. The timer would also get there, but it backs off up to a minute.
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page).toHaveURL(`${BASE}/count`, { timeout: 60_000 });

    const [session] = await testDb.db.select().from(countSessions).where(eq(countSessions.locationId, restaurant.locationId));
    expect(session.status).toBe("submitted");
    const lines = await testDb.db.select().from(countLines).where(eq(countLines.sessionId, session.id));
    const byIngredient = Object.fromEntries(lines.map((line) => [line.ingredientId, Number(line.countedQty)]));
    expect(byIngredient).toEqual({ [mozzarellaId]: 1900, [basilId]: 200 });

    // The count time is the tap, made while the server was down: not the moment of the sync.
    const submittedAt = session.submittedAt!;
    expect(submittedAt.getTime()).toBeGreaterThanOrEqual(stoppedAt.getTime());
    expect(submittedAt.getTime()).toBeLessThanOrEqual(startedAt.getTime());
  });

  await context.close();
});
