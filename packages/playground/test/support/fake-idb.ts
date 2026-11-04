// An in-memory stand-in for IndexedDB, as far as the page's persistence uses it: a database with
// object stores (out-of-line or auto-increment keys, an index on one field), transactions that
// commit when idle, and requests that answer asynchronously. It can also fail the ways IndexedDB
// does: refuse to open, block an upgrade, never answer, and abort a write.

import type {
  IdbDatabaseLike,
  IdbFactoryLike,
  IdbIndexLike,
  IdbOpenRequestLike,
  IdbRequestLike,
  IdbStoreLike,
  IdbTransactionLike,
} from "../../src/cloud/persistence.js";

/** How the fake fails: `open` fails the way the name says; `write` aborts a transaction that writes. */
export interface IdbFailure {
  open?: "error" | "blocked" | "throw" | "hang";
  /** Abort the next write transaction that touches this store. */
  write?: string;
}

const tick = async (rounds = 6) => {
  for (let i = 0; i < rounds; i++) await new Promise<void>((resolve) => queueMicrotask(resolve));
};

class Request<T> implements IdbRequestLike<T> {
  result!: T;
  error: unknown = null;
  onsuccess: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
}

interface Row {
  readonly key: string | number;
  value: unknown;
}

class Store implements IdbStoreLike {
  constructor(
    private readonly rows: Row[],
    private readonly options: { autoIncrement: boolean; indexes: Map<string, string> },
    private readonly run: <T>(work: () => T, writes?: boolean) => IdbRequestLike<T>,
    private readonly counter: { next: number },
  ) {}

  get(key: string): IdbRequestLike<unknown> {
    return this.run(() => this.rows.find((row) => row.key === key)?.value);
  }

  put(value: unknown, key?: string): IdbRequestLike<unknown> {
    return this.run(() => {
      const at = key ?? this.counter.next++;
      const found = this.rows.find((row) => row.key === at);
      if (found) found.value = value;
      else this.rows.push({ key: at, value });
      return at;
    }, true);
  }

  add(value: unknown): IdbRequestLike<unknown> {
    return this.run(() => {
      const key = this.counter.next++;
      this.rows.push({ key, value });
      return key;
    }, true);
  }

  delete(key: unknown): IdbRequestLike<unknown> {
    return this.run(() => {
      const at = this.rows.findIndex((row) => row.key === key);
      if (at >= 0) this.rows.splice(at, 1);
      return undefined;
    }, true);
  }

  createIndex(name: string, keyPath: string): void {
    this.options.indexes.set(name, keyPath);
  }

  index(name: string): IdbIndexLike {
    const keyPath = this.options.indexes.get(name);
    if (keyPath === undefined) throw new Error(`No index ${name}.`);
    const matching = (key: string) =>
      this.rows.filter((row) => (row.value as Record<string, unknown>)[keyPath] === key);
    return {
      getAll: (key) => this.run(() => matching(key).map((row) => row.value)),
      getAllKeys: (key) => this.run(() => matching(key).map((row) => row.key)),
    };
  }
}

class Transaction implements IdbTransactionLike {
  error: unknown = null;
  oncomplete: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onabort: ((event: unknown) => void) | null = null;
  private active = 0;
  private finished = false;
  private writes = false;

  constructor(
    private readonly db: Database,
    private readonly names: string[],
    private readonly mode: "readonly" | "readwrite",
  ) {}

  objectStore(name: string): IdbStoreLike {
    if (!this.names.includes(name)) throw new Error(`The transaction does not cover ${name}.`);
    const data = this.db.data(name);
    return new Store(
      data.rows,
      data.options,
      (work, writes) => this.request(name, work, writes ?? false),
      data.counter,
    );
  }

  abort(): void {
    this.finish(new Error("The transaction was aborted."));
  }

  private request<T>(store: string, work: () => T, writes: boolean): IdbRequestLike<T> {
    if (this.finished) throw new Error("The transaction has finished.");
    if (writes && this.mode === "readonly") throw new Error("The transaction is read-only.");
    this.active++;
    this.writes ||= writes;
    const request = new Request<T>();
    void (async () => {
      await tick(1);
      if (this.finished) return;
      if (writes && this.db.failure.write === store) {
        this.db.failure.write = undefined;
        request.error = new Error("QuotaExceededError");
        request.onerror?.({});
        this.finish(request.error);
        return;
      }
      try {
        request.result = work();
        request.onsuccess?.({});
      } catch (error) {
        request.error = error;
        request.onerror?.({});
      }
      this.active--;
      // Idle once the continuations of the request have had their say: the transaction commits.
      await tick(8);
      if (this.active === 0 && !this.finished) this.finish();
    })();
    return request;
  }

  private finish(error?: unknown): void {
    if (this.finished) return;
    this.finished = true;
    if (error !== undefined) {
      this.error = error;
      this.onabort?.({});
    } else this.oncomplete?.({});
  }
}

class Database implements IdbDatabaseLike {
  onversionchange: ((event: unknown) => void) | null = null;
  closed = false;
  readonly stores = new Map<
    string,
    {
      rows: Row[];
      options: { autoIncrement: boolean; indexes: Map<string, string> };
      counter: { next: number };
    }
  >();
  readonly objectStoreNames = { contains: (name: string) => this.stores.has(name) };

  constructor(readonly failure: IdbFailure) {}

  data(name: string) {
    const found = this.stores.get(name);
    if (!found) throw new Error(`No store ${name}.`);
    return found;
  }

  createObjectStore(name: string, options: { autoIncrement?: boolean } = {}): IdbStoreLike {
    const data = {
      rows: [] as Row[],
      options: {
        autoIncrement: options.autoIncrement ?? false,
        indexes: new Map<string, string>(),
      },
      counter: { next: 1 },
    };
    this.stores.set(name, data);
    return new Store(
      data.rows,
      data.options,
      (work) => {
        const request = new Request<ReturnType<typeof work>>();
        request.result = work();
        return request;
      },
      data.counter,
    );
  }

  transaction(stores: string[], mode: "readonly" | "readwrite"): IdbTransactionLike {
    if (this.closed) throw new Error("The database is closed.");
    return new Transaction(this, stores, mode);
  }

  close(): void {
    this.closed = true;
  }
}

/** The factory, with the databases it holds and the ways it can be made to fail. */
export class FakeIdb implements IdbFactoryLike {
  readonly failure: IdbFailure = {};
  /** The databases by name, shared by every `open` as the browser's are. */
  readonly databases = new Map<string, Database>();
  /** Every connection opened, to see which were closed. */
  readonly connections: Database[] = [];

  open(name: string): IdbOpenRequestLike {
    if (this.failure.open === "throw") throw new Error("SecurityError");
    const request = new Request<IdbDatabaseLike>() as Request<IdbDatabaseLike> & {
      onupgradeneeded: ((event: unknown) => void) | null;
      onblocked: ((event: unknown) => void) | null;
    };
    request.onupgradeneeded = null;
    request.onblocked = null;
    void (async () => {
      await tick(1);
      if (this.failure.open === "hang") return;
      if (this.failure.open === "error") {
        request.error = new Error("UnknownError");
        request.onerror?.({});
        return;
      }
      if (this.failure.open === "blocked") {
        request.onblocked?.({});
        return;
      }
      let database = this.databases.get(name);
      const created = !database;
      if (!database) {
        database = new Database(this.failure);
        this.databases.set(name, database);
      }
      const connection = new Database(this.failure);
      // Connections share what the database holds.
      for (const [key, value] of database.stores) connection.stores.set(key, value);
      this.connections.push(connection);
      request.result = connection;
      if (created) {
        // The upgrade runs on the first connection, and what it makes is the database's.
        request.onupgradeneeded?.({});
        for (const [key, value] of connection.stores) database.stores.set(key, value);
      }
      request.onsuccess?.({});
    })();
    return request;
  }

  /** The rows of a store of the database, for a test to look at. */
  rows(database: string, store: string): unknown[] {
    return (this.databases.get(database)?.stores.get(store)?.rows ?? []).map((row) => row.value);
  }
}
