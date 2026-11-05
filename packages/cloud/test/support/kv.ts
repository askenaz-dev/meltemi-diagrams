// The authorization server's store in the tests (`Deps.oauthStore`, which its library reads as
// `env.OAUTH_KV`): the Worker's own D1 store (`src/oauth/store.ts`) over node:sqlite with the
// migrations applied, where this Node has node:sqlite, and otherwise a KV namespace in memory with the
// same semantics. Both keep time by `Date.now()`, the clock the library reads, so that a test that
// moves the system time moves the store's too, and both answer what they hold for a test to look in.

import {
  d1OAuthStore,
  MAX_LIST_LIMIT,
  type KVLike,
  type KVListedKeyLike,
} from "../../src/oauth/store.js";
import { migrationFiles, openDatabase, sqliteAvailable, type SqliteDb } from "./sqlite.js";

export interface TestOAuthStore extends KVLike {
  /** Which store this is: the D1 one over node:sqlite, or the one in memory. */
  readonly kind: "sqlite" | "memory";
  /** The keys held now, expired ones left out, in key order. */
  keys(): string[];
  /**
   * Every key, value and metadata written so far, in order, for a test that looks for what must
   * never be stored.
   */
  written(): string[];
}

/** Compares texts by code point, as KV and SQLite order keys (UTF-8 bytes), and not by UTF-16 unit. */
export function compareKeys(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const x = left[i]!.codePointAt(0)!;
    const y = right[i]!.codePointAt(0)!;
    if (x !== y) return x - y;
  }
  return left.length - right.length;
}

interface Entry {
  readonly value: string;
  /** Seconds since 1970 after which the entry is gone. */
  readonly expiration?: number;
  readonly metadata?: unknown;
}

/** A KV namespace in memory, with the semantics of the D1 store. */
export function memoryOAuthStore(): TestOAuthStore {
  const entries = new Map<string, Entry>();
  const written: string[] = [];
  const now = () => Date.now() / 1000;
  const live = (key: string): Entry | undefined => {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (entry.expiration !== undefined && entry.expiration <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  };
  const store: TestOAuthStore = {
    kind: "memory",
    written: () => [...written],
    keys: () => [...entries.keys()].filter((key) => live(key) !== undefined).sort(compareKeys),
    async get(key, options) {
      const entry = live(key);
      if (!entry) return null;
      const type = typeof options === "string" ? options : options?.type;
      return type === "json" ? (JSON.parse(entry.value) as unknown) : entry.value;
    },
    async put(key, value, options = {}) {
      if (typeof value !== "string") throw new TypeError("the store keeps text only");
      written.push(key, value);
      if (options.metadata !== undefined) written.push(JSON.stringify(options.metadata));
      const expiration =
        options.expiration !== undefined
          ? Math.floor(options.expiration)
          : options.expirationTtl !== undefined
            ? Math.floor(now() + options.expirationTtl)
            : undefined;
      entries.set(key, {
        value,
        ...(expiration !== undefined ? { expiration } : {}),
        ...(options.metadata !== undefined
          ? { metadata: JSON.parse(JSON.stringify(options.metadata)) as unknown }
          : {}),
      });
    },
    async delete(key) {
      entries.delete(key);
    },
    async list(options = {}) {
      const prefix = options.prefix ?? "";
      const limit = Math.min(options.limit ?? MAX_LIST_LIMIT, MAX_LIST_LIMIT);
      const after = options.cursor || undefined;
      const matching = store
        .keys()
        .filter((key) => key.startsWith(prefix))
        .filter((key) => after === undefined || compareKeys(key, after) > 0);
      const page = matching.slice(0, limit);
      const keys: KVListedKeyLike[] = page.map((name) => {
        const entry = entries.get(name)!;
        return {
          name,
          ...(entry.expiration !== undefined ? { expiration: entry.expiration } : {}),
          ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}),
        };
      });
      // The cursor resumes after the last key returned, as the D1 store's does.
      return matching.length > limit
        ? { keys, list_complete: false, cursor: page.at(-1)! }
        : { keys, list_complete: true };
    },
  };
  return store;
}

/** The migrations, read once for every store the tests open. */
let migrations: ReturnType<typeof migrationFiles> | undefined;

/** The D1 store over node:sqlite, also giving its database (opened on first use). */
export interface SqliteOAuthStore extends TestOAuthStore {
  /** The database, with every migration applied; opened by the first call that needs it. */
  db(): SqliteDb;
}

/**
 * The Worker's D1 store over an in-memory node:sqlite database with every migration applied, opened
 * on first use, so that a test that never reaches the authorization server opens none.
 */
export function sqliteOAuthStore(): SqliteOAuthStore {
  let opened: SqliteDb | undefined;
  const db = (): SqliteDb => {
    opened ??= openDatabase({ migrations: (migrations ??= migrationFiles()) });
    return opened;
  };
  // The D1 store asks for a statement only when it is called, so the database opens then.
  const inner = d1OAuthStore({
    prepare: (sql) => db().prepare(sql),
    batch: (statements) => db().batch(statements),
  });
  return {
    kind: "sqlite",
    db,
    get: (key, options) => inner.get(key, options),
    put: (key, value, options) => inner.put(key, value, options),
    delete: (key) => inner.delete(key),
    list: (options) => inner.list(options),
    keys: () =>
      opened === undefined
        ? []
        : opened.raw
            .prepare(
              "SELECT key FROM oauth_store WHERE expires_at IS NULL OR expires_at > ? ORDER BY key",
            )
            .all(Date.now() / 1000)
            .map((row) => String(row.key)),
    written: () =>
      (opened?.queries ?? [])
        .filter((query) => /^\s*INSERT INTO oauth_store\b/.test(query.sql))
        .flatMap((query) =>
          query.values.filter((value): value is string => typeof value === "string"),
        ),
  };
}

/** The store a harness gives the Worker: the D1 one over node:sqlite where Node has it. */
export function testOAuthStore(): TestOAuthStore {
  return sqliteAvailable ? sqliteOAuthStore() : memoryOAuthStore();
}
