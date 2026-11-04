// API tokens: `POST`, `GET` and `DELETE /api/tokens`, and a token at work as a bearer.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { harness, jsonOf, type Harness } from "./support/index.js";

interface Created {
  id: string;
  name: string;
  token: string;
}

interface Listed {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

const JSON_TYPE = { "Content-Type": "application/json" };
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------------------------
// Ways to ask.

/** A request init that carries the person's session cookie. */
function asCookie(cookie: string, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("Cookie", cookie);
  return { ...init, headers };
}

/** A request init that carries an API token as a bearer, with no cookie and no `Origin`. */
function asBearer(token: string, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

/** `POST /api/tokens` as the page does it: the cookie and this service's own `Origin`. */
function create(h: Harness, cookie: string, body: unknown): Promise<Response> {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return h.request(
    "/api/tokens",
    h.fromPage(cookie, { method: "POST", headers: JSON_TYPE, body: text }),
  );
}

/** Makes a token and returns what the answer holds. */
async function made(h: Harness, cookie: string, name = "laptop"): Promise<Created> {
  const response = await create(h, cookie, { name });
  expect(response.status, await response.clone().text()).toBe(201);
  return jsonOf<Created>(response);
}

/** `DELETE /api/tokens/:id` as the page does it. */
function revoke(h: Harness, cookie: string, id: string): Promise<Response> {
  return h.request(
    `/api/tokens/${encodeURIComponent(id)}`,
    h.fromPage(cookie, { method: "DELETE" }),
  );
}

/** The tokens `GET /api/tokens` lists for whoever the init is. */
async function listed(h: Harness, init: RequestInit): Promise<Listed[]> {
  const response = await h.request("/api/tokens", init);
  expect(response.status, await response.clone().text()).toBe(200);
  return (await jsonOf<{ tokens: Listed[] }>(response)).tokens;
}

/** The SHA-256 of a token as the store keeps it, made here with Node rather than the Worker. */
function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// ---------------------------------------------------------------------------------------------

describe("POST /api/tokens", () => {
  it("answers 201 with the id, the name and the token, kept out of every cache, and nothing else", async () => {
    const h = await harness();
    const ana = await h.signedIn();

    const response = await create(h, ana.cookie, { name: "laptop" });

    expect(response.status).toBe(201);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await jsonOf<Created>(response);
    expect(Object.keys(body).sort()).toEqual(["id", "name", "token"]);
    expect(body.name).toBe("laptop");
  });

  it("makes the token 'mdg_' and 32 random bytes in base64url, and the id 16 random bytes in hex", async () => {
    const h = await harness();
    h.deps.randomBytes = (length) => Uint8Array.from({ length }, (_, i) => i);
    const ana = await h.signedIn();

    const body = await jsonOf<Created>(await create(h, ana.cookie, { name: "laptop" }));

    const thirtyTwo = Buffer.from(Uint8Array.from({ length: 32 }, (_, i) => i));
    expect(body.token).toBe(`mdg_${thirtyTwo.toString("base64url")}`);
    expect(body.id).toBe("000102030405060708090a0b0c0d0e0f");
  });

  it("gives every token the documented shape and a value of its own", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const tokens = new Set<string>();
    const ids = new Set<string>();

    for (let i = 1; i <= 20; i++) {
      const body = await made(h, ana.cookie, `token ${i}`);
      expect(body.token).toMatch(/^mdg_[A-Za-z0-9_-]{43}$/);
      expect(body.id).toMatch(/^[0-9a-f]{32}$/);
      tokens.add(body.token);
      ids.add(body.id);
    }

    expect(tokens.size).toBe(20);
    expect(ids.size).toBe(20);
  });

  it("stores only the SHA-256 of the token, never the token or a piece of it", async () => {
    const h = await harness();
    const ana = await h.signedIn();

    const { id, name, token } = await made(h, ana.cookie, "laptop");

    const rows = await h.store.tokensOf(ana.sub);
    expect(rows).toEqual([
      {
        id,
        sub: ana.sub,
        name,
        hash: sha256(token),
        createdAt: "2026-10-14T12:00:00.000Z",
        lastUsedAt: null,
      },
    ]);
    const stored = JSON.stringify(rows);
    expect(stored).not.toContain(token);
    expect(stored).not.toContain(token.slice("mdg_".length));
    expect(await h.store.tokenByHash(sha256(token))).toMatchObject({ id, sub: ana.sub });
    expect(await h.store.tokenByHash(token)).toBeUndefined();
  });

  it("shows the token once: the list and the session never show it again", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const { token } = await made(h, ana.cookie);

    const later = [
      await h.request("/api/tokens", asCookie(ana.cookie)),
      await h.request("/api/tokens", asBearer(token)),
      await h.request("/api/session", asCookie(ana.cookie)),
      await h.request("/api/session", asBearer(token)),
    ];

    for (const response of later) {
      const text = await response.text();
      expect(text).not.toContain(token);
      expect(text).not.toContain(token.slice("mdg_".length));
      expect(text).not.toContain(sha256(token));
    }
  });

  it("trims the name and keeps what remains", async () => {
    const h = await harness();
    const ana = await h.signedIn();

    const body = await jsonOf<Created>(await create(h, ana.cookie, { name: "  \t My laptop \n " }));

    expect(body.name).toBe("My laptop");
    expect((await h.store.tokensOf(ana.sub))[0]?.name).toBe("My laptop");
  });

  it.each([
    ["markup", "<img src=x onerror=alert(1)>"],
    ["quotes", `it's "mine"`],
    ["accents and other scripts", "portátil de José — 机器"],
    ["an emoji", "my laptop \u{1F4BB}"],
    ["a joined emoji", "\u{1F468}‍\u{1F469}‍\u{1F467}"],
    ["the look of a token", "mdg_abcdef"],
    ["runs of spaces inside", "a    b"],
  ])("keeps a name with %s as it was typed", async (_label, name) => {
    const h = await harness();
    const ana = await h.signedIn();

    const body = await jsonOf<Created>(await create(h, ana.cookie, { name }));

    expect(body.name).toBe(name);
    expect((await listed(h, asCookie(ana.cookie)))[0]?.name).toBe(name);
  });

  it("lets two tokens share a name", async () => {
    const h = await harness();
    const ana = await h.signedIn();

    const first = await made(h, ana.cookie, "CI");
    const second = await made(h, ana.cookie, "CI");

    expect(second.id).not.toBe(first.id);
    expect(second.token).not.toBe(first.token);
    expect(await listed(h, asCookie(ana.cookie))).toHaveLength(2);
  });

  it("ignores fields a client has no business choosing", async () => {
    const h = await harness();
    const ana = await h.signedIn();

    const response = await create(h, ana.cookie, {
      name: "laptop",
      id: "mine",
      token: "mdg_chosen",
      hash: "00",
      sub: "someone-else",
      createdAt: "2000-01-01T00:00:00.000Z",
      lastUsedAt: "2000-01-01T00:00:00.000Z",
    });

    expect(response.status).toBe(201);
    const body = await jsonOf<Created>(response);
    expect(body.id).not.toBe("mine");
    expect(body.token).not.toBe("mdg_chosen");
    expect(await h.store.tokensOf("someone-else")).toEqual([]);
    expect(await h.store.tokensOf(ana.sub)).toEqual([
      {
        id: body.id,
        sub: ana.sub,
        name: "laptop",
        hash: sha256(body.token),
        createdAt: "2026-10-14T12:00:00.000Z",
        lastUsedAt: null,
      },
    ]);
  });

  it("stamps the token with the time it was made", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    h.clock.advance(3 * DAY_MS + 4_567);

    const { id } = await made(h, ana.cookie);

    expect((await h.store.tokensOf(ana.sub)).find((row) => row.id === id)?.createdAt).toBe(
      "2026-10-17T12:00:04.567Z",
    );
  });
});

// ---------------------------------------------------------------------------------------------

describe("the name of a token", () => {
  const refused: [string, unknown][] = [
    ["an empty name", ""],
    ["spaces only", "     "],
    ["white space of every kind only", "\t\r\n   ﻿"],
    ["61 characters", "a".repeat(61)],
    ["61 characters between spaces", `  ${"a".repeat(61)}  `],
    ["61 emoji", "\u{1F4BB}".repeat(61)],
    ["61 characters, accented", "é".repeat(61)],
    ["a NUL inside", "bad\u0000name"],
    ["a tab inside", "bad\tname"],
    ["a line break inside", "bad\nname"],
    ["a carriage return inside", "bad\rname"],
    ["an escape character inside", "bad\u001bname"],
    ["a control character at the end", "name\u0001"],
    ["a DEL character", "bad\u007fname"],
    ["a C1 control character", "bad\u0085name"],
    ["a line separator", "bad name"],
    ["a paragraph separator", "bad name"],
    ["a lone high surrogate", "bad\ud800name"],
    ["a lone low surrogate", "bad\udc00name"],
    ["a number", 123],
    ["null", null],
    ["a boolean", true],
    ["an array", ["laptop"]],
    ["an object", { name: "laptop" }],
  ];

  it.each(refused)(
    "refuses %s with 400 request.invalid and makes nothing",
    async (_label, name) => {
      const h = await harness();
      const ana = await h.signedIn();

      const response = await create(h, ana.cookie, { name });

      expect(response.status).toBe(400);
      const body = await jsonOf<{ code: string; message: string }>(response);
      expect(body.code).toBe("request.invalid");
      expect(body.message).not.toBe("");
      expect(await h.store.tokensOf(ana.sub)).toEqual([]);
    },
  );

  it("refuses a body with no name at all", async () => {
    const h = await harness();
    const ana = await h.signedIn();

    for (const body of [{}, { Name: "laptop" }, { name: undefined }, { names: ["laptop"] }]) {
      const response = await create(h, ana.cookie, body);
      expect(response.status).toBe(400);
      expect(await jsonOf(response)).toMatchObject({ code: "request.invalid" });
    }
    expect(await h.store.tokensOf(ana.sub)).toEqual([]);
  });

  it.each([
    ["a single character", "a", "a"],
    ["exactly 60 characters", "a".repeat(60), "a".repeat(60)],
    ["60 characters between spaces", `   ${"a".repeat(60)}\n`, "a".repeat(60)],
    ["60 emoji, each of two UTF-16 units", "\u{1F4BB}".repeat(60), "\u{1F4BB}".repeat(60)],
    ["60 characters of three bytes each", "中".repeat(60), "中".repeat(60)],
    ["a name with spaces and punctuation", "CI - build #12 (main)", "CI - build #12 (main)"],
  ])("accepts %s", async (_label, name, expected) => {
    const h = await harness();
    const ana = await h.signedIn();

    const response = await create(h, ana.cookie, { name });

    expect(response.status).toBe(201);
    expect((await jsonOf<Created>(response)).name).toBe(expected);
  });

  const notAnObject: [string, string | undefined][] = [
    ["no body at all", undefined],
    ["an empty body", ""],
    ["text that is not JSON", "name=laptop"],
    ["truncated JSON", '{"name":"lap'],
    ["JSON followed by more text", '{"name":"laptop"} {}'],
    ["a JSON array", '["laptop"]'],
    ["a JSON array holding an object", '[{"name":"laptop"}]'],
    ["JSON null", "null"],
    ["a JSON number", "42"],
    ["a JSON string", '"laptop"'],
    ["a JSON boolean", "true"],
  ];

  it.each(notAnObject)(
    "refuses %s with 400 request.invalid and makes nothing",
    async (_label, body) => {
      const h = await harness();
      const ana = await h.signedIn();

      const response = await h.request(
        "/api/tokens",
        h.fromPage(ana.cookie, {
          method: "POST",
          headers: JSON_TYPE,
          ...(body === undefined ? {} : { body }),
        }),
      );

      expect(response.status).toBe(400);
      expect(await jsonOf(response)).toMatchObject({ code: "request.invalid" });
      expect(await h.store.tokensOf(ana.sub)).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------------------------

describe("who may make a token", () => {
  it("answers 401 auth.required to someone who is not signed in", async () => {
    const h = await harness();

    const response = await h.request("/api/tokens", {
      method: "POST",
      headers: { ...JSON_TYPE, Origin: h.env.ORIGIN },
      body: JSON.stringify({ name: "laptop" }),
    });

    expect(response.status).toBe(401);
    expect(await jsonOf(response)).toMatchObject({ code: "auth.required" });
  });

  it("answers 401 auth.required to a cookie that does not verify, or has expired, not 403", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const request = (cookie: string) => create(h, cookie, { name: "laptop" });

    const garbage = await request("meltemi_session=garbage");
    expect(garbage.status).toBe(401);
    expect(await jsonOf(garbage)).toMatchObject({ code: "auth.required" });

    h.clock.advance(31 * DAY_MS);
    const expired = await request(ana.cookie);
    expect(expired.status).toBe(401);
    expect(await jsonOf(expired)).toMatchObject({ code: "auth.required" });
    expect(await h.store.tokensOf(ana.sub)).toEqual([]);
  });

  it("answers 403 request.forbidden to a token, and says tokens are made from the page", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const first = await made(h, ana.cookie);

    const response = await h.request(
      "/api/tokens",
      asBearer(first.token, {
        method: "POST",
        headers: JSON_TYPE,
        body: JSON.stringify({ name: "copy" }),
      }),
    );

    expect(response.status).toBe(403);
    const body = await jsonOf<{ code: string; message: string }>(response);
    expect(body.code).toBe("request.forbidden");
    expect(body.message).toMatch(/page/);
    expect(body.message).not.toContain(first.token);
    expect(await h.store.tokensOf(ana.sub)).toHaveLength(1);
  });

  it("answers 403 to a token before it looks at the body", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const first = await made(h, ana.cookie);

    const response = await h.request(
      "/api/tokens",
      asBearer(first.token, { method: "POST", headers: JSON_TYPE, body: "not json" }),
    );

    expect(response.status).toBe(403);
  });

  it("answers 401 token.invalid to a token nobody holds", async () => {
    const h = await harness();

    for (const token of ["mdg_unknown", "mdg_", "mdg_".padEnd(47, "A"), "not-a-token"]) {
      const response = await h.request(
        "/api/tokens",
        asBearer(token, {
          method: "POST",
          headers: JSON_TYPE,
          body: JSON.stringify({ name: "x" }),
        }),
      );
      expect(response.status, token).toBe(401);
      expect(await jsonOf(response)).toMatchObject({ code: "token.invalid" });
    }
  });

  it("answers 403 request.forbidden to a form from another page of the family, and makes nothing", async () => {
    const h = await harness();
    const ana = await h.signedIn();

    const response = await h.request("/api/tokens", {
      method: "POST",
      headers: { ...JSON_TYPE, Cookie: ana.cookie, Origin: "https://id.meltemi.dev" },
      body: JSON.stringify({ name: "laptop" }),
    });

    expect(response.status).toBe(403);
    expect(await jsonOf(response)).toMatchObject({ code: "request.forbidden" });
    expect(await h.store.tokensOf(ana.sub)).toEqual([]);
  });

  it("runs the route for the page's own Origin", async () => {
    const h = await harness();
    const ana = await h.signedIn();

    const response = await h.request("/api/tokens", {
      method: "POST",
      headers: { ...JSON_TYPE, Cookie: ana.cookie, Origin: "https://diagrams.meltemi.dev" },
      body: JSON.stringify({ name: "laptop" }),
    });

    expect(response.status).toBe(201);
    expect(await h.store.tokensOf(ana.sub)).toHaveLength(1);
  });

  const notTheOrigin: [string, string | undefined][] = [
    ["no Origin at all", undefined],
    ["a null Origin", "null"],
    ["an Origin that is not an address", "not an origin"],
    ["a look-alike host", "https://diagrams.meltemi.dev.evil.example"],
    ["the same host over http", "http://diagrams.meltemi.dev"],
    ["the same host on another port", "https://diagrams.meltemi.dev:8443"],
    ["a sibling host", "https://publish.meltemi.dev"],
  ];

  it.each(notTheOrigin)(
    "answers 403 request.forbidden for %s, and makes nothing",
    async (_label, origin) => {
      const h = await harness();
      const ana = await h.signedIn();
      const headers: Record<string, string> = { ...JSON_TYPE, Cookie: ana.cookie };
      if (origin !== undefined) headers["Origin"] = origin;

      const response = await h.request("/api/tokens", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "laptop" }),
      });

      expect(response.status).toBe(403);
      expect(await jsonOf(response)).toMatchObject({ code: "request.forbidden" });
      expect(await h.store.tokensOf(ana.sub)).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------------------------

describe("the limit of 20 tokens", () => {
  it("allows 20 tokens and answers 413 quota.tokens to the 21st, making nothing", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    for (let i = 1; i <= 20; i++) await made(h, ana.cookie, `token ${i}`);
    expect(await h.store.tokensOf(ana.sub)).toHaveLength(20);

    const response = await create(h, ana.cookie, { name: "one too many" });

    expect(response.status).toBe(413);
    const body = await jsonOf<{ code: string; message: string }>(response);
    expect(body.code).toBe("quota.tokens");
    expect(body.message).toContain("20");
    expect(await h.store.tokensOf(ana.sub)).toHaveLength(20);
    // And it stays refused until something is revoked.
    expect((await create(h, ana.cookie, { name: "still too many" })).status).toBe(413);
  });

  it("checks the name before the limit: a bad name at the limit is a 400, not a 413", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    for (let i = 1; i <= 20; i++) await made(h, ana.cookie, `token ${i}`);

    const response = await create(h, ana.cookie, { name: "" });

    expect(response.status).toBe(400);
  });

  it("counts each person's tokens apart", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const ben = await h.signedIn();
    for (let i = 1; i <= 20; i++) await made(h, ana.cookie, `token ${i}`);

    expect((await create(h, ana.cookie, { name: "one too many" })).status).toBe(413);
    expect((await create(h, ben.cookie, { name: "first of ben's" })).status).toBe(201);

    expect(await listed(h, asCookie(ana.cookie))).toHaveLength(20);
    expect(await listed(h, asCookie(ben.cookie))).toHaveLength(1);
  });

  it("frees a slot when a token is revoked, and no more than one", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const all: Created[] = [];
    for (let i = 1; i <= 20; i++) all.push(await made(h, ana.cookie, `token ${i}`));

    expect((await revoke(h, ana.cookie, all[7].id)).status).toBe(204);
    expect((await create(h, ana.cookie, { name: "replacement" })).status).toBe(201);
    expect((await create(h, ana.cookie, { name: "one too many" })).status).toBe(413);
    expect(await h.store.tokensOf(ana.sub)).toHaveLength(20);
  });

  it("keeps a person at the limit able to list and use their tokens", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const all: Created[] = [];
    for (let i = 1; i <= 20; i++) all.push(await made(h, ana.cookie, `token ${i}`));

    expect(await listed(h, asBearer(all[19].token))).toHaveLength(20);
    expect((await h.request("/api/session", asBearer(all[0].token))).status).toBe(200);
  });

  it("never goes past 20 when many requests arrive together", async () => {
    const h = await harness();
    const ana = await h.signedIn();

    const responses = await Promise.all(
      Array.from({ length: 30 }, (_, i) => create(h, ana.cookie, { name: `token ${i}` })),
    );

    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(20);
    expect(statuses.filter((status) => status === 413)).toHaveLength(10);
    expect(await h.store.tokensOf(ana.sub)).toHaveLength(20);
  });
});

// ---------------------------------------------------------------------------------------------

describe("GET /api/tokens", () => {
  it("lists the person's tokens, the newest first, with id, name, created_at and last_used_at", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const first = await made(h, ana.cookie, "first");
    h.clock.advance(1_000);
    const second = await made(h, ana.cookie, "second");
    h.clock.advance(1_000);
    const third = await made(h, ana.cookie, "third");

    const response = await h.request("/api/tokens", asCookie(ana.cookie));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await jsonOf(response)).toEqual({
      tokens: [
        { id: third.id, name: "third", created_at: "2026-10-14T12:00:02.000Z", last_used_at: null },
        {
          id: second.id,
          name: "second",
          created_at: "2026-10-14T12:00:01.000Z",
          last_used_at: null,
        },
        { id: first.id, name: "first", created_at: "2026-10-14T12:00:00.000Z", last_used_at: null },
      ],
    });
  });

  it("answers an empty list to a person with no tokens", async () => {
    const h = await harness();
    const ana = await h.signedIn();

    const response = await h.request("/api/tokens", asCookie(ana.cookie));

    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual({ tokens: [] });
  });

  it("shows each person only their own tokens", async () => {
    const h = await harness();
    const ana = await h.signedIn({ name: "Ana" });
    const ben = await h.signedIn({ name: "Ben" });
    const anas = [await made(h, ana.cookie, "ana 1"), await made(h, ana.cookie, "ana 2")];
    h.clock.advance(1_000);
    const bens = [await made(h, ben.cookie, "ben 1")];

    const ids = (tokens: { id: string }[]) => tokens.map((token) => token.id).sort();
    const seenByAna = await listed(h, asCookie(ana.cookie));
    const seenByBen = await listed(h, asCookie(ben.cookie));

    expect(ids(seenByAna)).toEqual(ids(anas));
    expect(ids(seenByBen)).toEqual(ids(bens));
    // The same goes for a person who asks with a token.
    expect(ids(await listed(h, asBearer(anas[0].token)))).toEqual(ids(anas));
    expect(ids(await listed(h, asBearer(bens[0].token)))).toEqual(ids(bens));
  });

  it("never shows a token or its hash, only the four fields", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const { token } = await made(h, ana.cookie);

    const response = await h.request("/api/tokens", asCookie(ana.cookie));
    const text = await response.text();

    expect(text).not.toContain(token);
    expect(text).not.toContain(sha256(token));
    const [entry] = (JSON.parse(text) as { tokens: Record<string, unknown>[] }).tokens;
    expect(Object.keys(entry ?? {}).sort()).toEqual(["created_at", "id", "last_used_at", "name"]);
  });

  it("lists for a token as it does for a page, and the listing already counts that use", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const first = await made(h, ana.cookie, "first");
    h.clock.advance(5 * 60_000);

    const tokens = await listed(h, asBearer(first.token));

    expect(tokens).toEqual([
      {
        id: first.id,
        name: "first",
        created_at: "2026-10-14T12:00:00.000Z",
        // The request that asks is itself the first use.
        last_used_at: "2026-10-14T12:05:00.000Z",
      },
    ]);
  });

  it("shows when a token was last used, moved at most once an hour", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const { id, token } = await made(h, ana.cookie);
    const lastUsed = async () =>
      (await listed(h, asCookie(ana.cookie))).find((entry) => entry.id === id)?.last_used_at;
    expect(await lastUsed()).toBeNull();

    h.clock.advance(60_000);
    expect((await h.request("/api/session", asBearer(token))).status).toBe(200);
    expect(await lastUsed()).toBe("2026-10-14T12:01:00.000Z");

    // Used again within the hour: the time does not move, however often.
    h.clock.advance(10 * 60_000);
    await h.request("/api/session", asBearer(token));
    h.clock.advance(49 * 60_000 + 59_999);
    await h.request("/api/session", asBearer(token));
    expect(await lastUsed()).toBe("2026-10-14T12:01:00.000Z");

    // Exactly an hour after the last time it moved, it moves.
    h.clock.advance(1);
    await h.request("/api/session", asBearer(token));
    expect(await lastUsed()).toBe("2026-10-14T13:01:00.000Z");
  });

  it("keeps last_used_at of one token apart from the person's others", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const used = await made(h, ana.cookie, "used");
    const idle = await made(h, ana.cookie, "idle");
    h.clock.advance(60_000);
    await h.request("/api/session", asBearer(used.token));

    const tokens = await listed(h, asCookie(ana.cookie));

    expect(tokens.find((entry) => entry.id === used.id)?.last_used_at).toBe(
      "2026-10-14T12:01:00.000Z",
    );
    expect(tokens.find((entry) => entry.id === idle.id)?.last_used_at).toBeNull();
  });

  it("answers 401 auth.required to someone who is not signed in", async () => {
    const h = await harness();

    for (const init of [{}, asCookie("meltemi_session=garbage")]) {
      const response = await h.request("/api/tokens", init);
      expect(response.status).toBe(401);
      expect(await jsonOf(response)).toMatchObject({ code: "auth.required" });
    }
  });

  it("answers 401 token.invalid to a token nobody holds", async () => {
    const h = await harness();

    const response = await h.request("/api/tokens", asBearer("mdg_unknown"));

    expect(response.status).toBe(401);
    expect(await jsonOf(response)).toMatchObject({ code: "token.invalid" });
  });

  it("needs no Origin from a page, for it changes nothing", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    await made(h, ana.cookie);

    const response = await h.request("/api/tokens", {
      headers: { Cookie: ana.cookie, Origin: "https://evil.example" },
    });

    expect(response.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------

describe("DELETE /api/tokens/:id", () => {
  it("revokes the token: 204 without a body, gone from the list, and its use answers 401 token.invalid", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const { id, token } = await made(h, ana.cookie);
    expect((await h.request("/api/session", asBearer(token))).status).toBe(200);

    const response = await revoke(h, ana.cookie, id);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await listed(h, asCookie(ana.cookie))).toEqual([]);
    expect(await h.store.tokenByHash(sha256(token))).toBeUndefined();
    for (const path of ["/api/session", "/api/tokens"]) {
      const used = await h.request(path, asBearer(token));
      expect(used.status).toBe(401);
      expect(await jsonOf(used)).toMatchObject({ code: "token.invalid" });
    }
  });

  it("leaves the person's other tokens as they were", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const keep = await made(h, ana.cookie, "keep");
    const drop = await made(h, ana.cookie, "drop");
    const also = await made(h, ana.cookie, "also keep");

    await revoke(h, ana.cookie, drop.id);

    expect((await listed(h, asCookie(ana.cookie))).map((entry) => entry.name).sort()).toEqual([
      "also keep",
      "keep",
    ]);
    for (const token of [keep, also]) {
      expect((await h.request("/api/session", asBearer(token.token))).status).toBe(200);
    }
  });

  it("answers 404 not-found to an id nobody holds", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const { id } = await made(h, ana.cookie);

    const response = await revoke(h, ana.cookie, "0".repeat(32));

    expect(response.status).toBe(404);
    expect(await jsonOf(response)).toMatchObject({ code: "not-found" });
    expect(await h.store.tokensOf(ana.sub)).toHaveLength(1);
    expect((await listed(h, asCookie(ana.cookie)))[0]?.id).toBe(id);
  });

  it("answers 404 to another person's token exactly as to an unknown one, and leaves it working", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const ben = await h.signedIn();
    const bens = await made(h, ben.cookie, "ben's");
    const unknown = "f".repeat(32);

    const seen = async (id: string) => {
      const response = await revoke(h, ana.cookie, id);
      return {
        status: response.status,
        headers: [...response.headers].sort(),
        body: await response.text(),
      };
    };
    const forUnknown = await seen(unknown);
    const forBens = await seen(bens.id);

    expect(forUnknown.status).toBe(404);
    expect(JSON.parse(forUnknown.body)).toMatchObject({ code: "not-found" });
    expect(forBens).toEqual(forUnknown);
    expect(await listed(h, asCookie(ben.cookie))).toHaveLength(1);
    expect((await h.request("/api/session", asBearer(bens.token))).status).toBe(200);
  });

  it("does not let a token revoke another person's token either", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const ben = await h.signedIn();
    const anas = await made(h, ana.cookie);
    const bens = await made(h, ben.cookie);

    const response = await h.request(
      `/api/tokens/${bens.id}`,
      asBearer(anas.token, { method: "DELETE" }),
    );

    expect(response.status).toBe(404);
    expect((await h.request("/api/session", asBearer(bens.token))).status).toBe(200);
  });

  it("answers 404 the second time", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const { id } = await made(h, ana.cookie);

    expect((await revoke(h, ana.cookie, id)).status).toBe(204);
    const again = await revoke(h, ana.cookie, id);

    expect(again.status).toBe(404);
    expect(await jsonOf(again)).toMatchObject({ code: "not-found" });
  });

  it("lets a token revoke another token of the same person, with no Origin", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const keeper = await made(h, ana.cookie, "keeper");
    const doomed = await made(h, ana.cookie, "doomed");

    const response = await h.request(
      `/api/tokens/${doomed.id}`,
      asBearer(keeper.token, { method: "DELETE" }),
    );

    expect(response.status).toBe(204);
    expect((await h.request("/api/session", asBearer(doomed.token))).status).toBe(401);
    expect((await h.request("/api/session", asBearer(keeper.token))).status).toBe(200);
  });

  it("lets a token revoke itself, and then it is nobody", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const mine = await made(h, ana.cookie);

    const response = await h.request(
      `/api/tokens/${mine.id}`,
      asBearer(mine.token, { method: "DELETE" }),
    );

    expect(response.status).toBe(204);
    const after = await h.request("/api/session", asBearer(mine.token));
    expect(after.status).toBe(401);
    expect(await jsonOf(after)).toMatchObject({ code: "token.invalid" });
  });

  it("answers 401 auth.required to someone who is not signed in, whether or not the id exists", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const { id } = await made(h, ana.cookie);

    for (const target of [id, "0".repeat(32)]) {
      const response = await h.request(`/api/tokens/${target}`, { method: "DELETE" });
      expect(response.status).toBe(401);
      expect(await jsonOf(response)).toMatchObject({ code: "auth.required" });
    }
    expect(await h.store.tokensOf(ana.sub)).toHaveLength(1);
  });

  it("answers 401 token.invalid to a token that was revoked already", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const mine = await made(h, ana.cookie);
    await revoke(h, ana.cookie, mine.id);

    const response = await h.request(
      `/api/tokens/${mine.id}`,
      asBearer(mine.token, { method: "DELETE" }),
    );

    expect(response.status).toBe(401);
    expect(await jsonOf(response)).toMatchObject({ code: "token.invalid" });
  });

  it("answers 403 request.forbidden to a revocation from another page, and revokes nothing", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const { id, token } = await made(h, ana.cookie);

    for (const origin of ["https://id.meltemi.dev", undefined]) {
      const headers: Record<string, string> = { Cookie: ana.cookie };
      if (origin) headers["Origin"] = origin;
      const response = await h.request(`/api/tokens/${id}`, { method: "DELETE", headers });
      expect(response.status).toBe(403);
      expect(await jsonOf(response)).toMatchObject({ code: "request.forbidden" });
    }

    expect(await h.store.tokensOf(ana.sub)).toHaveLength(1);
    expect((await h.request("/api/session", asBearer(token))).status).toBe(200);
  });

  it.each([
    ["an id that is far too long", "a".repeat(5000)],
    ["an id with a slash, encoded", "a/b"],
    ["an id with a quote", "x' OR '1'='1"],
    ["an id with a NUL", "a\u0000b"],
    ["an id with a percent sign", "100%"],
    ["an id that is a prefix of a real one", "0001"],
  ])("answers 404 not-found for %s, deleting nothing", async (_label, id) => {
    const h = await harness();
    h.deps.randomBytes = (length) => Uint8Array.from({ length }, (_, i) => i);
    const ana = await h.signedIn();
    await made(h, ana.cookie);

    const response = await revoke(h, ana.cookie, id);

    expect(response.status).toBe(404);
    expect(await jsonOf(response)).toMatchObject({ code: "not-found" });
    expect(await h.store.tokensOf(ana.sub)).toHaveLength(1);
  });

  it("answers 404 not-found for a path with no id, and for an id with broken percent-encoding", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    await made(h, ana.cookie);

    for (const path of ["/api/tokens/", "/api/tokens/%E0%A4%A", "/api/tokens/a/b"]) {
      const response = await h.request(path, h.fromPage(ana.cookie, { method: "DELETE" }));
      expect(response.status, path).toBe(404);
      expect(await jsonOf(response), path).toMatchObject({ code: "not-found" });
    }
    expect(await h.store.tokensOf(ana.sub)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------

describe("a token at work", () => {
  it("makes a later request the request of the person who made it", async () => {
    const h = await harness();
    const ana = await h.signedIn({ sub: "u-ana", name: "Ana" });
    // The person has been here: the page asked who they are.
    await h.request("/api/session", asCookie(ana.cookie));
    const created = await made(h, ana.cookie, "CI");

    const response = await h.request("/api/session", asBearer(created.token));

    expect(response.status).toBe(200);
    const body = await jsonOf(response);
    expect(body).toEqual({
      user: {
        sub: "u-ana",
        name: "Ana",
        picture: "",
        handle: null,
        entitlements: { unbranded: false },
      },
      token: { id: created.id, name: "CI" },
    });
    expect(body).not.toHaveProperty("account");
    expect(body).not.toHaveProperty("signOut");
  });

  it("holds a hash of the token and not the token", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const created = await made(h, ana.cookie);

    await h.request("/api/session", asBearer(created.token));

    const [row] = await h.store.tokensOf(ana.sub);
    expect(row?.hash).toBe(sha256(created.token));
    for (const value of Object.values(row ?? {}))
      expect(String(value)).not.toContain(created.token);
  });

  it("tells two people's tokens apart", async () => {
    const h = await harness();
    const ana = await h.signedIn({ sub: "u-ana", name: "Ana" });
    const ben = await h.signedIn({ sub: "u-ben", name: "Ben" });
    await h.request("/api/session", asCookie(ana.cookie));
    await h.request("/api/session", asCookie(ben.cookie));
    const anas = await made(h, ana.cookie, "ana's");
    const bens = await made(h, ben.cookie, "ben's");

    const asAna = await jsonOf<{ user: { sub: string }; token: { name: string } }>(
      await h.request("/api/session", asBearer(anas.token)),
    );
    const asBen = await jsonOf<{ user: { sub: string }; token: { name: string } }>(
      await h.request("/api/session", asBearer(bens.token)),
    );

    expect([asAna.user.sub, asAna.token.name]).toEqual(["u-ana", "ana's"]);
    expect([asBen.user.sub, asBen.token.name]).toEqual(["u-ben", "ben's"]);
  });

  it("reaches the API without a cookie or an Origin, and its use is no use of the cookie", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const created = await made(h, ana.cookie);
    const callsToIdentity = h.identity.calls.length;

    const response = await h.request("/api/tokens", asBearer(created.token));

    expect(response.status).toBe(200);
    // A token is checked against the store alone: the identity service is not asked.
    expect(h.identity.calls).toHaveLength(callsToIdentity);
  });

  it("keeps working while the person's session is revoked, for a token is its own credential", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const created = await made(h, ana.cookie);
    h.identity.revoked.add(ana.sid);

    expect((await h.request("/api/session", asBearer(created.token))).status).toBe(200);
  });

  it("outlives the thirty days of the cookie that made it", async () => {
    const h = await harness();
    const ana = await h.signedIn();
    const created = await made(h, ana.cookie);
    h.clock.advance(400 * DAY_MS);

    expect((await h.request("/api/session", asBearer(created.token))).status).toBe(200);
    // While the cookie that made it is long gone.
    expect((await h.request("/api/tokens", asCookie(ana.cookie))).status).toBe(401);
  });
});
