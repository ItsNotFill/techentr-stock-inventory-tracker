import { memoryDraftStore, type CountDraftRecord, type CountDraftStore } from "./offline";

/**
 * Count drafts kept in the browser's IndexedDB (DECISIONS.md 93), one record
 * per count. Browser only. When IndexedDB cannot be opened (a private window,
 * storage blocked) the figures are kept in memory instead: they survive a
 * lost signal, not a closed page.
 */

const DB_NAME = "restaurant-inventory";
const DB_VERSION = 1;
const STORE = "count-drafts";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE, { keyPath: "sessionId" });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error("IndexedDB is blocked"));
  });
}

let shared: Promise<CountDraftStore> | null = null;

/** The phone's draft store: IndexedDB when it works, memory otherwise. One per page. */
export function countDraftStore(): Promise<CountDraftStore> {
  shared ??= createStore();
  return shared;
}

async function createStore(): Promise<CountDraftStore> {
  if (typeof indexedDB === "undefined") return memoryDraftStore();
  let db: IDBDatabase;
  try {
    db = await openDatabase();
  } catch {
    return memoryDraftStore();
  }
  const objects = (mode: IDBTransactionMode) => db.transaction(STORE, mode).objectStore(STORE);
  return {
    async load(sessionId) {
      return ((await request(objects("readonly").get(sessionId))) as CountDraftRecord | undefined) ?? null;
    },
    async put(record) {
      await request(objects("readwrite").put(record));
    },
    async remove(sessionId) {
      await request(objects("readwrite").delete(sessionId));
    },
    async prune(before) {
      const all = (await request(objects("readonly").getAll())) as CountDraftRecord[];
      for (const record of all) {
        if (record.updatedAt < before) await request(objects("readwrite").delete(record.sessionId));
      }
    },
  };
}
