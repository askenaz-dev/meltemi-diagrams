// A cloud project kept in this browser (`cloud-projects`, "The page"): IndexedDB database
// `meltemi-cloud` with the encoded state of each document (store `docs`) and the person's updates
// since (store `updates`), folded into the state on open and past `COMPACT_AFTER` entries. The
// project opens from here at once and keeps working offline. Where IndexedDB is missing, blocked
// or fails, the database says it is unavailable and the project simply opens from the room.
//
// The page never touches the global `indexedDB` here: an IDBFactory-like object is handed in (a
// test hands an in-memory one), described by the small interfaces below.

import type { Timers } from "./binding.js";
import { realTimers } from "./binding.js";

export const DATABASE_NAME = "meltemi-cloud";
export const DATABASE_VERSION = 1;
/** The store of encoded documents, by project id. */
export const DOCS = "docs";
/** The store of updates since the last compaction, with an index on the project. */
export const UPDATES = "updates";
/** The index of `updates` by project id. */
export const BY_PROJECT = "project";

/** Updates a project may hold before they are folded into its document. */
export const COMPACT_AFTER = 200;

/** How long opening the database may take before the page goes on without it. */
export const OPEN_TIMEOUT_MS = 5000;

// What IndexedDB must offer -------------------------------------------------------------------------

export interface IdbRequestLike<T = unknown> {
  readonly result: T;
  readonly error: unknown;
  onsuccess: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface IdbOpenRequestLike extends IdbRequestLike<IdbDatabaseLike> {
  onupgradeneeded: ((event: unknown) => void) | null;
  onblocked: ((event: unknown) => void) | null;
}

export interface IdbIndexLike {
  getAll(key: string): IdbRequestLike<unknown[]>;
  getAllKeys(key: string): IdbRequestLike<unknown[]>;
}

export interface IdbStoreLike {
  get(key: string): IdbRequestLike<unknown>;
  put(value: unknown, key?: string): IdbRequestLike<unknown>;
  add(value: unknown): IdbRequestLike<unknown>;
  delete(key: unknown): IdbRequestLike<unknown>;
  createIndex(name: string, keyPath: string): unknown;
  index(name: string): IdbIndexLike;
}

export interface IdbTransactionLike {
  readonly error: unknown;
  oncomplete: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onabort: ((event: unknown) => void) | null;
  objectStore(name: string): IdbStoreLike;
  abort(): void;
}

export interface IdbDatabaseLike {
  readonly objectStoreNames: { contains(name: string): boolean };
  onversionchange: ((event: unknown) => void) | null;
  createObjectStore(name: string, options?: { autoIncrement?: boolean }): IdbStoreLike;
  transaction(stores: string[], mode: "readonly" | "readwrite"): IdbTransactionLike;
  close(): void;
}

/** The part of `IDBFactory` the page uses. */
export interface IdbFactoryLike {
  open(name: string, version?: number): IdbOpenRequestLike;
}

// What a project's store keeps --------------------------------------------------------------------

/** What was kept of a document. */
export interface StoredDoc {
  /** The encoded state at the last compaction; undefined when only updates were kept. */
  readonly state: Uint8Array | undefined;
  /** The updates made since, in order. */
  readonly updates: readonly Uint8Array[];
  /**
   * Whether the person's changes may not have reached the room: the last compaction folded some
   * that were not delivered, or updates are waiting. The page then offers the room its whole state.
   */
  readonly unsynced: boolean;
}

/** What a project's store needs to know about the document it keeps. */
export interface DocSource {
  /** The document's encoded state now. */
  snapshot(): Uint8Array;
  /** Whether the person's changes may not be in the room yet. */
  unsynced(): boolean;
}

/** One project's documents in the database. Nothing here throws: a failure makes it unavailable. */
export interface ProjectStore {
  /** False when nothing is kept: IndexedDB is missing, blocked, or just failed. */
  readonly available: boolean;
  /** What was kept, or undefined when nothing was (or nothing can be read). */
  load(): Promise<StoredDoc | undefined>;
  /** Keeps an update of the person's. Several at once are written in order. */
  append(update: Uint8Array): void;
  /** Folds the updates into the document's state (the source's, now). */
  compact(): Promise<void>;
  /** Resolves when everything handed in so far is written (or has been given up). */
  flush(): Promise<void>;
}

/** The browser's database of documents. */
export interface CloudDatabase {
  /** False when IndexedDB is missing, blocked, or timed out on opening. */
  readonly available: boolean;
  /** The store of one project's document. */
  project(id: string, source: DocSource, onFailure?: () => void): ProjectStore;
  /** Removes everything kept of a project. */
  forget(id: string): Promise<void>;
  close(): void;
}

// Requests and transactions ----------------------------------------------------------------------

function fail(request: { error: unknown }, what: string): Error {
  return request.error instanceof Error ? request.error : new Error(what);
}

/** The result of a request, as a promise. */
function result<T>(request: IdbRequestLike<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(fail(request, "An IndexedDB request failed."));
  });
}

/**
 * Runs `work` in a transaction and resolves with what it returns once the transaction has
 * committed. `work` awaits only IndexedDB requests (a transaction commits when it is idle).
 */
async function transact<T>(
  db: IdbDatabaseLike,
  stores: string[],
  mode: "readonly" | "readwrite",
  work: (tx: IdbTransactionLike) => Promise<T>,
): Promise<T> {
  const tx = db.transaction(stores, mode);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(fail(tx, "An IndexedDB transaction failed."));
    tx.onabort = () => reject(fail(tx, "An IndexedDB transaction was aborted."));
  });
  // A rejection nobody awaits yet (the work failed first) is not an unhandled one.
  done.catch(() => undefined);
  let value: T;
  try {
    value = await work(tx);
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // Already finished.
    }
    throw error;
  }
  await done;
  return value;
}

const isBytes = (value: unknown): value is Uint8Array => ArrayBuffer.isView(value);

// A project's store ---------------------------------------------------------------------------------

class IdbProjectStore implements ProjectStore {
  private queue: Promise<void> = Promise.resolve();
  /** Updates written since the last compaction (counted as the writes happen, in order). */
  private held = 0;
  private compacting = false;
  private broken = false;

  constructor(
    private readonly db: IdbDatabaseLike,
    private readonly id: string,
    private readonly source: DocSource,
    private readonly onFailure: () => void,
  ) {}

  get available(): boolean {
    return !this.broken;
  }

  async load(): Promise<StoredDoc | undefined> {
    if (this.broken) return undefined;
    try {
      const stored = await transact(this.db, [DOCS, UPDATES], "readonly", async (tx) => {
        const record = await result(tx.objectStore(DOCS).get(this.id));
        const rows = await result(tx.objectStore(UPDATES).index(BY_PROJECT).getAll(this.id));
        return { record, rows };
      });
      const record = stored.record as { state?: unknown; unsynced?: unknown } | undefined;
      const state = record && isBytes(record.state) ? record.state : undefined;
      const updates = stored.rows.flatMap((row) => {
        const update = (row as { update?: unknown } | null)?.update;
        return isBytes(update) ? [update] : [];
      });
      this.held = updates.length;
      if (state === undefined && updates.length === 0) return undefined;
      return {
        state,
        updates,
        unsynced: record?.unsynced === true || updates.length > 0,
      };
    } catch {
      this.giveUp();
      return undefined;
    }
  }

  append(update: Uint8Array): void {
    this.enqueue(async () => {
      await transact(this.db, [UPDATES], "readwrite", (tx) =>
        result(tx.objectStore(UPDATES).add({ project: this.id, update })),
      );
      this.held++;
      if (this.held > COMPACT_AFTER && !this.compacting) void this.compact();
    });
  }

  compact(): Promise<void> {
    this.compacting = true;
    return this.enqueue(async () => {
      this.compacting = false;
      // The state is read when the write runs: it holds every update written before this point,
      // and the ones that follow are written after the updates it replaces are gone.
      const state = this.source.snapshot();
      const unsynced = this.source.unsynced();
      await transact(this.db, [DOCS, UPDATES], "readwrite", async (tx) => {
        const updates = tx.objectStore(UPDATES);
        const keys = await result(updates.index(BY_PROJECT).getAllKeys(this.id));
        await result(tx.objectStore(DOCS).put({ state, unsynced }, this.id));
        await Promise.all(keys.map((key) => result(updates.delete(key))));
      });
      this.held = 0;
    });
  }

  flush(): Promise<void> {
    return this.enqueue(async () => undefined);
  }

  /** Runs `work` after what was enqueued before it; a failure makes the store unavailable. */
  private enqueue(work: () => Promise<void>): Promise<void> {
    const next = this.queue.then(async () => {
      if (this.broken) return;
      try {
        await work();
      } catch {
        this.giveUp();
      }
    });
    this.queue = next;
    return next;
  }

  private giveUp(): void {
    if (this.broken) return;
    this.broken = true;
    this.onFailure();
  }
}

/** A store of nothing: what a project has where nothing can be kept. */
class NoStore implements ProjectStore {
  readonly available = false;
  load(): Promise<StoredDoc | undefined> {
    return Promise.resolve(undefined);
  }
  append(): void {}
  compact(): Promise<void> {
    return Promise.resolve();
  }
  flush(): Promise<void> {
    return Promise.resolve();
  }
}

class NoDatabase implements CloudDatabase {
  readonly available = false;
  project(_id: string, _source: DocSource, onFailure?: () => void): ProjectStore {
    void onFailure;
    return new NoStore();
  }
  forget(): Promise<void> {
    return Promise.resolve();
  }
  close(): void {}
}

class IdbDatabase implements CloudDatabase {
  available = true;

  constructor(private readonly db: IdbDatabaseLike) {
    // Another tab upgrading the database must not wait for this one.
    db.onversionchange = () => {
      this.available = false;
      db.close();
    };
  }

  project(id: string, source: DocSource, onFailure: () => void = () => undefined): ProjectStore {
    return new IdbProjectStore(this.db, id, source, onFailure);
  }

  async forget(id: string): Promise<void> {
    try {
      await transact(this.db, [DOCS, UPDATES], "readwrite", async (tx) => {
        const updates = tx.objectStore(UPDATES);
        const keys = await result(updates.index(BY_PROJECT).getAllKeys(id));
        await result(tx.objectStore(DOCS).delete(id));
        await Promise.all(keys.map((key) => result(updates.delete(key))));
      });
    } catch {
      // Nothing kept, or nothing that can be removed: the project is gone either way.
    }
  }

  close(): void {
    this.available = false;
    try {
      this.db.close();
    } catch {
      // Closed already.
    }
  }
}

export interface OpenOptions {
  readonly timers?: Timers;
  readonly timeoutMs?: number;
}

/**
 * Opens the page's database. Never rejects and never waits longer than `timeoutMs`: a missing
 * factory, an error, a blocked upgrade and a timeout all give an unavailable database, and the
 * project then opens from the room.
 */
export function openDatabase(
  factory: IdbFactoryLike | undefined,
  options: OpenOptions = {},
): Promise<CloudDatabase> {
  if (!factory) return Promise.resolve(new NoDatabase());
  const timers = options.timers ?? realTimers;
  return new Promise((resolve) => {
    let settled = false;
    let request: IdbOpenRequestLike;
    const give = (database: CloudDatabase) => {
      if (settled) return;
      settled = true;
      timers.clear(timer);
      resolve(database);
    };
    const timer = timers.set(() => give(new NoDatabase()), options.timeoutMs ?? OPEN_TIMEOUT_MS);
    try {
      request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    } catch {
      give(new NoDatabase());
      return;
    }
    request.onupgradeneeded = () => {
      try {
        const db = request.result;
        if (!db.objectStoreNames.contains(DOCS)) db.createObjectStore(DOCS);
        if (!db.objectStoreNames.contains(UPDATES)) {
          db.createObjectStore(UPDATES, { autoIncrement: true }).createIndex(BY_PROJECT, "project");
        }
      } catch {
        // The open then fails and the page goes on without.
      }
    };
    request.onsuccess = () => {
      let db: IdbDatabaseLike | undefined;
      try {
        db = request.result;
      } catch {
        give(new NoDatabase());
        return;
      }
      if (settled) {
        // The page gave up on it already (blocked, or too slow): do not hold the database open.
        try {
          db.close();
        } catch {
          // Nothing to close.
        }
        return;
      }
      give(new IdbDatabase(db));
    };
    request.onerror = () => give(new NoDatabase());
    request.onblocked = () => give(new NoDatabase());
  });
}

// The file each project had open ------------------------------------------------------------------

/** The part of `localStorage` the page uses for this. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const LAST_OPEN_KEY = "meltemi-playground:cloud-open:v1";

/** How many projects' last open file are remembered. */
export const REMEMBERED_PROJECTS = 100;

function readRemembered(storage: KeyValueStore | undefined): Record<string, string> {
  try {
    const text = storage?.getItem(LAST_OPEN_KEY);
    const value: unknown = text ? JSON.parse(text) : {};
    if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

/** The file a project had open in this browser, or undefined. */
export function rememberedFile(storage: KeyValueStore | undefined, id: string): string | undefined {
  const all = readRemembered(storage);
  return Object.hasOwn(all, id) ? all[id] : undefined;
}

/** Remembers the file a project has open, for the next time it is opened in this browser. */
export function rememberFile(storage: KeyValueStore | undefined, id: string, path: string): void {
  if (!storage || path === "") return;
  try {
    const all = readRemembered(storage);
    if (all[id] === path) return;
    // The latest last: the oldest go first when there are too many.
    delete all[id];
    all[id] = path;
    const ids = Object.keys(all);
    for (const old of ids.slice(0, Math.max(0, ids.length - REMEMBERED_PROJECTS))) delete all[old];
    storage.setItem(LAST_OPEN_KEY, JSON.stringify(all));
  } catch {
    // A convenience: without it the first source opens.
  }
}
