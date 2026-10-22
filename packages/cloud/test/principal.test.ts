// Who is asking: `cloud-service` "Request authentication" and the user rows of `cloud-accounts`
// "Users and the session answer". The principal comes from the real reference verifier over the
// fake identity service (and from bearer tokens in the memory store); no test reaches the network.

import { createHash } from "node:crypto";
import { signSessionToken } from "@meltemi/identity/testing";
import { describe, expect, it, vi } from "vitest";
import { readConfig } from "../src/config.js";
import type { Env } from "../src/env.js";
import { hashToken, resolvePrincipal, TOKEN_PREFIX } from "../src/principal.js";
import type { Deps } from "../src/types.js";
import { harness, jsonOf } from "./support/index.js";
import {
  COOKIES_THAT_DO_NOT_COUNT,
  DAY,
  HOUR,
  MINUTE,
  addToken,
  bearer,
  devVariant,
  keyFetches,
  sessionChecks,
} from "./support/who.js";

/** What the router would hand a route as the principal for a request made with `init`. */
function principalOf(h: { readonly env: Env; readonly deps: Deps }, init: RequestInit = {}) {
  const request = new Request("https://diagrams.meltemi.dev/api/session", init);
  return resolvePrincipal(request, h.deps, readConfig(h.env, request));
}

const withCookie = (cookie: string): RequestInit => ({ headers: { Cookie: cookie } });

describe("a session cookie the verifier accepts", () => {
  const ANA = {
    sub: "u1",
    name: "Ana",
    picture: "https://avatars.githubusercontent.com/u/1",
    email: "ana@example.com",
    emailVerified: true,
  };

  it("is a cookie principal, and the person's row is made from the token", async () => {
    const h = await harness();
    const { cookie, sid } = await h.signedIn(ANA);

    expect(await h.store.user("u1")).toBeUndefined();
    expect(await principalOf(h, withCookie(cookie))).toEqual({
      via: "cookie",
      sub: "u1",
      sid,
      profile: ANA,
      token: cookie.slice("meltemi_session=".length),
    });
    expect(await h.store.user("u1")).toEqual({
      ...ANA,
      createdAt: "2026-10-14T12:00:00.000Z",
      handle: null,
    });
  });

  it("asks the identity service for the keys once and for the session once", async () => {
    const h = await harness();
    const { cookie, sid } = await h.signedIn(ANA);
    await principalOf(h, withCookie(cookie));
    expect(keyFetches(h.identity)).toEqual(["GET https://id.meltemi.dev/.well-known/jwks.json"]);
    expect(sessionChecks(h.identity)).toEqual([`GET https://id.meltemi.dev/sessions/${sid}`]);
  });

  it("is a cookie principal in development too, with the test keys inline and nobody home", async () => {
    const h = await harness();
    const dev = devVariant(h);
    h.identity.down = true;
    const { cookie, sid } = await h.signedIn(ANA);

    expect(await principalOf(dev, withCookie(cookie))).toEqual({
      via: "cookie",
      sub: "u1",
      sid,
      profile: ANA,
      token: cookie.slice("meltemi_session=".length),
    });
    expect(await h.store.user("u1")).toMatchObject(ANA);
    // The keys were inline; the only thing tried was the session check, and nobody answered.
    expect(keyFetches(h.identity)).toEqual([]);
    expect(sessionChecks(h.identity)).toHaveLength(1);
  });

  it("caches what the token carries even when it is empty", async () => {
    const h = await harness();
    const { cookie } = await h.signedIn({
      sub: "u9",
      name: "",
      picture: "",
      email: "",
      emailVerified: false,
    });
    await principalOf(h, withCookie(cookie));
    expect(await h.store.user("u9")).toEqual({
      sub: "u9",
      name: "",
      picture: "",
      email: "",
      emailVerified: false,
      createdAt: "2026-10-14T12:00:00.000Z",
      handle: null,
    });
  });

  it("hands the store the token's claims and the time of the request, once per request", async () => {
    const h = await harness();
    const upsert = vi.spyOn(h.store, "upsertUser");
    const { cookie } = await h.signedIn(ANA);
    h.clock.advance(5 * MINUTE);
    await principalOf(h, withCookie(cookie));
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(ANA, "2026-10-14T12:05:00.000Z");
  });

  it("keeps the row as it is when the same person comes again", async () => {
    const h = await harness();
    const { cookie } = await h.signedIn(ANA);
    await principalOf(h, withCookie(cookie));
    const first = await h.store.user("u1");

    h.clock.advance(3 * HOUR);
    await principalOf(h, withCookie(cookie));
    await principalOf(h, withCookie(cookie));

    // Nothing changed, `createdAt` (the first visit's) included.
    expect(await h.store.user("u1")).toEqual(first);
  });

  it.each([
    ["name", { name: "Ana María" }],
    ["picture", { picture: "https://avatars.githubusercontent.com/u/2" }],
    ["email", { email: "ana.maria@example.com" }],
    ["email_verified", { emailVerified: false }],
    ["everything", { name: "A", picture: "", email: "", emailVerified: false }],
  ])(
    "refreshes the row when the token's %s differs, and keeps when it began",
    async (_f, change) => {
      const h = await harness();
      await principalOf(h, withCookie((await h.signedIn(ANA)).cookie));
      h.clock.advance(2 * HOUR);
      const renamed = await h.signedIn({ ...ANA, ...change, sid: "sid-renamed" });

      const principal = await principalOf(h, withCookie(renamed.cookie));

      expect(principal).toMatchObject({ via: "cookie", sub: "u1", profile: { ...ANA, ...change } });
      expect(await h.store.user("u1")).toEqual({
        ...ANA,
        ...change,
        createdAt: "2026-10-14T12:00:00.000Z",
        handle: null,
      });
    },
  );

  it("keeps one row per person", async () => {
    const h = await harness();
    const ana = await h.signedIn({ ...ANA });
    const luis = await h.signedIn({ sub: "u2", name: "Luis" });
    await principalOf(h, withCookie(ana.cookie));
    await principalOf(h, withCookie(luis.cookie));
    await principalOf(h, withCookie(ana.cookie));
    expect(await h.store.user("u1")).toMatchObject({ name: "Ana" });
    expect(await h.store.user("u2")).toMatchObject({ name: "Luis" });
  });

  it("finds the cookie among others, and the first one wins when the name is repeated", async () => {
    const h = await harness();
    const ana = await h.signedIn({ sub: "u1" });
    const luis = await h.signedIn({ sub: "u2" });
    const token = (cookie: string) => cookie.replace("meltemi_session=", "");

    const among = `theme=dark; meltemi_session=${token(ana.cookie)}; lang=es`;
    expect(await principalOf(h, withCookie(among))).toMatchObject({ sub: "u1" });

    const twice = `meltemi_session=${token(luis.cookie)}; meltemi_session=${token(ana.cookie)}`;
    expect(await principalOf(h, withCookie(twice))).toMatchObject({ sub: "u2" });
    const garbageFirst = `meltemi_session=garbage; meltemi_session=${token(ana.cookie)}`;
    expect(await principalOf(h, withCookie(garbageFirst))).toBeUndefined();
  });

  it("measures its life with the Worker's clock: thirty days and a minute of leeway", async () => {
    const h = await harness();
    const { cookie } = await h.signedIn(ANA);
    const born = h.clock.now().getTime();
    for (const [offset, counts] of [
      [0, true],
      [30 * DAY, true],
      [30 * DAY + 60_000, true],
      [30 * DAY + 61_000, false],
      [45 * DAY, false],
    ] as const) {
      h.clock.set(new Date(born + offset).toISOString());
      expect(await principalOf(h, withCookie(cookie)), `at +${offset} ms`).toEqual(
        counts ? expect.objectContaining({ via: "cookie", sub: "u1" }) : undefined,
      );
    }
  });

  it("is verified once for requests that start together", async () => {
    const h = await harness();
    const { cookie } = await h.signedIn(ANA);
    const principals = await Promise.all(
      Array.from({ length: 10 }, () => principalOf(h, withCookie(cookie))),
    );
    expect(principals.every((p) => p?.via === "cookie" && p.sub === "u1")).toBe(true);
    expect(keyFetches(h.identity)).toHaveLength(1);
    expect(sessionChecks(h.identity)).toHaveLength(1);
    expect(await h.store.user("u1")).toMatchObject(ANA);
  });
});

describe("a cookie that does not count", () => {
  it.each(COOKIES_THAT_DO_NOT_COUNT)(
    "%s is no principal, makes no user and costs no session check",
    async (_name, recipe) => {
      const h = await harness();
      const upsert = vi.spyOn(h.store, "upsertUser");
      const cookie = await recipe(h);

      expect(await principalOf(h, withCookie(cookie))).toBeUndefined();

      expect(upsert).not.toHaveBeenCalled();
      expect(await h.store.user("u1")).toBeUndefined();
      expect(sessionChecks(h.identity)).toEqual([]);
    },
  );

  it("is not a reason to fail: the request goes on as anonymous", async () => {
    const h = await harness();
    for (const [name, recipe] of COOKIES_THAT_DO_NOT_COUNT) {
      const response = await h.request("/api/session", withCookie(await recipe(h)));
      expect(response.status, name).toBe(200);
      expect(await jsonOf(response), name).toMatchObject({ user: null });
    }
  });

  it("counts as nobody without any key to check it against", async () => {
    const h = await harness();
    const { cookie } = await h.signedIn({ sub: "u1" });
    h.identity.down = true;
    expect(await principalOf(h, withCookie(cookie))).toBeUndefined();
    expect(await h.store.user("u1")).toBeUndefined();
  });
});

describe("the session at the issuer", () => {
  const SESSION = (sid: string) => `GET https://id.meltemi.dev/sessions/${sid}`;

  it("is checked once an hour: a revocation counts from the next hour", async () => {
    const h = await harness();
    const { cookie, sid } = await h.signedIn({ sub: "u1" });

    expect(await principalOf(h, withCookie(cookie))).toMatchObject({ sub: "u1" });
    h.identity.revoked.add(sid);

    h.clock.advance(HOUR - 1);
    expect(await principalOf(h, withCookie(cookie))).toMatchObject({ sub: "u1" });
    expect(sessionChecks(h.identity)).toEqual([SESSION(sid)]);

    h.clock.advance(1);
    expect(await principalOf(h, withCookie(cookie))).toBeUndefined();
    expect(sessionChecks(h.identity)).toEqual([SESSION(sid), SESSION(sid)]);
  });

  it("refuses a session that was revoked before its first request, and makes no user", async () => {
    const h = await harness();
    const { cookie, sid } = await h.signedIn({ sub: "u1" });
    h.identity.revoked.add(sid);
    expect(await principalOf(h, withCookie(cookie))).toBeUndefined();
    expect(await h.store.user("u1")).toBeUndefined();
  });

  it("revokes one session and not the person's others", async () => {
    const h = await harness();
    const phone = await h.signedIn({ sub: "u1", sid: "sid-phone" });
    const laptop = await h.signedIn({ sub: "u1", sid: "sid-laptop" });
    h.identity.revoked.add("sid-phone");
    expect(await principalOf(h, withCookie(phone.cookie))).toBeUndefined();
    expect(await principalOf(h, withCookie(laptop.cookie))).toMatchObject({ sub: "u1" });
  });

  it("makes a new session invalid while the identity service is unreachable, and keeps no memory of it", async () => {
    const h = await harness();
    const first = await h.signedIn({ sub: "u1" });
    const second = await h.signedIn({ sub: "u2" });
    await principalOf(h, withCookie(first.cookie)); // the keys and u1's session are now known

    h.identity.down = true;
    expect(await principalOf(h, withCookie(second.cookie))).toBeUndefined();
    expect(await h.store.user("u2")).toBeUndefined();
    // What was verified within the hour does not need the service.
    expect(await principalOf(h, withCookie(first.cookie))).toMatchObject({ sub: "u1" });

    h.identity.down = false;
    expect(await principalOf(h, withCookie(second.cookie))).toMatchObject({ sub: "u2" });
  });
});

describe("a bearer token", () => {
  it("is found by the SHA-256 of the token and is a token principal", async () => {
    const h = await harness();
    const { token, row } = await addToken(h.store, { sub: "u1", name: "laptop" });
    const lookup = vi.spyOn(h.store, "tokenByHash");

    expect(row.hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(await principalOf(h, bearer(token))).toEqual({
      via: "token",
      sub: "u1",
      tokenId: row.id,
      tokenName: "laptop",
    });
    expect(lookup).toHaveBeenCalledExactlyOnceWith(await hashToken(token));
  });

  it("neither asks the identity service nor touches a user row", async () => {
    const h = await harness();
    const { token } = await addToken(h.store, { sub: "u1" });
    const upsert = vi.spyOn(h.store, "upsertUser");
    await principalOf(h, bearer(token));
    expect(h.identity.calls).toEqual([]);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("tells two tokens of one person apart", async () => {
    const h = await harness();
    const one = await addToken(h.store, { sub: "u1", name: "laptop" });
    const two = await addToken(h.store, { sub: "u1", name: "ci" });
    expect(await principalOf(h, bearer(one.token))).toMatchObject({ tokenName: "laptop" });
    expect(await principalOf(h, bearer(two.token))).toMatchObject({ tokenName: "ci" });
  });

  it("is accepted whatever the case of the scheme and the spacing", async () => {
    const h = await harness();
    const { token } = await addToken(h.store, { sub: "u1" });
    for (const header of [
      `bearer ${token}`,
      `BEARER ${token}`,
      `Bearer    ${token}`,
      `Bearer\t${token}`,
    ]) {
      const init = { headers: { Authorization: header } };
      expect(await principalOf(h, init), header).toMatchObject({ via: "token", sub: "u1" });
    }
  });

  describe("last use", () => {
    it("is bumped on the first use and then at most once an hour", async () => {
      const h = await harness();
      const { token, row } = await addToken(h.store, { sub: "u1" });
      const touch = vi.spyOn(h.store, "touchToken");
      const start = h.clock.now().getTime();
      const iso = (offset: number) => new Date(start + offset).toISOString();
      const lastUsed = async () => (await h.store.tokenByHash(row.hash))?.lastUsedAt;

      expect(await lastUsed()).toBeNull();
      for (const [offset, expected] of [
        [0, 0],
        [MINUTE, 0],
        [30 * MINUTE, 0],
        [HOUR - 1, 0],
        [HOUR, HOUR],
        [HOUR + 30 * MINUTE, HOUR],
        [2 * HOUR - 1, HOUR],
        [2 * HOUR, 2 * HOUR],
        [10 * HOUR, 10 * HOUR],
      ] as const) {
        h.clock.set(iso(offset));
        await principalOf(h, bearer(token));
        expect(await lastUsed(), `at +${offset} ms`).toBe(iso(expected));
      }
      expect(touch.mock.calls.map(([id, at]) => [id, at])).toEqual(
        [0, HOUR, 2 * HOUR, 10 * HOUR].map((offset) => [row.id, iso(offset)]),
      );
    });

    it("is written once for a hundred requests inside the hour", async () => {
      const h = await harness();
      const { token } = await addToken(h.store, { sub: "u1" });
      const touch = vi.spyOn(h.store, "touchToken");
      for (let i = 0; i < 100; i++) {
        h.clock.advance(30_000);
        await principalOf(h, bearer(token));
      }
      expect(touch).toHaveBeenCalledTimes(1);
    });

    it("counts from the last bump, not from the token's creation", async () => {
      const h = await harness();
      const { token, row } = await addToken(h.store, {
        sub: "u1",
        lastUsedAt: new Date(h.clock.now().getTime() - 30 * MINUTE).toISOString(),
      });
      await principalOf(h, bearer(token));
      expect((await h.store.tokenByHash(row.hash))?.lastUsedAt).toBe(
        new Date(h.clock.now().getTime() - 30 * MINUTE).toISOString(),
      );
      h.clock.advance(30 * MINUTE);
      await principalOf(h, bearer(token));
      expect((await h.store.tokenByHash(row.hash))?.lastUsedAt).toBe(h.clock.now().toISOString());
    });

    it("never moves back: a last use in the future is left alone", async () => {
      const h = await harness();
      const future = new Date(h.clock.now().getTime() + 5 * HOUR).toISOString();
      const { token, row } = await addToken(h.store, { sub: "u1", lastUsedAt: future });
      await principalOf(h, bearer(token));
      expect((await h.store.tokenByHash(row.hash))?.lastUsedAt).toBe(future);
    });

    it("is kept apart for each token", async () => {
      const h = await harness();
      const one = await addToken(h.store, { sub: "u1", name: "laptop" });
      const two = await addToken(h.store, { sub: "u1", name: "ci" });
      await principalOf(h, bearer(one.token));
      h.clock.advance(2 * HOUR);
      await principalOf(h, bearer(two.token));
      expect((await h.store.tokenByHash(one.row.hash))?.lastUsedAt).toBe(
        "2026-10-14T12:00:00.000Z",
      );
      expect((await h.store.tokenByHash(two.row.hash))?.lastUsedAt).toBe(
        "2026-10-14T14:00:00.000Z",
      );
    });
  });

  describe("a token that is not one", () => {
    const SESSION_JWT = "header.payload.signature";

    it.each([
      ["an unknown token", "mdg_unknown"],
      ["a token that looks right but was never made", `mdg_${"A".repeat(43)}`],
      ["the prefix alone", TOKEN_PREFIX],
      ["no prefix", "abc123"],
      ["the prefix in capitals", "MDG_abc123"],
      ["a session token's shape", SESSION_JWT],
    ])("answers 401 token.invalid for %s", async (_name, value) => {
      const h = await harness();
      const response = await h.request("/api/session", bearer(value));
      const body = await jsonOf<{ code: string; message: string }>(response);

      expect(response.status).toBe(401);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(body.code).toBe("token.invalid");
      expect(JSON.stringify(body)).not.toContain(value);
    });

    it("does not look up what cannot be a token", async () => {
      const h = await harness();
      const lookup = vi.spyOn(h.store, "tokenByHash");
      for (const value of ["abc123", "MDG_x", "Bearer-less"]) {
        const response = await h.request("/api/session", bearer(value));
        expect(response.status, value).toBe(401);
      }
      expect(lookup).not.toHaveBeenCalled();
    });

    it("does not take a valid session token for an API token", async () => {
      const h = await harness();
      const { cookie } = await h.signedIn({ sub: "u1" });
      const jwt = cookie.replace("meltemi_session=", "");
      const response = await h.request("/api/session", bearer(jwt));
      expect(response.status).toBe(401);
      expect((await jsonOf<{ code: string }>(response)).code).toBe("token.invalid");
      expect(await h.store.user("u1")).toBeUndefined();
    });

    it("answers 401 once the token is revoked", async () => {
      const h = await harness();
      const { token, row } = await addToken(h.store, { sub: "u1" });
      expect((await h.request("/api/session", bearer(token))).status).toBe(200);
      expect(await h.store.deleteToken("u1", row.id)).toBe(true);
      const response = await h.request("/api/session", bearer(token));
      expect(response.status).toBe(401);
      expect((await jsonOf<{ code: string }>(response)).code).toBe("token.invalid");
    });

    it("answers 401 for a token whose person was deleted with it", async () => {
      const h = await harness();
      const { token } = await addToken(h.store, { sub: "u1" });
      await h.store.applyUserDeleted("evt_1", "u1", h.clock.now().toISOString());
      expect((await h.request("/api/session", bearer(token))).status).toBe(401);
    });
  });

  describe("next to a cookie", () => {
    it("wins: the request is the token's person, and the cookie is not even read", async () => {
      const h = await harness();
      const { token, row } = await addToken(h.store, { sub: "token-person" });
      const { cookie } = await h.signedIn({ sub: "cookie-person" });
      const verify = vi.spyOn(h.deps.verifier, "verifySession");

      const principal = await principalOf(h, bearer(token, withCookie(cookie)));

      expect(principal).toEqual({
        via: "token",
        sub: "token-person",
        tokenId: row.id,
        tokenName: "laptop",
      });
      expect(verify).not.toHaveBeenCalled();
      expect(await h.store.user("cookie-person")).toBeUndefined();
    });

    it("is refused when it is wrong, however good the cookie", async () => {
      const h = await harness();
      const { cookie } = await h.signedIn({ sub: "u1" });
      const response = await h.request("/api/session", bearer("mdg_wrong", withCookie(cookie)));
      expect(response.status).toBe(401);
      expect((await jsonOf<{ code: string }>(response)).code).toBe("token.invalid");
      expect(await h.store.user("u1")).toBeUndefined();
    });
  });

  describe("other Authorization headers", () => {
    it.each(["Basic dXNlcjpwYXNz", "Digest username=u", "Token mdg_abc", "mdg_abc", ""])(
      "are ignored: %j",
      async (header) => {
        const h = await harness();
        const { cookie } = await h.signedIn({ sub: "u1" });
        const withHeader = (init: RequestInit): RequestInit => ({
          ...init,
          headers: {
            ...(init.headers as Record<string, string> | undefined),
            Authorization: header,
          },
        });
        expect(await principalOf(h, withHeader({}))).toBeUndefined();
        expect(await principalOf(h, withHeader(withCookie(cookie)))).toMatchObject({
          via: "cookie",
          sub: "u1",
        });
      },
    );

    it("treats a Bearer with no token as no credentials at all", async () => {
      const h = await harness();
      const { cookie } = await h.signedIn({ sub: "u1" });
      const headers = (extra: Record<string, string> = {}) => ({
        headers: { Authorization: "Bearer", ...extra },
      });
      expect(await principalOf(h, headers())).toBeUndefined();
      expect(await principalOf(h, headers({ Cookie: cookie }))).toMatchObject({ via: "cookie" });
    });
  });
});

describe("a session issued before the person was deleted", () => {
  const DELETED_AT = "2026-10-14T12:00:00.000Z";

  it("is nobody, and makes no row: the verifier's hour must not bring a deleted person back", async () => {
    const h = await harness();
    const { cookie } = await h.signedIn({ sub: "u1" });
    expect(await principalOf(h, withCookie(cookie))).toMatchObject({ via: "cookie", sub: "u1" });

    await h.store.applyUserDeleted("evt_1", "u1", DELETED_AT);
    h.clock.advance(5 * MINUTE);

    expect(await principalOf(h, withCookie(cookie))).toBeUndefined();
    expect(await h.store.user("u1")).toBeUndefined();
  });

  it("does not stop a session issued in a later second: the person signed in again", async () => {
    const h = await harness();
    await h.store.applyUserDeleted("evt_1", "u1", DELETED_AT);
    h.clock.advance(1_000);
    const { cookie } = await h.signedIn({ sub: "u1" });

    expect(await principalOf(h, withCookie(cookie))).toMatchObject({ via: "cookie", sub: "u1" });
    expect(await h.store.user("u1")).toBeDefined();
  });

  it("does not stop anybody else, whatever the time of the deletion", async () => {
    const h = await harness();
    const { cookie } = await h.signedIn({ sub: "u2" });
    await h.store.applyUserDeleted("evt_1", "u1", "2030-01-01T00:00:00.000Z");

    expect(await principalOf(h, withCookie(cookie))).toMatchObject({ via: "cookie", sub: "u2" });
  });

  it("asks the store once, for the person and the moment the session was issued", async () => {
    const h = await harness();
    const asked = vi.spyOn(h.store, "deletedSince");
    const { cookie } = await h.signedIn({ sub: "u1" });

    await principalOf(h, withCookie(cookie));

    expect(asked).toHaveBeenCalledExactlyOnceWith("u1", "2026-10-14T12:00:00.000Z");
  });

  it("is not asked for a bearer token, for no cookie, or for a cookie that does not count", async () => {
    const h = await harness();
    const asked = vi.spyOn(h.store, "deletedSince");
    const { token } = await addToken(h.store, { sub: "u1" });

    await principalOf(h, bearer(token));
    await principalOf(h);
    await principalOf(h, withCookie("meltemi_session=a.b.c"));

    expect(asked).not.toHaveBeenCalled();
  });

  it("counts a session whose issue time no date can hold as nobody", async () => {
    const h = await harness();
    const token = await signSessionToken(
      { sub: "u1", sid: "sid-odd", iss: h.env.IDENTITY_ISSUER, iat: -1e20 },
      h.keys,
      h.clock.now(),
    );

    expect(await principalOf(h, withCookie(`meltemi_session=${token}`))).toBeUndefined();
    expect(await h.store.user("u1")).toBeUndefined();
  });
});

describe("a request with no credentials", () => {
  it("is nobody, and nothing is looked up or asked", async () => {
    const h = await harness();
    const lookup = vi.spyOn(h.store, "tokenByHash");
    const upsert = vi.spyOn(h.store, "upsertUser");
    const verify = vi.spyOn(h.deps.verifier, "verifySession");

    expect(await principalOf(h)).toBeUndefined();
    expect(await principalOf(h, withCookie("theme=dark; lang=es"))).toBeUndefined();

    expect(lookup).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect(h.identity.calls).toEqual([]);
  });
});
