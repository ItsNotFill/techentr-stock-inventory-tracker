/**
 * Offline counting (DECISIONS.md 93). Walk-in fridges and cellars have no
 * signal, so what a person types on the count sheet is kept on the phone and
 * sent when the server can be reached again.
 *
 * - Every figure typed is written to a store on the phone (IndexedDB in the
 *   browser, `offline-store.ts`) before anything is sent.
 * - Figures go to the server in batches. A batch that does not reach it stays
 *   on the phone and is sent again: when the browser says it is online, when
 *   the page comes back into view, and on a timer that backs off.
 * - Saving is idempotent (a figure is stored per ingredient, so sending it
 *   twice changes nothing). A submit that could not be sent is kept with the
 *   moment it was tapped and sent later with that moment as the count time;
 *   the server keeps the time between the count's start and the sync, and
 *   answers "already submitted" with success when a retry repeats a submit
 *   that went through.
 *
 * No React and no browser APIs here, so it can be tested with a store in
 * memory and a fake server.
 */

export type CountEntry = { ingredientId: string; amount: string; unit: string };

/** What the phone keeps for one count. */
export type CountDraftRecord = {
  sessionId: string;
  /** Figures typed that the server has not confirmed yet, per ingredient. */
  pending: Record<string, { amount: string; unit: string; typedAt: number }>;
  /** A submit tapped while the server could not be reached. */
  submit: { approve: boolean; countedAt: string } | null;
  updatedAt: number;
};

export interface CountDraftStore {
  load(sessionId: string): Promise<CountDraftRecord | null>;
  put(record: CountDraftRecord): Promise<void>;
  remove(sessionId: string): Promise<void>;
  /** Drops records not touched since `before` (abandoned counts). */
  prune(before: number): Promise<void>;
}

/** What a Server Action answers (FormState). */
export type SyncAnswer = { ok: boolean; message?: string; errors?: Record<string, string[] | undefined> };

export type CountTransport = {
  save(entries: CountEntry[]): Promise<SyncAnswer>;
  /** `countedAt`: the phone's time of the tap for a submit sent late; null for "now". */
  submit(entries: CountEntry[], approve: boolean, countedAt: string | null): Promise<SyncAnswer>;
};

export type CountSyncState = {
  /** Figures on the phone that the server has not confirmed. */
  pending: string[];
  /** The last attempt to reach the server failed. */
  unreachable: boolean;
  syncing: boolean;
  /** A submit is kept on the phone, waiting to be sent. */
  submitWaiting: boolean;
  /** The server accepted the submit. */
  submitted: boolean;
  /** Per ingredient: why the server refused the figure. Not sent again until it changes. */
  rowErrors: Record<string, string>;
  /** Ingredients the server has confirmed since they were last changed. */
  saved: string[];
  /** A refusal that is not about one figure (for example: already reviewed). */
  message: string | null;
};

export const INITIAL_SYNC_STATE: CountSyncState = {
  pending: [],
  unreachable: false,
  syncing: false,
  submitWaiting: false,
  submitted: false,
  rowErrors: {},
  saved: [],
  message: null,
};

/** Waits between retries while the server cannot be reached, in ms; the last one repeats. */
export const RETRY_DELAYS = [3_000, 5_000, 10_000, 20_000, 30_000, 60_000];

/** Records older than this are abandoned counts and are dropped. */
export const KEEP_DRAFTS_MS = 30 * 24 * 60 * 60 * 1000;

type Timer = { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };

export class CountSync {
  private draft: CountDraftRecord;
  private state: CountSyncState = INITIAL_SYNC_STATE;
  private running = false;
  private again = false;
  private retryHandle: unknown = null;
  private attempt = 0;
  /** Figures refused by the server, with what was sent: not retried until changed. */
  private refused = new Map<string, string>();
  private persisting: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(
    readonly sessionId: string,
    private readonly store: CountDraftStore,
    private readonly transport: CountTransport,
    private readonly onState: (state: CountSyncState) => void,
    private readonly options: { now?: () => number; timer?: Timer } = {},
  ) {
    this.draft = { sessionId, pending: {}, submit: null, updatedAt: this.now() };
  }

  private now() {
    return this.options.now ? this.options.now() : Date.now();
  }

  private get timer(): Timer {
    return this.options.timer ?? { set: (fn, ms) => setTimeout(fn, ms), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) };
  }

  private emit(patch: Partial<CountSyncState>) {
    this.state = { ...this.state, ...patch, pending: Object.keys(this.draft.pending), submitWaiting: this.draft.submit !== null };
    if (!this.disposed) this.onState(this.state);
  }

  private persist() {
    this.draft.updatedAt = this.now();
    const snapshot: CountDraftRecord = structuredClone(this.draft);
    // Writes go one after another, so an older snapshot never lands after a newer one.
    this.persisting = this.persisting
      .then(() => (Object.keys(snapshot.pending).length === 0 && !snapshot.submit ? this.store.remove(this.sessionId) : this.store.put(snapshot)))
      .catch(() => {
        // The phone's storage refused (private window, storage full): the figures stay in memory.
      });
    return this.persisting;
  }

  /**
   * Loads what the phone kept for this count. The caller shows these figures
   * instead of the server's, because they are newer. Then sends them.
   */
  async start(): Promise<CountDraftRecord | null> {
    let stored: CountDraftRecord | null = null;
    try {
      await this.store.prune(this.now() - KEEP_DRAFTS_MS);
      stored = await this.store.load(this.sessionId);
    } catch {
      stored = null;
    }
    if (stored) this.draft = { ...stored, pending: { ...stored.pending } };
    this.emit({});
    if (stored && (Object.keys(stored.pending).length > 0 || stored.submit)) void this.flush();
    return stored;
  }

  /** A figure was typed (or cleared: amount ""). Kept on the phone at once; sent by `flush`. */
  record(entry: CountEntry) {
    this.draft.pending[entry.ingredientId] = { amount: entry.amount, unit: entry.unit, typedAt: this.now() };
    this.refused.delete(entry.ingredientId);
    const rowErrors = { ...this.state.rowErrors };
    delete rowErrors[entry.ingredientId];
    this.emit({ rowErrors, saved: this.state.saved.filter((id) => id !== entry.ingredientId) });
    void this.persist();
  }

  private sendable(): CountEntry[] {
    return Object.entries(this.draft.pending)
      .filter(([id, value]) => this.refused.get(id) !== `${value.amount}|${value.unit}`)
      .map(([ingredientId, value]) => ({ ingredientId, amount: value.amount, unit: value.unit }));
  }

  private scheduleRetry() {
    if (this.retryHandle !== null || this.disposed) return;
    const delay = RETRY_DELAYS[Math.min(this.attempt, RETRY_DELAYS.length - 1)];
    this.attempt += 1;
    this.retryHandle = this.timer.set(() => {
      this.retryHandle = null;
      void this.flush();
    }, delay);
  }

  /** Called when the browser says it is back online or the page is shown again. */
  wake() {
    if (this.retryHandle !== null) {
      this.timer.clear(this.retryHandle);
      this.retryHandle = null;
    }
    this.attempt = 0;
    void this.flush();
  }

  /** Sends what is waiting. Safe to call at any time; overlapping calls are merged. */
  async flush(): Promise<void> {
    if (this.disposed) return;
    if (this.running) {
      this.again = true;
      return this.persisting;
    }
    const entries = this.sendable();
    const submit = this.draft.submit;
    if (entries.length === 0 && !submit) return;

    this.running = true;
    this.emit({ syncing: true });
    const sentAt = this.now();
    try {
      const answer = submit
        ? await this.transport.submit(entries, submit.approve, submit.countedAt)
        : await this.transport.save(entries);
      this.attempt = 0;
      this.settle(entries, answer, sentAt, Boolean(submit));
    } catch {
      // The server could not be reached: everything stays on the phone.
      this.emit({ syncing: false, unreachable: true });
      this.scheduleRetry();
    } finally {
      this.running = false;
      await this.persist();
      if (this.again) {
        this.again = false;
        void this.flush();
      }
    }
  }

  private settle(sent: CountEntry[], answer: SyncAnswer, sentAt: number, wasSubmit: boolean) {
    const rowErrors = { ...this.state.rowErrors };
    if (answer.ok) {
      const saved: string[] = [];
      for (const entry of sent) {
        const current = this.draft.pending[entry.ingredientId];
        // Typed again while this batch was on its way: keep the newer figure.
        if (current && current.typedAt <= sentAt && current.amount === entry.amount && current.unit === entry.unit) {
          delete this.draft.pending[entry.ingredientId];
          saved.push(entry.ingredientId);
        }
        delete rowErrors[entry.ingredientId];
      }
      const allSaved = [...new Set([...this.state.saved, ...saved])];
      if (wasSubmit) {
        this.draft = { ...this.draft, pending: {}, submit: null };
        this.emit({ syncing: false, unreachable: false, rowErrors: {}, saved: allSaved, submitted: true, message: answer.message ?? null });
        return;
      }
      this.emit({ syncing: false, unreachable: false, rowErrors, saved: allSaved, message: null });
      // Figures typed meanwhile go in the next batch.
      if (this.sendable().length > 0) this.again = true;
      return;
    }

    // Refused. Per-figure errors name the entry by its index in the batch.
    let perFigure = false;
    sent.forEach((entry, index) => {
      const error = answer.errors?.[`entries.${index}`]?.[0];
      if (error) {
        perFigure = true;
        rowErrors[entry.ingredientId] = error;
        this.refused.set(entry.ingredientId, `${entry.amount}|${entry.unit}`);
      }
    });
    if (wasSubmit) this.draft = { ...this.draft, submit: null };
    this.emit({
      syncing: false,
      unreachable: false,
      rowErrors,
      message: perFigure ? (wasSubmit ? answer.message ?? "Please check the highlighted ingredient." : null) : (answer.message ?? "Not saved."),
    });
    // The other figures of the batch were not saved either (one transaction): send them again.
    if (perFigure && this.sendable().length > 0) this.again = true;
  }

  /**
   * Submit was tapped. Sent now with "now" as the count time; if the server
   * cannot be reached, kept on the phone with the moment of the tap and sent
   * later. Resolves to what happened.
   */
  async submit(approve: boolean): Promise<"submitted" | "waiting" | "refused"> {
    const countedAt = new Date(this.now()).toISOString();
    const entries = Object.entries(this.draft.pending).map(([ingredientId, value]) => ({ ingredientId, amount: value.amount, unit: value.unit }));
    if (this.running) {
      // A save is on its way: keep the submit and send it right after.
      this.draft.submit = { approve, countedAt };
      this.again = true;
      await this.persist();
      this.emit({});
      return "waiting";
    }
    this.running = true;
    this.emit({ syncing: true });
    const sentAt = this.now();
    try {
      const answer = await this.transport.submit(entries, approve, null);
      this.settle(entries, answer, sentAt, true);
      return answer.ok ? "submitted" : "refused";
    } catch {
      this.draft.submit = { approve, countedAt };
      this.emit({ syncing: false, unreachable: true });
      this.scheduleRetry();
      return "waiting";
    } finally {
      this.running = false;
      await this.persist();
      if (this.again) {
        this.again = false;
        void this.flush();
      }
    }
  }

  /** Forgets this count on the phone (the draft was deleted on the server). */
  async forget() {
    this.draft = { sessionId: this.sessionId, pending: {}, submit: null, updatedAt: this.now() };
    this.emit({ rowErrors: {}, message: null });
    await this.persist();
  }

  dispose() {
    this.disposed = true;
    if (this.retryHandle !== null) this.timer.clear(this.retryHandle);
    this.retryHandle = null;
  }
}

/** A store in memory: for tests, and the fallback when the phone has no IndexedDB. */
export function memoryDraftStore(): CountDraftStore & { records: Map<string, CountDraftRecord> } {
  const records = new Map<string, CountDraftRecord>();
  return {
    records,
    async load(sessionId) {
      const record = records.get(sessionId);
      return record ? structuredClone(record) : null;
    },
    async put(record) {
      records.set(record.sessionId, structuredClone(record));
    },
    async remove(sessionId) {
      records.delete(sessionId);
    },
    async prune(before) {
      for (const [id, record] of records) if (record.updatedAt < before) records.delete(id);
    },
  };
}
