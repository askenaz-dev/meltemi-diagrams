// A KV namespace in memory, for the authorization server's library (`OAUTH_KV`): `get` (text or
// JSON), `put` with an expiry and metadata, `delete` and `list` by prefix in key order with a cursor,
// as the binding answers them. An entry expires by `Date.now()`, the clock the library reads, so a
// test that moves the system time moves the namespace's too.

import type { KVLike, KVListedKeyLike } from "../../src/env.js";

interface Entry {
  readonly value: string;
  /** Seconds since 1970 after which the entry is gone. */
  readonly expiration?: number;
  readonly metadata?: unknown;
}

export interface FakeKV extends KVLike {
  /** The keys held now, expired ones left out, in order. */
  keys(): string[];
  /** Every value written, in order, for a test that looks for what must never be stored. */
  readonly written: string[];
}

export function fakeKV(): FakeKV {
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
  const kv: FakeKV = {
    written,
    keys: () => [...entries.keys()].filter((key) => live(key) !== undefined).sort(),
    async get(key, options) {
      const entry = live(key);
      if (!entry) return null;
      const type = typeof options === "string" ? options : options?.type;
      return type === "json" ? (JSON.parse(entry.value) as unknown) : entry.value;
    },
    async put(key, value, options = {}) {
      if (typeof value !== "string") throw new TypeError("the fake KV keeps text only");
      written.push(value);
      const expiration =
        options.expiration ??
        (options.expirationTtl !== undefined ? now() + options.expirationTtl : undefined);
      entries.set(key, {
        value,
        ...(expiration !== undefined ? { expiration } : {}),
        ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
      });
    },
    async delete(key) {
      entries.delete(key);
    },
    async list(options = {}) {
      const prefix = options.prefix ?? "";
      const limit = Math.min(options.limit ?? 1000, 1000);
      const start = options.cursor === undefined ? 0 : Number(options.cursor);
      const matching = kv.keys().filter((key) => key.startsWith(prefix));
      const page = matching.slice(start, start + limit);
      const keys: KVListedKeyLike[] = page.map((name) => {
        const entry = entries.get(name)!;
        return {
          name,
          ...(entry.expiration !== undefined ? { expiration: Math.floor(entry.expiration) } : {}),
          ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}),
        };
      });
      const complete = start + limit >= matching.length;
      return complete
        ? { keys, list_complete: true }
        : { keys, list_complete: false, cursor: String(start + limit) };
    },
  };
  return kv;
}
