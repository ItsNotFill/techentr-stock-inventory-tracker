"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveCountAction, submitCountAction } from "@/app/(app)/count/actions";
import { CountSync, INITIAL_SYNC_STATE, type CountDraftRecord, type CountEntry, type CountSyncState } from "@/lib/counts/offline";
import { countDraftStore } from "@/lib/counts/offline-store";

/**
 * The count sheet's link to the offline sync (lib/counts/offline.ts): figures
 * typed are kept on the phone and sent when the server can be reached
 * (DECISIONS.md 94). The sync is woken when the browser says it is online
 * again and when the page is shown again.
 *
 * `restored` is what the phone kept from an earlier visit (show those
 * figures, they are newer than the server's); undefined while loading.
 */
export function useCountSync(sessionId: string) {
  const [state, setState] = useState<CountSyncState>(INITIAL_SYNC_STATE);
  const [restored, setRestored] = useState<CountDraftRecord | null | undefined>(undefined);
  const syncRef = useRef<CountSync | null>(null);
  // Figures typed in the moment before the phone's store has opened.
  const earlyRef = useRef<CountEntry[]>([]);
  // Resolves once the sync is running: a submit tapped before that waits for it.
  const readyRef = useRef<{ promise: Promise<CountSync>; resolve: (sync: CountSync) => void } | null>(null);
  if (readyRef.current === null) {
    let resolve!: (sync: CountSync) => void;
    const promise = new Promise<CountSync>((done) => (resolve = done));
    readyRef.current = { promise, resolve };
  }

  useEffect(() => {
    let alive = true;
    let sync: CountSync | null = null;
    void countDraftStore().then(async (store) => {
      if (!alive) return;
      sync = new CountSync(
        sessionId,
        store,
        {
          save: (entries) => saveCountAction(sessionId, entries),
          submit: (entries, approve, countedAt) => submitCountAction(sessionId, entries, approve, countedAt),
        },
        (next) => {
          if (alive) setState(next);
        },
      );
      syncRef.current = sync;
      const kept = await sync.start();
      if (!alive) return;
      // A figure typed before the store opened is newer than what the phone kept: do not show the older one.
      const early = earlyRef.current.splice(0);
      const typed = new Set(early.map((entry) => entry.ingredientId));
      setRestored(
        kept && { ...kept, pending: Object.fromEntries(Object.entries(kept.pending).filter(([id]) => !typed.has(id))) },
      );
      for (const entry of early) sync.record(entry);
      readyRef.current?.resolve(sync);
    });

    const wake = () => syncRef.current?.wake();
    const onVisible = () => {
      if (document.visibilityState === "visible") wake();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      sync?.dispose();
      syncRef.current = null;
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sessionId]);

  const record = useCallback((entry: CountEntry) => {
    if (syncRef.current) syncRef.current.record(entry);
    else earlyRef.current.push(entry);
  }, []);

  const flush = useCallback(() => syncRef.current?.flush() ?? Promise.resolve(), []);

  const submit = useCallback(async (approve: boolean) => (syncRef.current ?? (await readyRef.current!.promise)).submit(approve), []);

  const forget = useCallback(() => syncRef.current?.forget() ?? Promise.resolve(), []);

  return { state, restored, record, flush, submit, forget };
}
