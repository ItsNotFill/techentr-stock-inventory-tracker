import { describe, expect, it } from "vitest";
import {
  CountSync,
  INITIAL_SYNC_STATE,
  KEEP_DRAFTS_MS,
  memoryDraftStore,
  RETRY_DELAYS,
  type CountEntry,
  type CountSyncState,
  type SyncAnswer,
} from "@/lib/counts/offline";

const MOZZARELLA = "11111111-1111-4111-8111-111111111111";
const BASIL = "22222222-2222-4222-8222-222222222222";
const SESSION = "33333333-3333-4333-8333-333333333333";

/** A server that can be switched off, and that records what it received. */
function fakeServer() {
  const server = {
    reachable: true,
    saves: [] as CountEntry[][],
    submits: [] as { entries: CountEntry[]; approve: boolean; countedAt: string | null }[],
    answer: ((): SyncAnswer => ({ ok: true })) as (entries: CountEntry[]) => SyncAnswer,
    /** Held calls: resolve them by hand to test figures typed while a send is on its way. */
    hold: false,
    held: [] as (() => void)[],
    transport: {
      save: async (entries: CountEntry[]) => {
        if (server.hold) await new Promise<void>((resolve) => server.held.push(resolve));
        if (!server.reachable) throw new TypeError("Failed to fetch");
        server.saves.push(entries);
        return server.answer(entries);
      },
      submit: async (entries: CountEntry[], approve: boolean, countedAt: string | null) => {
        if (!server.reachable) throw new TypeError("Failed to fetch");
        server.submits.push({ entries, approve, countedAt });
        return server.answer(entries);
      },
    },
  };
  return server;
}

/** A timer driven by hand. */
function manualTimer() {
  const timer = {
    pending: [] as { fn: () => void; ms: number }[],
    set(fn: () => void, ms: number) {
      const handle = { fn, ms };
      timer.pending.push(handle);
      return handle;
    },
    clear(handle: unknown) {
      timer.pending = timer.pending.filter((candidate) => candidate !== handle);
    },
    async fire() {
      const next = timer.pending.shift();
      next?.fn();
      await settle();
    },
  };
  return timer;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(options: { store?: ReturnType<typeof memoryDraftStore>; now?: () => number } = {}) {
  const store = options.store ?? memoryDraftStore();
  const server = fakeServer();
  const timer = manualTimer();
  let state: CountSyncState = INITIAL_SYNC_STATE;
  let clock = Date.parse("2026-11-20T10:00:00Z");
  const now = options.now ?? (() => clock);
  const sync = new CountSync(SESSION, store, server.transport, (next) => (state = next), { now, timer });
  return {
    store,
    server,
    timer,
    sync,
    state: () => state,
    tick: (ms: number) => (clock += ms),
  };
}

describe("offline counting: CountSync", () => {
  it("keeps a figure on the phone the moment it is typed, and forgets it once the server has it", async () => {
    const { store, server, sync, state } = setup();
    await sync.start();
    sync.record({ ingredientId: MOZZARELLA, amount: "1,9", unit: "kg" });
    await settle();
    expect(store.records.get(SESSION)?.pending[MOZZARELLA]).toMatchObject({ amount: "1,9", unit: "kg" });
    expect(state().pending).toEqual([MOZZARELLA]);

    await sync.flush();
    expect(server.saves).toEqual([[{ ingredientId: MOZZARELLA, amount: "1,9", unit: "kg" }]]);
    expect(state()).toMatchObject({ pending: [], unreachable: false, justSaved: [MOZZARELLA] });
    expect(store.records.has(SESSION)).toBe(false);
  });

  it("without signal keeps everything, retries with growing waits, and sends once the server answers", async () => {
    const { store, server, timer, sync, state } = setup();
    await sync.start();
    server.reachable = false;
    sync.record({ ingredientId: MOZZARELLA, amount: "1900", unit: "g" });
    sync.record({ ingredientId: BASIL, amount: "0.2", unit: "kg" });
    await sync.flush();
    expect(state()).toMatchObject({ unreachable: true, pending: [MOZZARELLA, BASIL] });
    expect(store.records.get(SESSION)?.pending).toHaveProperty(BASIL);

    expect(timer.pending.map((handle) => handle.ms)).toEqual([RETRY_DELAYS[0]]);
    await timer.fire();
    expect(timer.pending.map((handle) => handle.ms)).toEqual([RETRY_DELAYS[1]]);
    await timer.fire();
    expect(timer.pending.map((handle) => handle.ms)).toEqual([RETRY_DELAYS[2]]);

    server.reachable = true;
    await timer.fire();
    expect(server.saves).toHaveLength(1);
    expect(server.saves[0].map((entry) => entry.ingredientId).sort()).toEqual([MOZZARELLA, BASIL].sort());
    expect(state()).toMatchObject({ unreachable: false, pending: [] });
    expect(timer.pending).toEqual([]);
    expect(store.records.has(SESSION)).toBe(false);
  });

  it("brings back what was typed after the page was closed, and sends it", async () => {
    const store = memoryDraftStore();
    const first = setup({ store });
    await first.sync.start();
    first.server.reachable = false;
    first.sync.record({ ingredientId: MOZZARELLA, amount: "1900", unit: "g" });
    await first.sync.flush();
    first.sync.dispose();

    // The phone reopens the page later, with signal.
    const second = setup({ store });
    const kept = await second.sync.start();
    expect(kept?.pending[MOZZARELLA]).toMatchObject({ amount: "1900", unit: "g" });
    await settle();
    await settle();
    expect(second.server.saves).toEqual([[{ ingredientId: MOZZARELLA, amount: "1900", unit: "g" }]]);
    expect(store.records.has(SESSION)).toBe(false);
  });

  it("keeps a figure typed again while the earlier one was on its way", async () => {
    const { server, sync, state } = setup();
    await sync.start();
    server.hold = true;
    sync.record({ ingredientId: MOZZARELLA, amount: "1", unit: "kg" });
    const sending = sync.flush();
    await settle();
    sync.record({ ingredientId: MOZZARELLA, amount: "2", unit: "kg" });
    server.hold = false;
    server.held.splice(0).forEach((release) => release());
    await sending;
    await settle();
    await settle();
    // The second figure went in its own batch; nothing is lost.
    expect(server.saves.map((batch) => batch[0].amount)).toEqual(["1", "2"]);
    expect(state().pending).toEqual([]);
  });

  it("does not resend a figure the server refused until it is changed, but sends the others", async () => {
    const { server, sync, state } = setup();
    await sync.start();
    server.answer = (entries) =>
      entries.some((entry) => entry.amount === "-1")
        ? { ok: false, message: "Please check the highlighted ingredient.", errors: { [`entries.${entries.findIndex((entry) => entry.amount === "-1")}`]: ["A count cannot be below zero."] } }
        : { ok: true };
    sync.record({ ingredientId: MOZZARELLA, amount: "-1", unit: "kg" });
    sync.record({ ingredientId: BASIL, amount: "0.2", unit: "kg" });
    await sync.flush();
    await settle();
    await settle();
    expect(state().rowErrors).toEqual({ [MOZZARELLA]: "A count cannot be below zero." });
    // Basil went again on its own and was saved; mozzarella waits for a correction.
    expect(server.saves.at(-1)).toEqual([{ ingredientId: BASIL, amount: "0.2", unit: "kg" }]);
    expect(state().pending).toEqual([MOZZARELLA]);

    await sync.flush();
    expect(server.saves).toHaveLength(2);

    sync.record({ ingredientId: MOZZARELLA, amount: "1", unit: "kg" });
    expect(state().rowErrors).toEqual({});
    await sync.flush();
    expect(server.saves.at(-1)).toEqual([{ ingredientId: MOZZARELLA, amount: "1", unit: "kg" }]);
    expect(state().pending).toEqual([]);
  });

  it("submits at once when the server answers, with the server's time", async () => {
    const { store, server, sync, state } = setup();
    await sync.start();
    sync.record({ ingredientId: MOZZARELLA, amount: "1900", unit: "g" });
    expect(await sync.submit(false)).toBe("submitted");
    expect(server.submits).toEqual([{ entries: [{ ingredientId: MOZZARELLA, amount: "1900", unit: "g" }], approve: false, countedAt: null }]);
    expect(state()).toMatchObject({ submitted: true, submitWaiting: false, pending: [] });
    expect(store.records.has(SESSION)).toBe(false);
  });

  it("keeps a submit tapped without signal and sends it later with the moment of the tap", async () => {
    const { store, server, timer, sync, state, tick } = setup();
    await sync.start();
    server.reachable = false;
    sync.record({ ingredientId: MOZZARELLA, amount: "1900", unit: "g" });
    const tappedAt = new Date(Date.parse("2026-11-20T10:00:00Z")).toISOString();
    expect(await sync.submit(true)).toBe("waiting");
    expect(state()).toMatchObject({ submitWaiting: true, unreachable: true });
    expect(store.records.get(SESSION)?.submit).toEqual({ approve: true, countedAt: tappedAt });

    // Twenty minutes later, outside the walk-in.
    tick(20 * 60_000);
    server.reachable = true;
    await timer.fire();
    expect(server.saves).toEqual([]);
    expect(server.submits).toEqual([{ entries: [{ ingredientId: MOZZARELLA, amount: "1900", unit: "g" }], approve: true, countedAt: tappedAt }]);
    expect(state()).toMatchObject({ submitted: true, submitWaiting: false });
    expect(store.records.has(SESSION)).toBe(false);
  });

  it("clears a kept submit the server refuses, and says why", async () => {
    const { server, sync, state } = setup();
    await sync.start();
    server.answer = () => ({ ok: false, message: "This count was already reviewed." });
    expect(await sync.submit(false)).toBe("refused");
    expect(state()).toMatchObject({ submitWaiting: false, submitted: false, message: "This count was already reviewed." });
  });

  it("tries again at once when woken (back online, page shown again)", async () => {
    const { server, timer, sync, state } = setup();
    await sync.start();
    server.reachable = false;
    sync.record({ ingredientId: MOZZARELLA, amount: "1", unit: "kg" });
    await sync.flush();
    await timer.fire();
    expect(timer.pending[0].ms).toBe(RETRY_DELAYS[1]);
    server.reachable = true;
    sync.wake();
    await settle();
    await settle();
    expect(state().pending).toEqual([]);
    expect(timer.pending).toEqual([]);
  });

  it("drops counts abandoned on the phone for longer than 30 days", async () => {
    const store = memoryDraftStore();
    await store.put({ sessionId: "old", pending: { [BASIL]: { amount: "1", unit: "kg", typedAt: 0 } }, submit: null, updatedAt: 0 });
    const { sync } = setup({ store, now: () => KEEP_DRAFTS_MS + 1 });
    await sync.start();
    expect(store.records.has("old")).toBe(false);
  });
});

describe("offline counting: the count time of a submit sent late", () => {
  const startedAt = new Date("2026-11-20T09:00:00Z");
  const now = new Date("2026-11-20T10:30:00Z");
  it("is the moment it was tapped on the phone", async () => {
    const { clampCountTime } = await import("@/lib/counts");
    expect(clampCountTime(new Date("2026-11-20T10:05:00Z"), startedAt, now).toISOString()).toBe("2026-11-20T10:05:00.000Z");
  });
  it("is never before the count started nor after the sync, whatever the phone's clock says", async () => {
    const { clampCountTime } = await import("@/lib/counts");
    expect(clampCountTime(new Date("2025-01-01T00:00:00Z"), startedAt, now).toISOString()).toBe(startedAt.toISOString());
    expect(clampCountTime(new Date("2026-11-20T11:00:00Z"), startedAt, now).toISOString()).toBe(now.toISOString());
  });
});
