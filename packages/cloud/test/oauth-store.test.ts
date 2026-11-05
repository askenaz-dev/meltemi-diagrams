// The authorization server's store (`src/oauth/store.ts`, migration 0010): the part of a KV
// namespace's interface that `@cloudflare/workers-oauth-provider` uses, with KV's semantics, over D1.
// The contract runs over the D1 store on node:sqlite and over the in-memory store the harness falls
// back to; then what only the D1 store has (its rows, its refusals, its cursor, how much a page
// reads, the cron's sweep) and the Worker's entry handing the library a store over its own `DB`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_LIST_LIMIT,
  d1OAuthStore,
  prefixEnd,
  sweepOAuthStore,
  type KVLike,
} from "../src/oauth/store.js";
import worker from "../src/worker-handler.js";
import { testEnv } from "./support/index.js";
import { memoryOAuthStore, sqliteOAuthStore, type TestOAuthStore } from "./support/kv.js";
import { openDatabase, sqliteAvailable, type SqliteDb } from "./support/sqlite.js";

const T = "2026-11-05T12:00:00.000Z";
/** `T` in seconds since 1970, as KV writes an expiry. */
const T_S = Date.parse(T) / 1000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(T) });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Moves the clock the store and the library read. */
const advance = (ms: number) => vi.setSystemTime(Date.now() + ms);

/** Every key of a listing followed to its end, page by page, `limit` at a time. */
async function listAll(
  store: KVLike,
  options: { prefix?: string; limit?: number } = {},
): Promise<{ names: string[]; pages: number }> {
  const names: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await store.list({ ...options, ...(cursor !== undefined ? { cursor } : {}) });
    pages++;
    names.push(...page.keys.map((key) => key.name));
    expect(page.list_complete).toBe(page.cursor === undefined);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor !== undefined);
  return { names, pages };
}

function defineContract(name: string, make: () => TestOAuthStore, skip = false): void {
  describe.skipIf(skip)(`the authorization server's store: ${name}`, () => {
    describe("get, put and delete", () => {
      it("reads what was written as text by default, as text or JSON when asked; null when absent", async () => {
        const store = make();
        await store.put("client:a", '{"clientId":"a","redirectUris":["x"]}');
        expect(await store.get("client:a")).toBe('{"clientId":"a","redirectUris":["x"]}');
        expect(await store.get("client:a", "text")).toBe('{"clientId":"a","redirectUris":["x"]}');
        expect(await store.get("client:a", { type: "text" })).toBe(
          '{"clientId":"a","redirectUris":["x"]}',
        );
        expect(await store.get("client:a", { type: "json" })).toEqual({
          clientId: "a",
          redirectUris: ["x"],
        });
        expect(await store.get("client:a", "json")).toEqual({ clientId: "a", redirectUris: ["x"] });
        expect(await store.get("client:b")).toBeNull();
        expect(await store.get("client:b", { type: "json" })).toBeNull();
      });

      it("replaces the whole entry on a put: value, expiry and metadata", async () => {
        const store = make();
        await store.put("grant:u:g", "one", { expirationTtl: 600, metadata: { clientId: "c" } });
        await store.put("grant:u:g", "two");
        expect(await store.get("grant:u:g")).toBe("two");
        // The second put had no expiry: the entry outlives the first one's.
        advance(601_000);
        expect(await store.get("grant:u:g")).toBe("two");
        expect((await store.list({ prefix: "grant:" })).keys).toEqual([{ name: "grant:u:g" }]);
      });

      it("deletes an entry, and deleting one that is not there is not an error", async () => {
        const store = make();
        await store.put("token:u:g:1", "x");
        await store.delete("token:u:g:1");
        expect(await store.get("token:u:g:1")).toBeNull();
        await expect(store.delete("token:u:g:1")).resolves.toBeUndefined();
        await expect(store.delete("never")).resolves.toBeUndefined();
        expect(store.keys()).toEqual([]);
      });
    });

    describe("expiry", () => {
      it("by TTL: there until the TTL has passed, then absent from get and list", async () => {
        const store = make();
        await store.put("token:u:g:1", "x", { expirationTtl: 3600 });
        advance(3600_000 - 1);
        expect(await store.get("token:u:g:1")).toBe("x");
        expect((await store.list({ prefix: "token:" })).keys).toEqual([
          { name: "token:u:g:1", expiration: T_S + 3600 },
        ]);
        advance(1);
        expect(await store.get("token:u:g:1")).toBeNull();
        expect(await store.get("token:u:g:1", { type: "json" })).toBeNull();
        expect(await store.list({ prefix: "token:" })).toEqual({ keys: [], list_complete: true });
        expect(store.keys()).toEqual([]);
      });

      it("by absolute expiration: there before that second, absent from it on", async () => {
        const store = make();
        await store.put("grant:u:g", "x", { expiration: T_S + 120, metadata: { clientId: "c" } });
        expect((await store.list()).keys).toEqual([
          { name: "grant:u:g", expiration: T_S + 120, metadata: { clientId: "c" } },
        ]);
        advance(119_999);
        expect(await store.get("grant:u:g")).toBe("x");
        advance(1);
        expect(await store.get("grant:u:g")).toBeNull();
        expect((await store.list()).keys).toEqual([]);
      });

      it("an expired entry written again lives again", async () => {
        const store = make();
        await store.put("transaction:h", "a", { expirationTtl: 60 });
        advance(60_000);
        expect(await store.get("transaction:h")).toBeNull();
        await store.put("transaction:h", "b", { expirationTtl: 60 });
        expect(await store.get("transaction:h")).toBe("b");
      });
    });

    describe("metadata", () => {
      it("is answered by list as written, and a key written without any has none", async () => {
        const store = make();
        const metadata = {
          clientId: "c1",
          resource: "https://diagrams.meltemi.dev/mcp",
          redirectUri: "http://127.0.0.1:1455/callback",
        };
        await store.put("grant:u:g1", "{}", { metadata });
        await store.put("grant:u:g2", "{}");
        await store.put("grant:u:g3", "{}", { metadata: { nested: { list: [1, "two", null] } } });
        expect((await store.list({ prefix: "grant:u:" })).keys).toEqual([
          { name: "grant:u:g1", metadata },
          { name: "grant:u:g2" },
          { name: "grant:u:g3", metadata: { nested: { list: [1, "two", null] } } },
        ]);
        // The value is not the metadata: get answers the value alone.
        expect(await store.get("grant:u:g1", { type: "json" })).toEqual({});
      });
    });

    describe("list", () => {
      it("lists by prefix, in key order, whatever the order of the writes", async () => {
        const store = make();
        for (const key of [
          "token:u:g2:b",
          "grant:u:g2",
          "client:z",
          "token:u:g1:a",
          "grant:u:g1",
          "grant:u2:g",
          "grant:",
          "grant;x",
          "grants",
          "client:a",
        ]) {
          await store.put(key, "v");
        }
        const names = async (prefix?: string) =>
          (await store.list(prefix === undefined ? {} : { prefix })).keys.map((key) => key.name);
        expect(await names("grant:u:")).toEqual(["grant:u:g1", "grant:u:g2"]);
        expect(await names("grant:")).toEqual(["grant:", "grant:u2:g", "grant:u:g1", "grant:u:g2"]);
        expect(await names("token:u:g1:")).toEqual(["token:u:g1:a"]);
        expect(await names("client:")).toEqual(["client:a", "client:z"]);
        expect(await names("nothing:")).toEqual([]);
        expect(await names()).toEqual([
          "client:a",
          "client:z",
          "grant:",
          "grant:u2:g",
          "grant:u:g1",
          "grant:u:g2",
          "grant;x",
          "grants",
          "token:u:g1:a",
          "token:u:g2:b",
        ]);
        expect(await names("")).toEqual(await names());
      });

      it("orders by UTF-8 bytes, as KV does, and a prefix is matched exactly, case and all", async () => {
        const store = make();
        for (const key of ["k:é", "k:z", "k:Z", "k:€", "k:a", "k:😀", "k:\uffee", "K:a", "k"]) {
          await store.put(key, "v");
        }
        expect((await store.list({ prefix: "k:" })).keys.map((key) => key.name)).toEqual([
          "k:Z",
          "k:a",
          "k:z",
          "k:é",
          "k:€",
          "k:\uffee",
          "k:😀",
        ]);
        expect((await store.list({ prefix: "k:é" })).keys.map((key) => key.name)).toEqual(["k:é"]);
        expect((await store.list({ prefix: "K" })).keys.map((key) => key.name)).toEqual(["K:a"]);
      });

      it("pages by limit with a cursor that resumes after the last key returned", async () => {
        const store = make();
        for (let i = 0; i < 25; i++)
          await store.put(`token:u:g:${String(i).padStart(2, "0")}`, "v");
        await store.put("zzz", "v");
        const first = await store.list({ prefix: "token:", limit: 10 });
        expect(first.keys.map((key) => key.name)).toEqual(
          Array.from({ length: 10 }, (_, i) => `token:u:g:${String(i).padStart(2, "0")}`),
        );
        expect(first.list_complete).toBe(false);
        expect(typeof first.cursor).toBe("string");
        const second = await store.list({ prefix: "token:", limit: 10, cursor: first.cursor! });
        expect(second.keys.map((key) => key.name)[0]).toBe("token:u:g:10");
        const { names, pages } = await listAll(store, { prefix: "token:", limit: 10 });
        expect(pages).toBe(3);
        expect(names).toHaveLength(25);
        expect(names).toEqual([...names].sort());
        // A page that ends exactly at the last key is complete.
        const exact = await store.list({ prefix: "token:", limit: 25 });
        expect(exact.keys).toHaveLength(25);
        expect(exact).toMatchObject({ list_complete: true });
        expect(exact.cursor).toBeUndefined();
      });

      it("skips nothing when the keys already listed are deleted between pages (revoking a grant)", async () => {
        const store = make();
        for (let i = 0; i < 12; i++)
          await store.put(`token:u:g:${String(i).padStart(2, "0")}`, "v");
        let cursor: string | undefined;
        const seen: string[] = [];
        do {
          const page = await store.list({
            prefix: "token:u:g:",
            limit: 5,
            ...(cursor !== undefined ? { cursor } : {}),
          });
          for (const key of page.keys) {
            seen.push(key.name);
            await store.delete(key.name);
          }
          cursor = page.list_complete ? undefined : page.cursor;
        } while (cursor !== undefined);
        expect(seen).toHaveLength(12);
        expect(store.keys()).toEqual([]);
      });

      it("lists 1000 keys by default and at most 1000 whatever the limit", async () => {
        const store = make();
        for (let i = 0; i < MAX_LIST_LIMIT + 5; i++) {
          await store.put(`client:${String(i).padStart(4, "0")}`, "v");
        }
        const byDefault = await store.list({ prefix: "client:" });
        expect(byDefault.keys).toHaveLength(MAX_LIST_LIMIT);
        expect(byDefault.list_complete).toBe(false);
        const capped = await store.list({ prefix: "client:", limit: 5000 });
        expect(capped.keys).toHaveLength(MAX_LIST_LIMIT);
        const rest = await store.list({ prefix: "client:", cursor: capped.cursor! });
        expect(rest.keys.map((key) => key.name)).toEqual([
          "client:1000",
          "client:1001",
          "client:1002",
          "client:1003",
          "client:1004",
        ]);
        expect(rest.list_complete).toBe(true);
      });

      it("leaves out the entries that expired, and an expired key does not count to the limit", async () => {
        const store = make();
        await store.put("token:a", "v", { expirationTtl: 60 });
        await store.put("token:b", "v");
        await store.put("token:c", "v", { expirationTtl: 60 });
        await store.put("token:d", "v");
        advance(60_000);
        expect(await store.list({ prefix: "token:", limit: 2 })).toEqual({
          keys: [{ name: "token:b" }, { name: "token:d" }],
          list_complete: true,
        });
      });
    });
  });
}

defineContract("D1 over node:sqlite", sqliteOAuthStore, !sqliteAvailable);
defineContract("in memory", memoryOAuthStore);

describe.skipIf(!sqliteAvailable)("the D1 store", () => {
  let db: SqliteDb;
  let store: KVLike;
  beforeEach(() => {
    db = openDatabase();
    store = d1OAuthStore(db);
  });
  afterEach(() => db.close());

  const rows = () =>
    db.raw
      .prepare("SELECT key, value, expires_at, metadata FROM oauth_store ORDER BY key")
      .all()
      .map((row) => ({ ...row }));

  it("keeps one row per key: expiry in whole seconds since 1970, metadata as JSON", async () => {
    await store.put("token:u:g:1", "{}", { expirationTtl: 3600 });
    await store.put("grant:u:g", "{}", {
      expiration: T_S + 30 * 86400,
      metadata: { clientId: "c" },
    });
    await store.put("client:c", "{}");
    // A fraction of a second is not kept: KV's expiries are whole seconds.
    advance(500);
    await store.put("transaction:h", "{}", { expirationTtl: 600 });
    expect(rows()).toEqual([
      { key: "client:c", value: "{}", expires_at: null, metadata: null },
      { key: "grant:u:g", value: "{}", expires_at: T_S + 30 * 86400, metadata: '{"clientId":"c"}' },
      { key: "token:u:g:1", value: "{}", expires_at: T_S + 3600, metadata: null },
      { key: "transaction:h", value: "{}", expires_at: T_S + 600, metadata: null },
    ]);
  });

  it("never writes on a read: an expired row stays until the sweep", async () => {
    await store.put("token:a", "v", { expirationTtl: 60 });
    advance(60_000);
    const before = db.queries.length;
    expect(await store.get("token:a")).toBeNull();
    expect((await store.list()).keys).toEqual([]);
    expect(db.queries.slice(before).map((query) => query.sql)).toEqual([
      expect.stringMatching(/^SELECT value FROM oauth_store /),
      expect.stringMatching(/^SELECT key, expires_at, metadata FROM oauth_store /),
    ]);
    expect(rows()).toHaveLength(1);
  });

  it("reads a page's keys and one more, by the primary key's range", async () => {
    for (let i = 0; i < 30; i++) await store.put(`grant:u:${String(i).padStart(2, "0")}`, "v");
    for (let i = 0; i < 30; i++) await store.put(`token:u:${String(i).padStart(2, "0")}`, "v");
    const before = db.queries.length;
    await store.list({ prefix: "grant:u:", limit: 10 });
    const [query] = db.queries.slice(before);
    expect(query?.sql).toMatch(/WHERE key >= \? AND key < \? AND .* ORDER BY key LIMIT \?$/);
    expect(query?.values[0]).toBe("grant:u:");
    expect(query?.values[1]).toBe("grant:u;");
    expect(query?.values.at(-1)).toBe(11);
    const plan = db.raw
      .prepare(`EXPLAIN QUERY PLAN ${query!.sql}`)
      .all(...query!.values)
      .map((row) => String(row.detail))
      .join("\n");
    expect(plan).toMatch(/SEARCH oauth_store USING PRIMARY KEY \(key>\? AND key<\?\)/);
  });

  it("gives a cursor that names no key in clear, and refuses one it did not make", async () => {
    for (const key of ["token:u:g:secret-1", "token:u:g:secret-2"]) await store.put(key, "v");
    const page = await store.list({ prefix: "token:", limit: 1 });
    expect(page.cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(page.cursor).not.toContain("secret");
    for (const cursor of ["not a cursor!", "%%%", "_w"]) {
      await expect(store.list({ cursor })).rejects.toThrow(/invalid cursor/);
    }
  });

  it("refuses what KV refuses, naming no key or value", async () => {
    const refusals: [string, () => Promise<unknown>, RegExp][] = [
      ["an empty key", () => store.put("", "v"), /key of text, not empty/],
      ["a key over 512 bytes", () => store.put("é".repeat(257), "v"), /512 bytes at most/],
      ["a value that is not text", () => store.put("k", 1 as unknown as string), /text only/],
      [
        "metadata over 1024 bytes",
        () => store.put("k", "v", { metadata: { x: "m".repeat(1100) } }),
        /1024 bytes at most/,
      ],
      [
        "an expiry that is no number",
        () => store.put("k", "v", { expirationTtl: Number.NaN }),
        /expiry/,
      ],
      [
        "a read of bytes",
        () => store.get("k", { type: "arrayBuffer" } as unknown as { type: "text" }),
        /text or JSON/,
      ],
      ["a limit under one", () => store.list({ limit: 0 }), /at least one key/],
      ["a limit that is not whole", () => store.list({ limit: 2.5 }), /at least one key/],
    ];
    for (const [label, call, message] of refusals) {
      await expect(call(), label).rejects.toThrow(message);
    }
    // A key of 512 bytes is taken (256 two-byte characters).
    await store.put("é".repeat(256), "v");
    expect(rows()).toHaveLength(1);
  });

  it("sweeps the rows that expired by now, and only those, by the expiry index", async () => {
    await store.put("token:a", "v", { expirationTtl: 60 });
    await store.put("token:b", "v", { expirationTtl: 3600 });
    await store.put("client:c", "v");
    advance(60_000);
    expect(await sweepOAuthStore(db)).toBe(1);
    expect(rows().map((row) => row.key)).toEqual(["client:c", "token:b"]);
    expect(await sweepOAuthStore(db, Date.now() + 3600_000)).toBe(1);
    expect(rows().map((row) => row.key)).toEqual(["client:c"]);
    const plan = db.raw
      .prepare("EXPLAIN QUERY PLAN DELETE FROM oauth_store WHERE expires_at <= ?")
      .all(T_S)
      .map((row) => String(row.detail))
      .join("\n");
    expect(plan).toMatch(/oauth_store_expires_at/);
  });

  it("reads the clock it is given", async () => {
    let now = Date.parse(T);
    const clocked = d1OAuthStore(db, () => now);
    await clocked.put("token:a", "v", { expirationTtl: 60 });
    now += 60_000;
    expect(await clocked.get("token:a")).toBeNull();
    // The default clock is Date's, which has not moved.
    expect(await store.get("token:a")).toBe("v");
  });
});

describe("the end of a prefix's range", () => {
  it("is the prefix with its last code point grown by one", () => {
    expect(prefixEnd("grant:u:")).toBe("grant:u;");
    expect(prefixEnd("a")).toBe("b");
    expect(prefixEnd("k:é")).toBe("k:ê");
    expect(prefixEnd("x\ud7ff")).toBe("x\ue000");
    expect(prefixEnd("x\u{10ffff}")).toBe("y");
    expect(prefixEnd("\u{10ffff}")).toBeUndefined();
    expect(prefixEnd("")).toBeUndefined();
  });
});

describe.skipIf(!sqliteAvailable)("the Worker's entry", () => {
  it("hands the library a store over its own DB: a registered client is a row of oauth_store", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const db = openDatabase();
    const response = await worker.fetch(
      new Request("https://diagrams.meltemi.dev/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" },
        body: JSON.stringify({
          client_name: "Codex",
          redirect_uris: ["http://127.0.0.1:1455/callback"],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        }),
      }),
      testEnv({ DB: db }),
    );
    expect(response.status).toBe(201);
    const { client_id: clientId } = (await response.json()) as { client_id: string };
    const stored = db.raw.prepare("SELECT key, value, expires_at FROM oauth_store").all();
    expect(stored).toEqual([
      { key: `client:${clientId}`, value: expect.any(String), expires_at: expect.any(Number) },
    ]);
    // A registration lasts as long as the library says (its TTL), which the row's expiry keeps.
    const client = JSON.parse(String(stored[0]?.value)) as {
      clientId: string;
      registrationExpiresAt: number;
    };
    expect(client.clientId).toBe(clientId);
    expect(stored[0]?.expires_at).toBe(client.registrationExpiresAt);
    expect(client.registrationExpiresAt).toBeGreaterThan(T_S);
    db.close();
  });

  it("sweeps the authorization server's expired entries with the weekly cron", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const db = openDatabase();
    const store = d1OAuthStore(db);
    await store.put("token:u:g:1", "v", { expirationTtl: 3600 });
    await store.put("token:u:g:2", "v", { expirationTtl: 7200 });
    advance(3600_000);
    await worker.scheduled({ scheduledTime: Date.now() }, testEnv({ DB: db }));
    expect(
      db.raw
        .prepare("SELECT key FROM oauth_store")
        .all()
        .map((row) => row.key),
    ).toEqual(["token:u:g:2"]);
    db.close();
  });
});
