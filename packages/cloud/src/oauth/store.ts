// The authorization server's store (`mcp-authorization`): the part of a KV namespace's interface that
// `@cloudflare/workers-oauth-provider` uses, over the D1 table `oauth_store` (migration 0010). The
// library reads `env.OAUTH_KV`; `provider.ts` hands it this object under that name, so the Worker
// binds no KV namespace at all.
//
// What the library calls (1.2.3, the same in 1.2.4): `get(key)` and `get(key, { type: "json" })`;
// `put(key, value)` with `expirationTtl` (tokens, codes, consent transactions, replay markers,
// registrations), `expiration` (a grant with a refresh token's end) or neither, each grant with
// `metadata`; `delete(key)`; and `list({ prefix, cursor?, limit? })`, reading `keys` (`name`,
// `metadata`), `list_complete` and `cursor`. Those are implemented with KV's semantics: an expired
// entry is absent from `get` and `list`, a `put` replaces the whole entry (value, expiry and
// metadata), `delete` of a key that is not there is not an error, `list` is in key order (UTF-8
// bytes, as KV's and SQLite's), `limit` is 1000 by default and at most, and the cursor resumes after
// the last key returned, so the deletes the library makes between pages skip nothing.
//
// Two differences from KV, neither visible to the library: the store is strongly consistent (a
// write is read back at once, everywhere), and it has no 60-second floor on an expiry (the library
// never asks for less). An expired row is never deleted by a read, which would make every read a
// write: the scheduled cron removes them (`sweepOAuthStore`, `worker-handler.ts`).
//
// Nothing here logs, and no error names a key, a value or a cursor: a key holds a hash of a token.

import type { D1Like } from "../env.js";

/** A key of a listing, with the expiry and metadata it was written with. */
export interface KVListedKeyLike {
  readonly name: string;
  /** Seconds since 1970 after which the entry is gone; absent when it never expires. */
  readonly expiration?: number;
  /** The metadata it was written with, parsed; absent when it was written with none. */
  readonly metadata?: unknown;
}

/** A page of a listing. */
export interface KVListLike {
  readonly keys: readonly KVListedKeyLike[];
  readonly list_complete: boolean;
  /** Where the next page starts: present while `list_complete` is false. */
  readonly cursor?: string;
}

export interface KVPutOptionsLike {
  /** When the entry is gone, in seconds since 1970. */
  readonly expiration?: number;
  /** How long the entry lives, in seconds from now (`expiration` wins when both are given). */
  readonly expirationTtl?: number;
  /** Kept beside the key and answered by `list`: JSON of at most 1024 bytes. */
  readonly metadata?: unknown;
}

export interface KVListOptionsLike {
  readonly prefix?: string;
  readonly cursor?: string;
  /** At most this many keys (1000 by default, and at most). */
  readonly limit?: number;
}

/**
 * The KV surface the authorization server's library uses. The D1 store below satisfies it, and so
 * does the in-memory namespace of the tests.
 */
export interface KVLike {
  get(
    key: string,
    options?: { readonly type?: "text" | "json" } | "text" | "json",
  ): Promise<unknown>;
  put(key: string, value: string, options?: KVPutOptionsLike): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: KVListOptionsLike): Promise<KVListLike>;
}

/** The most keys a page of a listing holds, and how many it holds when no limit is given. */
export const MAX_LIST_LIMIT = 1000;
/** The longest key, in UTF-8 bytes, as KV's. */
export const MAX_KEY_BYTES = 512;
/** The most metadata a key carries, as JSON in UTF-8 bytes, as KV's. */
export const MAX_METADATA_BYTES = 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

const GET =
  "SELECT value FROM oauth_store WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)";
const PUT =
  "INSERT INTO oauth_store (key, value, expires_at, metadata) VALUES (?, ?, ?, ?) " +
  "ON CONFLICT (key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at, " +
  "metadata = excluded.metadata";
const DELETE = "DELETE FROM oauth_store WHERE key = ?";
const SWEEP = "DELETE FROM oauth_store WHERE expires_at <= ?";

/** A key as KV takes it: text of one to 512 bytes. */
function checkKey(key: unknown): string {
  if (typeof key !== "string" || key === "") {
    throw new TypeError("the authorization server's store takes a key of text, not empty");
  }
  if (encoder.encode(key).byteLength > MAX_KEY_BYTES) {
    throw new TypeError(
      `the authorization server's store takes a key of ${MAX_KEY_BYTES} bytes at most`,
    );
  }
  return key;
}

/** The expiry of an entry being written, in whole seconds since 1970, or null for none. */
function expiryOf(options: KVPutOptionsLike, nowMs: number): number | null {
  const { expiration, expirationTtl } = options;
  for (const value of [expiration, expirationTtl]) {
    if (value !== undefined && !Number.isFinite(value)) {
      throw new TypeError("the authorization server's store takes an expiry in seconds");
    }
  }
  if (expiration !== undefined) return Math.floor(expiration);
  if (expirationTtl !== undefined) return Math.floor(nowMs / 1000 + expirationTtl);
  return null;
}

/** The metadata of an entry being written, as JSON, or null for none. */
function metadataOf(metadata: unknown): string | null {
  if (metadata === undefined) return null;
  const text = JSON.stringify(metadata) as string | undefined;
  if (text === undefined) {
    throw new TypeError("the authorization server's store takes metadata that serialises to JSON");
  }
  if (encoder.encode(text).byteLength > MAX_METADATA_BYTES) {
    throw new TypeError(
      `the authorization server's store takes metadata of ${MAX_METADATA_BYTES} bytes at most`,
    );
  }
  return text;
}

/** A listing's limit: 1000 when none is given, at most 1000, and a whole number from one. */
function limitOf(limit: number | undefined): number {
  if (limit === undefined) return MAX_LIST_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError("the authorization server's store lists at least one key at a time");
  }
  return Math.min(limit, MAX_LIST_LIMIT);
}

/** The cursor that resumes a listing after `key`: the key's UTF-8 bytes in base64url, opaque. */
function cursorOf(key: string): string {
  let binary = "";
  for (const byte of encoder.encode(key)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The key a cursor resumes after; a cursor this store did not make is an error. */
function keyOfCursor(cursor: string): string {
  const invalid = () =>
    new TypeError("the authorization server's store was given an invalid cursor");
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw invalid();
  let binary: string;
  try {
    binary = atob(cursor.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    throw invalid();
  }
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  try {
    return checkKey(decoder.decode(bytes));
  } catch {
    throw invalid();
  }
}

/**
 * The least text greater than every text that starts with `prefix`, in code point order (which is
 * UTF-8's byte order, and SQLite's): the prefix with its last code point that can grow grown by one
 * and what follows it dropped. Undefined when nothing is greater (no such code point).
 */
export function prefixEnd(prefix: string): string | undefined {
  const points = Array.from(prefix, (char) => char.codePointAt(0) ?? 0);
  for (let i = points.length - 1; i >= 0; i--) {
    let next = (points[i] ?? 0) + 1;
    // The surrogates are no code points of text: after U+D7FF comes U+E000.
    if (next >= 0xd800 && next <= 0xdfff) next = 0xe000;
    if (next <= 0x10ffff) return String.fromCodePoint(...points.slice(0, i), next);
  }
  return undefined;
}

interface Listed {
  readonly key: string;
  readonly expires_at: number | null;
  readonly metadata: string | null;
}

/**
 * The authorization server's store over D1: `oauth_store` (migration 0010) with the KV surface the
 * library uses. `now` is the clock in milliseconds; it is `Date.now` by default, the clock the
 * library reads, so that a token the library thinks expired is gone from the store at the same
 * moment.
 */
export function d1OAuthStore(db: D1Like, now: () => number = () => Date.now()): KVLike {
  /** Now in seconds since 1970: an entry is live while its `expires_at` is after it. */
  const nowSeconds = () => now() / 1000;
  return {
    async get(key, options) {
      const type = typeof options === "string" ? options : (options?.type ?? "text");
      if (type !== "text" && type !== "json") {
        throw new TypeError("the authorization server's store reads text or JSON");
      }
      const row = await db
        .prepare(GET)
        .bind(checkKey(key), nowSeconds())
        .first<{ value: string }>();
      if (!row) return null;
      return type === "json" ? (JSON.parse(row.value) as unknown) : row.value;
    },

    async put(key, value, options = {}) {
      if (typeof value !== "string") {
        throw new TypeError("the authorization server's store keeps text only");
      }
      await db
        .prepare(PUT)
        .bind(checkKey(key), value, expiryOf(options, now()), metadataOf(options.metadata))
        .run();
    },

    async delete(key) {
      await db.prepare(DELETE).bind(checkKey(key)).run();
    },

    async list(options = {}) {
      const prefix = options.prefix ?? "";
      if (typeof prefix !== "string") {
        throw new TypeError("the authorization server's store lists by a prefix of text");
      }
      const limit = limitOf(options.limit);
      const after =
        options.cursor === undefined || options.cursor === ""
          ? undefined
          : keyOfCursor(options.cursor);
      const end = prefix === "" ? undefined : prefixEnd(prefix);
      // The prefix as a range of the primary key, so a page reads its own rows and one more (which
      // tells whether the listing is complete) and no others.
      const where = ["key >= ?"];
      const values: unknown[] = [prefix];
      if (end !== undefined) {
        where.push("key < ?");
        values.push(end);
      }
      if (after !== undefined) {
        where.push("key > ?");
        values.push(after);
      }
      where.push("(expires_at IS NULL OR expires_at > ?)");
      values.push(nowSeconds(), limit + 1);
      const { results } = await db
        .prepare(
          `SELECT key, expires_at, metadata FROM oauth_store WHERE ${where.join(" AND ")} ORDER BY key LIMIT ?`,
        )
        .bind(...values)
        .all<Listed>();
      const page = results.slice(0, limit);
      const keys: KVListedKeyLike[] = page.map((row) => ({
        name: row.key,
        ...(row.expires_at !== null ? { expiration: Number(row.expires_at) } : {}),
        ...(row.metadata !== null ? { metadata: JSON.parse(row.metadata) as unknown } : {}),
      }));
      const last = page.at(-1);
      return results.length > limit && last
        ? { keys, list_complete: false, cursor: cursorOf(last.key) }
        : { keys, list_complete: true };
    },
  };
}

/**
 * Removes the entries that expired by `now` (milliseconds; `Date.now()` by default), by the index
 * made for it; answers how many. The scheduled cron calls it (`worker-handler.ts`): reads leave expired
 * rows in place, invisible, so that a read is never a write.
 */
export async function sweepOAuthStore(db: D1Like, now: number = Date.now()): Promise<number> {
  const result = await db
    .prepare(SWEEP)
    .bind(now / 1000)
    .run();
  return result.meta?.changes ?? 0;
}
