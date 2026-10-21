// Deletion events: what the identity service tells this product, `POST /_identity/events`.
// Every signature here is made with Node's own HMAC, apart from the code under test.

import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { harness, jsonOf, type Harness } from "./support/index.js";

const AT = "2026-10-14T12:00:00.000Z";
const LIMIT = 8 * 1024;

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------
// What the identity service sends.

/** The signature the service puts on a body: `v1=` and the hex HMAC-SHA256 of its exact text. */
function sign(body: string, secret: string): string {
  return `v1=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

/** The text of an event; a field given as `undefined` is left out. */
function eventText(fields: Record<string, unknown> = {}): string {
  return JSON.stringify({ id: "evt_1", type: "user.deleted", sub: "user-1", at: AT, ...fields });
}

interface Delivery {
  /** The `Meltemi-Signature`; the right one by default, none when `null`. */
  signature?: string | null;
  headers?: Record<string, string>;
}

/** Posts a body to the Worker as the identity service does: no cookie, no `Origin`, signed. */
function deliver(h: Harness, body: string, options: Delivery = {}): Promise<Response> {
  const headers = new Headers({ "Content-Type": "application/json", ...options.headers });
  const signature =
    options.signature === undefined ? sign(body, h.env.IDENTITY_EVENTS_SECRET) : options.signature;
  if (signature !== null) headers.set("Meltemi-Signature", signature);
  return h.request("/_identity/events", { method: "POST", headers, body });
}

/** A body of exactly that many bytes (an event with a padding field). */
function eventOfBytes(bytes: number, padding = "x"): string {
  const bare = Buffer.byteLength(eventText({ pad: "" }));
  const text = eventText({ pad: padding.repeat(bytes - bare) });
  expect(Buffer.byteLength(text)).toBe(bytes);
  return text;
}

// ---------------------------------------------------------------------------------------------
// The people the Worker holds.

interface Person {
  readonly sub: string;
  readonly cookie: string;
  readonly tokens: string[];
}

/** Someone who has been here: signed in (so a user row exists) and holding that many tokens. */
async function somebody(h: Harness, sub: string, tokens = 2): Promise<Person> {
  const { cookie } = await h.signedIn({ sub, name: `Name of ${sub}` });
  await h.request("/api/session", { headers: { Cookie: cookie } });
  const made: string[] = [];
  for (let i = 1; i <= tokens; i++) {
    const response = await h.request(
      "/api/tokens",
      h.fromPage(cookie, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `token ${i}` }),
      }),
    );
    expect(response.status).toBe(201);
    made.push((await jsonOf<{ token: string }>(response)).token);
  }
  return { sub, cookie, tokens: made };
}

/** Everything the store holds for a person. */
async function held(h: Harness, sub: string) {
  return { user: await h.store.user(sub), tokens: await h.store.tokensOf(sub) };
}

/** What a request that carries the token as a bearer answers with. */
function useToken(h: Harness, token: string): Promise<Response> {
  return h.request("/api/tokens", { headers: { Authorization: `Bearer ${token}` } });
}

// ---------------------------------------------------------------------------------------------

describe("a user.deleted event", () => {
  it("removes the person's user and tokens and answers 200 applied", async () => {
    const h = await harness();
    await somebody(h, "u1");
    expect(await h.store.user("u1")).toBeDefined();
    expect(await h.store.tokensOf("u1")).toHaveLength(2);

    const response = await deliver(h, eventText({ sub: "u1" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe('{"status":"applied"}');
    expect(await h.store.user("u1")).toBeUndefined();
    expect(await h.store.tokensOf("u1")).toEqual([]);
  });

  it("makes every token of the deleted person answer 401 token.invalid", async () => {
    const h = await harness();
    const ana = await somebody(h, "u1");
    for (const token of ana.tokens) expect((await useToken(h, token)).status).toBe(200);

    await deliver(h, eventText({ sub: "u1" }));

    for (const token of ana.tokens) {
      const response = await useToken(h, token);
      expect(response.status).toBe(401);
      expect(await jsonOf(response)).toMatchObject({ code: "token.invalid" });
    }
  });

  it("touches no one else, not even someone whose id looks like the deleted one's", async () => {
    const h = await harness();
    await somebody(h, "u1");
    const others = [
      await somebody(h, "u2", 3),
      await somebody(h, "u10"),
      await somebody(h, "U1"),
      await somebody(h, "u1 "),
      await somebody(h, "u"),
    ];
    const before = await Promise.all(others.map((person) => held(h, person.sub)));

    await deliver(h, eventText({ sub: "u1" }));

    expect(await h.store.user("u1")).toBeUndefined();
    expect(await Promise.all(others.map((person) => held(h, person.sub)))).toEqual(before);
    for (const person of others) {
      for (const token of person.tokens) expect((await useToken(h, token)).status).toBe(200);
    }
  });

  it("answers 200 duplicate to a repeat of the same event, as often as it comes", async () => {
    const h = await harness();
    await somebody(h, "u1");
    const body = eventText({ id: "evt_7", sub: "u1" });

    expect(await jsonOf(await deliver(h, body))).toEqual({ status: "applied" });
    for (let repeat = 0; repeat < 3; repeat++) {
      const response = await deliver(h, body);
      expect(response.status).toBe(200);
      expect(await jsonOf(response)).toEqual({ status: "duplicate" });
    }
  });

  it("does not delete again what a returning person made since: a repeat is only a repeat", async () => {
    const h = await harness();
    await somebody(h, "u1");
    const body = eventText({ id: "evt_7", sub: "u1" });
    await deliver(h, body);
    expect(await h.store.user("u1")).toBeUndefined();

    // The person signs in again, a minute later (a new session, a new user row) and makes a token.
    h.clock.advance(60_000);
    const back = await somebody(h, "u1", 1);
    const before = await held(h, "u1");
    expect(before.user).toBeDefined();

    const repeat = await deliver(h, body);

    expect(repeat.status).toBe(200);
    expect(await jsonOf(repeat)).toEqual({ status: "duplicate" });
    expect(await held(h, "u1")).toEqual(before);
    expect((await useToken(h, back.tokens[0])).status).toBe(200);
  });

  it("applies a later event for the same person again, for its id is new", async () => {
    const h = await harness();
    await somebody(h, "u1");
    await deliver(h, eventText({ id: "evt_1", sub: "u1" }));
    h.clock.advance(60_000);
    await somebody(h, "u1", 1);

    const response = await deliver(h, eventText({ id: "evt_2", sub: "u1" }));

    expect(await jsonOf(response)).toEqual({ status: "applied" });
    expect(await held(h, "u1")).toEqual({ user: undefined, tokens: [] });
  });

  it("acknowledges the deletion of someone unknown here, and remembers the event", async () => {
    const h = await harness();
    const bystander = await somebody(h, "u2");
    const before = await held(h, "u2");
    const body = eventText({ id: "evt_9", sub: "nobody" });

    expect(await jsonOf(await deliver(h, body))).toEqual({ status: "applied" });
    expect(await jsonOf(await deliver(h, body))).toEqual({ status: "duplicate" });

    expect(await held(h, "u2")).toEqual(before);
    expect((await useToken(h, bystander.tokens[0])).status).toBe(200);
  });

  it("counts simultaneous deliveries of one event once", async () => {
    const h = await harness();
    await somebody(h, "u1");
    const body = eventText({ id: "evt_c", sub: "u1" });

    const responses = await Promise.all([deliver(h, body), deliver(h, body), deliver(h, body)]);

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    const statuses = await Promise.all(responses.map((response) => jsonOf(response)));
    expect(statuses.map((answer) => answer["status"]).sort()).toEqual([
      "applied",
      "duplicate",
      "duplicate",
    ]);
    expect(await held(h, "u1")).toEqual({ user: undefined, tokens: [] });
  });

  it("takes the event's id from the signed body, never from the Meltemi-Event-Id header", async () => {
    const h = await harness();
    await somebody(h, "u1");
    const body = eventText({ id: "evt_real", sub: "u1" });

    const first = await deliver(h, body, { headers: { "Meltemi-Event-Id": "evt_one" } });
    const second = await deliver(h, body, { headers: { "Meltemi-Event-Id": "evt_two" } });

    expect(await jsonOf(first)).toEqual({ status: "applied" });
    expect(await jsonOf(second)).toEqual({ status: "duplicate" });
  });

  it("signs, reads and deletes exact text, whatever characters the id holds", async () => {
    const h = await harness();
    const sub = "usér-ñ-\u{1F642}-中";
    await somebody(h, sub);

    const response = await deliver(h, eventText({ id: "évt_ñ", sub }));

    expect(await jsonOf(response)).toEqual({ status: "applied" });
    expect(await held(h, sub)).toEqual({ user: undefined, tokens: [] });
  });

  it("hands the store the id, the person and the time in the store's own form", async () => {
    const h = await harness();
    const applied = vi.spyOn(h.store, "applyUserDeleted");

    await deliver(h, eventText({ id: "evt_a", sub: "u1", at: "2026-10-14T12:00:00.000Z" }));
    await deliver(h, eventText({ id: "evt_b", sub: "u2", at: "2026-10-14T12:00:00Z" }));
    await deliver(h, eventText({ id: "evt_c", sub: "u3", at: "2026-10-14T14:00:00.5+02:00" }));

    expect(applied.mock.calls).toEqual([
      ["evt_a", "u1", "2026-10-14T12:00:00.000Z"],
      ["evt_b", "u2", "2026-10-14T12:00:00.000Z"],
      ["evt_c", "u3", "2026-10-14T12:00:00.500Z"],
    ]);
  });

  it("ignores fields it does not know", async () => {
    const h = await harness();
    await somebody(h, "u1");

    const response = await deliver(h, eventText({ sub: "u1", reason: "asked", extra: { n: 1 } }));

    expect(await jsonOf(response)).toEqual({ status: "applied" });
    expect(await h.store.user("u1")).toBeUndefined();
  });

  it("also removes the person's pending approvals of the command line, and no one else's", async () => {
    const h = await harness();
    await somebody(h, "u1");
    await somebody(h, "u2");
    const expiresAt = "2026-10-14T12:05:00.000Z";
    const state = "s".repeat(16);
    await h.store.createCliCode({ hash: "hash-of-u1", sub: "u1", state, expiresAt });
    await h.store.createCliCode({ hash: "hash-of-u2", sub: "u2", state, expiresAt });

    await deliver(h, eventText({ sub: "u1" }));

    expect(await h.store.takeCliCode("hash-of-u1")).toBeUndefined();
    expect(await h.store.takeCliCode("hash-of-u2")).toMatchObject({ sub: "u2" });
  });
});

// ---------------------------------------------------------------------------------------------

describe("the signature", () => {
  it("answers 401 signature.invalid to an event signed with another secret, and changes nothing", async () => {
    const h = await harness();
    const ana = await somebody(h, "u1");
    const before = await held(h, "u1");
    const applied = vi.spyOn(h.store, "applyUserDeleted");
    const body = eventText({ sub: "u1" });

    const response = await deliver(h, body, { signature: sign(body, "another-secret") });

    expect(response.status).toBe(401);
    expect(await jsonOf(response)).toEqual({
      code: "signature.invalid",
      message: "The signature is not valid.",
    });
    expect(applied).not.toHaveBeenCalled();
    expect(await held(h, "u1")).toEqual(before);
    expect((await useToken(h, ana.tokens[0])).status).toBe(200);
    // Nor was the forged event remembered: the real one still applies.
    expect(await jsonOf(await deliver(h, body))).toEqual({ status: "applied" });
  });

  const forgeries: [string, (body: string, secret: string) => string | null][] = [
    ["no Meltemi-Signature header", () => null],
    ["an empty header", () => ""],
    ["the scheme alone", () => "v1="],
    ["a signature that is not hexadecimal ('v1=zz')", () => "v1=zz"],
    ["hexadecimal of odd length", () => "v1=abc"],
    ["a hexadecimal signature that is far too short", () => "v1=00"],
    ["the right MAC under another scheme ('v2=…')", (b, s) => sign(b, s).replace("v1=", "v2=")],
    [
      "the right MAC under an upper-case scheme ('V1=…')",
      (b, s) => sign(b, s).replace("v1=", "V1="),
    ],
    ["the right MAC without its scheme", (b, s) => sign(b, s).slice(3)],
    ["the right MAC with a byte more", (b, s) => `${sign(b, s)}00`],
    ["the right MAC with a byte less", (b, s) => sign(b, s).slice(0, -2)],
    ["the right MAC twice", (b, s) => `${sign(b, s)}, ${sign(b, s)}`],
    [
      "the right MAC with one digit changed",
      (b, s) => sign(b, s).replace(/.$/, (c) => (c === "0" ? "1" : "0")),
    ],
    ["the MAC of the empty text", (_b, s) => sign("", s)],
    ["the MAC of another event", (_b, s) => sign(eventText({ sub: "someone-else" }), s)],
    ["a MAC with the key and the text the wrong way round", (b, s) => sign(s, b)],
    ["the secret itself", (_b, s) => `v1=${s}`],
  ];

  it.each(forgeries)("answers 401 signature.invalid for %s", async (_label, makeSignature) => {
    const h = await harness();
    const ana = await somebody(h, "u1");
    const before = await held(h, "u1");
    const applied = vi.spyOn(h.store, "applyUserDeleted");
    const body = eventText({ sub: "u1" });

    const response = await deliver(h, body, {
      signature: makeSignature(body, h.env.IDENTITY_EVENTS_SECRET),
    });

    expect(response.status).toBe(401);
    expect(await jsonOf(response)).toMatchObject({ code: "signature.invalid" });
    expect(applied).not.toHaveBeenCalled();
    expect(await held(h, "u1")).toEqual(before);
    expect((await useToken(h, ana.tokens[0])).status).toBe(200);
  });

  it("signs the exact text: the same JSON written another way is another body", async () => {
    const h = await harness();
    await somebody(h, "u1");
    const compact = eventText({ sub: "u1" });
    const spaced = JSON.stringify(JSON.parse(compact), null, 2);
    const secret = h.env.IDENTITY_EVENTS_SECRET;

    const wrong = await deliver(h, spaced, { signature: sign(compact, secret) });
    expect(wrong.status).toBe(401);
    expect(await h.store.user("u1")).toBeDefined();

    const right = await deliver(h, spaced, { signature: sign(spaced, secret) });
    expect(right.status).toBe(200);
    expect(await h.store.user("u1")).toBeUndefined();
  });

  it("says nothing of the secret or of the signature it expected", async () => {
    const h = await harness();
    const body = eventText({ sub: "u1" });
    const expected = sign(body, h.env.IDENTITY_EVENTS_SECRET);

    const response = await deliver(h, body, { signature: sign(body, "another-secret") });
    const text = await response.text();

    expect(text).not.toContain(h.env.IDENTITY_EVENTS_SECRET);
    expect(text).not.toContain(expected.slice(3));
    expect(JSON.parse(text)).toEqual({
      code: "signature.invalid",
      message: "The signature is not valid.",
    });
  });

  it("checks the signature before it looks at what the body says", async () => {
    const h = await harness();
    const applied = vi.spyOn(h.store, "applyUserDeleted");
    // Neither JSON nor signed: the answer is about the signature, not about the JSON.
    const response = await deliver(h, "not json", { signature: "v1=00" });
    expect(response.status).toBe(401);
    expect(applied).not.toHaveBeenCalled();
  });

  it("is wanted for events of every type, the ones it ignores included", async () => {
    const h = await harness();
    const body = eventText({ type: "user.renamed", sub: "u1" });

    const forged = await deliver(h, body, { signature: sign(body, "another-secret") });
    expect(forged.status).toBe(401);
    expect(await jsonOf(forged)).toMatchObject({ code: "signature.invalid" });

    const unsigned = await deliver(h, body, { signature: null });
    expect(unsigned.status).toBe(401);

    const signed = await deliver(h, body);
    expect(signed.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------

describe("a session from before the deletion", () => {
  /** What the open tab of the deleted person asks: who is signed in. */
  const asking = (h: Harness, cookie: string) =>
    h.request("/api/session", { headers: { Cookie: cookie } });

  const signedInAs = async (response: Response) =>
    (await jsonOf<{ user: { sub: string } | null }>(response)).user?.sub ?? null;

  it("counts as nobody, although the verifier trusts the session for an hour", async () => {
    const h = await harness();
    const ana = await somebody(h, "u1");
    expect(await signedInAs(await asking(h, ana.cookie))).toBe("u1");

    await deliver(h, eventText({ sub: "u1" }));
    h.clock.advance(5 * 60_000);

    expect(await signedInAs(await asking(h, ana.cookie))).toBeNull();
    // The request did not make the person's row again.
    expect(await h.store.user("u1")).toBeUndefined();
  });

  it("cannot make a token or list them: it is nobody", async () => {
    const h = await harness();
    const ana = await somebody(h, "u1");
    await deliver(h, eventText({ sub: "u1" }));

    const made = await h.request(
      "/api/tokens",
      h.fromPage(ana.cookie, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "again" }),
      }),
    );
    expect(made.status).toBe(401);
    expect(await jsonOf(made)).toMatchObject({ code: "auth.required" });
    const listed = await h.request("/api/tokens", { headers: { Cookie: ana.cookie } });
    expect(listed.status).toBe(401);
    expect(await held(h, "u1")).toEqual({ user: undefined, tokens: [] });
  });

  it("does not stop the person from signing in again: a later session is accepted", async () => {
    const h = await harness();
    const ana = await somebody(h, "u1");
    await deliver(h, eventText({ sub: "u1" }));
    h.clock.advance(60_000);
    const back = await somebody(h, "u1", 1);

    expect(await signedInAs(await asking(h, back.cookie))).toBe("u1");
    expect(await h.store.user("u1")).toBeDefined();
    // Beside it, the old session stays refused.
    expect(await signedInAs(await asking(h, ana.cookie))).toBeNull();
  });

  it.each([
    ["a second before the deletion is refused", -1_000, false],
    ["in the second of the deletion is refused", 0, false],
    ["in the second of the deletion, a moment after it, is refused", 999, false],
    ["in the next second is accepted", 1_000, true],
    ["an hour later is accepted", 3_600_000, true],
  ])("a session issued %s", async (_name, offset, accepted) => {
    const h = await harness();
    h.clock.set(new Date(Date.parse(AT) + offset).toISOString());
    const person = await h.signedIn({ sub: "u1" });
    h.clock.set(AT);
    await deliver(h, eventText({ sub: "u1" }));
    // The session counts from its own moment; the request comes later, still within its life.
    h.clock.set(new Date(Date.parse(AT) + 4_000_000).toISOString());

    expect(await signedInAs(await asking(h, person.cookie))).toBe(accepted ? "u1" : null);
  });

  it("leaves everybody else's sessions alone, even those older than the event", async () => {
    const h = await harness();
    const ana = await somebody(h, "u1");
    const luis = await somebody(h, "u2");

    await deliver(h, eventText({ sub: "u1" }));
    h.clock.advance(5 * 60_000);

    expect(await signedInAs(await asking(h, luis.cookie))).toBe("u2");
    expect(await signedInAs(await asking(h, ana.cookie))).toBeNull();
  });

  it("stays refused after repeats of the event and after other events", async () => {
    const h = await harness();
    const ana = await somebody(h, "u1");
    await deliver(h, eventText({ id: "evt_a", sub: "u9" }));
    await deliver(h, eventText({ id: "evt_b", sub: "u1" }));
    await deliver(h, eventText({ id: "evt_b", sub: "u1" }));
    await deliver(h, eventText({ id: "evt_c", type: "user.renamed", sub: "u1" }));
    h.clock.advance(60_000);

    expect(await signedInAs(await asking(h, ana.cookie))).toBeNull();
  });

  it("is not triggered by an event that is not a deletion", async () => {
    const h = await harness();
    const ana = await somebody(h, "u1");

    const ignored = await deliver(h, eventText({ id: "evt_r", type: "user.renamed", sub: "u1" }));
    expect(await jsonOf(ignored)).toEqual({ status: "ignored" });

    expect(await signedInAs(await asking(h, ana.cookie))).toBe("u1");
  });
});

// ---------------------------------------------------------------------------------------------

describe("who may call", () => {
  it("needs no cookie and no Origin: the signature is the whole authentication", async () => {
    const h = await harness();
    await somebody(h, "u1");
    const body = eventText({ sub: "u1" });
    const response = await h.request("/_identity/events", {
      method: "POST",
      body,
      headers: { "Meltemi-Signature": sign(body, h.env.IDENTITY_EVENTS_SECRET) },
    });
    expect(response.status).toBe(200);
    expect(await h.store.user("u1")).toBeUndefined();
  });

  it("answers only POST: any other method is an unknown route", async () => {
    const h = await harness();
    await somebody(h, "u1");
    const body = eventText({ sub: "u1" });
    const headers = { "Meltemi-Signature": sign(body, h.env.IDENTITY_EVENTS_SECRET) };

    for (const method of ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "DELETE"]) {
      const response = await h.request("/_identity/events", { method, headers });
      expect(response.status, method).toBe(404);
    }
    expect(await h.store.user("u1")).toBeDefined();
  });

  it("does not mind an Origin or a cookie that comes along", async () => {
    const h = await harness();
    const ana = await somebody(h, "u1");
    const response = await deliver(h, eventText({ sub: "u1" }), {
      headers: { Origin: "https://evil.example", Cookie: ana.cookie },
    });
    expect(response.status).toBe(200);
    expect(await h.store.user("u1")).toBeUndefined();
  });

  it("gives a signed-in person no power: their session and the page's Origin are no signature", async () => {
    const h = await harness();
    const ana = await somebody(h, "u1");
    const victim = await somebody(h, "u2");
    const before = await held(h, "u2");

    const response = await deliver(h, eventText({ sub: "u2" }), {
      signature: null,
      headers: { Cookie: ana.cookie, Origin: h.env.ORIGIN },
    });

    expect(response.status).toBe(401);
    expect(await jsonOf(response)).toMatchObject({ code: "signature.invalid" });
    expect(await held(h, "u2")).toEqual(before);
    expect((await useToken(h, victim.tokens[0])).status).toBe(200);
  });

  it("is not answered to a bearer token either", async () => {
    const h = await harness();
    const ana = await somebody(h, "u1");
    const response = await deliver(h, eventText({ sub: "u1" }), {
      signature: null,
      headers: { Authorization: `Bearer ${ana.tokens[0]}` },
    });
    expect(response.status).toBe(401);
    expect(await h.store.user("u1")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------------------------

describe("the size of the body", () => {
  it("refuses a body over 8 KiB with 400 request.invalid, signed or not, and changes nothing", async () => {
    const h = await harness();
    await somebody(h, "u1");
    const before = await held(h, "u1");
    const applied = vi.spyOn(h.store, "applyUserDeleted");
    const big = eventOfBytes(LIMIT + 1);

    const signed = await deliver(h, big);
    expect(signed.status).toBe(400);
    expect(await jsonOf(signed)).toMatchObject({ code: "request.invalid" });

    // The size is read first, so the answer does not depend on the signature.
    const unsigned = await deliver(h, big, { signature: null });
    expect(unsigned.status).toBe(400);
    expect(await jsonOf(unsigned)).toMatchObject({ code: "request.invalid" });

    expect(applied).not.toHaveBeenCalled();
    expect(await held(h, "u1")).toEqual(before);
  });

  it("accepts a body of exactly 8 KiB, and refuses one of a byte more", async () => {
    const h = await harness();
    await somebody(h, "u1");

    const exact = await deliver(h, eventOfBytes(LIMIT));
    expect(exact.status).toBe(200);

    const over = await deliver(h, eventOfBytes(LIMIT + 1));
    expect(over.status).toBe(400);
  });

  it("counts bytes, not characters", async () => {
    const h = await harness();
    // 5 000 characters, 10 000 bytes.
    const body = eventText({ pad: "é".repeat(5000) });
    expect(body.length).toBeLessThan(LIMIT);
    expect(Buffer.byteLength(body)).toBeGreaterThan(LIMIT);

    const response = await deliver(h, body);

    expect(response.status).toBe(400);
  });

  it("refuses at once a body that declares more than the limit", async () => {
    const h = await harness();
    await somebody(h, "u1");
    const body = eventText({ sub: "u1" });

    // The same body, small and signed, is fine; it is the declared length that is too much.
    const response = await deliver(h, body, { headers: { "Content-Length": String(LIMIT + 1) } });

    expect(response.status).toBe(400);
    expect(await h.store.user("u1")).toBeDefined();
  });

  it("stops reading a body that never ends, and lets the stream go", async () => {
    const h = await harness();
    let pulled = 0;
    let released = false;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(4096).fill(97));
      },
      cancel() {
        released = true;
      },
    });

    const response = await h.request("/_identity/events", {
      method: "POST",
      headers: { "Meltemi-Signature": "v1=00" },
      body: endless,
      duplex: "half",
    } as RequestInit);

    expect(response.status).toBe(400);
    expect(pulled).toBeLessThanOrEqual(5);
    expect(released).toBe(true);
  });

  it("reads a body that arrives in pieces, even one that splits a character", async () => {
    const h = await harness();
    const sub = "señor-\u{1F642}";
    await somebody(h, sub);
    const body = eventText({ sub });
    const bytes = new TextEncoder().encode(body);
    // One byte at a time: every multi-byte character is cut.
    const pieces = Array.from(bytes, (byte) => new Uint8Array([byte]));
    let next = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const piece = pieces[next++];
        if (piece) controller.enqueue(piece);
        else controller.close();
      },
    });

    const response = await h.request("/_identity/events", {
      method: "POST",
      headers: { "Meltemi-Signature": sign(body, h.env.IDENTITY_EVENTS_SECRET) },
      body: stream,
      duplex: "half",
    } as RequestInit);

    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual({ status: "applied" });
    expect(await h.store.user(sub)).toBeUndefined();
  });

  it("reads a request with no body as empty text", async () => {
    const h = await harness();
    const response = await h.request("/_identity/events", { method: "POST" });
    expect(response.status).toBe(401);

    // An empty body signed with the right key is signed, and is not an event.
    const signed = await deliver(h, "");
    expect(signed.status).toBe(400);
    expect(await jsonOf(signed)).toMatchObject({ code: "request.invalid" });
  });
});

// ---------------------------------------------------------------------------------------------

describe("a signed body that is not an event", () => {
  const notEvents: [string, string][] = [
    ["text that is not JSON", "this is not json"],
    ["an empty body", ""],
    ["truncated JSON", '{"id":"evt_1","type":'],
    ["JSON followed by more text", `${eventText({ sub: "u1" })} trailing`],
    ["a JSON array", "[]"],
    ["an array holding an event", `[${eventText({ sub: "u1" })}]`],
    ["JSON null", "null"],
    ["a JSON number", "42"],
    ["a JSON string", '"user.deleted"'],
    ["a JSON boolean", "true"],
  ];

  it.each(notEvents)(
    "answers 400 request.invalid for %s, and changes nothing",
    async (_label, body) => {
      const h = await harness();
      await somebody(h, "u1");
      const before = await held(h, "u1");
      const applied = vi.spyOn(h.store, "applyUserDeleted");

      const response = await deliver(h, body);

      expect(response.status).toBe(400);
      expect(await jsonOf(response)).toEqual({
        code: "request.invalid",
        message: "The request cannot be used.",
      });
      expect(applied).not.toHaveBeenCalled();
      expect(await held(h, "u1")).toEqual(before);
    },
  );

  const wrongShapes: [string, Record<string, unknown>][] = [
    ["no id", { id: undefined }],
    ["no type", { type: undefined }],
    ["no sub", { sub: undefined }],
    ["no time", { at: undefined }],
    ["a number for an id", { id: 7 }],
    ["null for a type", { type: null }],
    ["a boolean for a type", { type: true }],
    ["an array for a sub", { sub: ["u1"] }],
    ["an object for a sub", { sub: { id: "u1" } }],
    ["a number for the time", { at: 1760443200000 }],
    ["an empty id", { id: "" }],
    ["an empty type", { type: "" }],
    ["an empty sub", { sub: "" }],
    ["a time that is not a time", { at: "yesterday" }],
    ["a date with no time", { at: "2026-10-14" }],
    ["a time with no zone", { at: "2026-10-14T12:00:00" }],
    ["a time with an impossible date", { at: "2026-13-45T25:61:61Z" }],
    ["a time in the middle of other text", { at: "on 2026-10-14T12:00:00Z!" }],
  ];

  it.each(wrongShapes)(
    "answers 400 request.invalid for %s, and changes nothing",
    async (_label, fields) => {
      const h = await harness();
      await somebody(h, "u1");
      const before = await held(h, "u1");
      const applied = vi.spyOn(h.store, "applyUserDeleted");

      const response = await deliver(h, eventText({ sub: "u1", ...fields }));

      expect(response.status).toBe(400);
      expect(await jsonOf(response)).toMatchObject({ code: "request.invalid" });
      expect(applied).not.toHaveBeenCalled();
      expect(await held(h, "u1")).toEqual(before);
    },
  );

  it("holds an event of a type it does not know to the same shape", async () => {
    const h = await harness();
    const response = await deliver(h, eventText({ type: "user.renamed", sub: undefined }));
    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------

describe("other types of event", () => {
  it("answers 200 ignored and changes nothing", async () => {
    const h = await harness();
    const ana = await somebody(h, "u1");
    const before = await held(h, "u1");
    const applied = vi.spyOn(h.store, "applyUserDeleted");

    const response = await deliver(h, eventText({ type: "user.renamed", sub: "u1" }));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"status":"ignored"}');
    expect(applied).not.toHaveBeenCalled();
    expect(await held(h, "u1")).toEqual(before);
    expect((await useToken(h, ana.tokens[0])).status).toBe(200);
  });

  it.each(["User.Deleted", "user.deleted ", " user.deleted", "user.deleted.v2", "deleted", "user"])(
    "does not take %j for a deletion",
    async (type) => {
      const h = await harness();
      await somebody(h, "u1");
      const response = await deliver(h, eventText({ type, sub: "u1" }));
      expect(await jsonOf(response)).toEqual({ status: "ignored" });
      expect(await h.store.user("u1")).toBeDefined();
    },
  );

  it("does not remember an ignored event: an id is only spent by a deletion", async () => {
    const h = await harness();
    await somebody(h, "u1");

    await deliver(h, eventText({ id: "evt_x", type: "user.renamed", sub: "u1" }));
    const deletion = await deliver(h, eventText({ id: "evt_x", type: "user.deleted", sub: "u1" }));

    expect(await jsonOf(deletion)).toEqual({ status: "applied" });
    expect(await h.store.user("u1")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------

describe("when this side cannot do it", () => {
  it("answers 500 when the store fails, so the identity service tries again", async () => {
    const h = await harness();
    await somebody(h, "u1");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(h.store, "applyUserDeleted").mockRejectedValueOnce(new Error("the database is down"));
    const body = eventText({ id: "evt_r", sub: "u1" });

    const failed = await deliver(h, body);

    expect(failed.status).toBe(500);
    const text = await failed.text();
    expect(JSON.parse(text)).toEqual({ code: "internal", message: "Something went wrong." });
    expect(text).not.toContain("database");
    expect(logged).toHaveBeenCalled();
    expect(await h.store.user("u1")).toBeDefined();

    // The retry finds nothing remembered, and does the work.
    const retried = await deliver(h, body);
    expect(await jsonOf(retried)).toEqual({ status: "applied" });
    expect(await h.store.user("u1")).toBeUndefined();
  });

  it("answers 500 and accepts nothing when no events secret is configured", async () => {
    const h = await harness({ env: { IDENTITY_EVENTS_SECRET: "" } });
    await somebody(h, "u1");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const applied = vi.spyOn(h.store, "applyUserDeleted");
    const body = eventText({ sub: "u1" });

    // Not even an event signed with the empty key, which Node can make, is believed.
    for (const signature of [sign(body, ""), "v1=00", null]) {
      const response = await deliver(h, body, { signature });
      expect(response.status).toBe(500);
      expect(await jsonOf(response)).toEqual({
        code: "internal",
        message: "Something went wrong.",
      });
    }

    expect(applied).not.toHaveBeenCalled();
    expect(await h.store.user("u1")).toBeDefined();
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("IDENTITY_EVENTS_SECRET"));
  });
});
