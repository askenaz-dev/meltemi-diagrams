// The verifier the Worker builds from its settings (`src/verifier.ts`): where the keys come from,
// when the inline key set counts, and what the session check does in development and outside it.
// The verifier's own rules (algorithms, claims, leeway, caches) are tested in `@meltemi/identity`;
// this file tests the wiring. No test reaches the network.

import { signSessionToken, testJwks, testKeys } from "@meltemi/identity/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigError } from "../src/config.js";
import type { Env } from "../src/env.js";
import { createVerifier } from "../src/verifier.js";
import { fakeIdentity, testEnv, type FakeIdentity } from "./support/index.js";
import { HOUR, keyFetches, sessionChecks } from "./support/who.js";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const after = (ms: number) => new Date(NOW.getTime() + ms);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** The fake identity service with a say in how the session check goes. */
function service(identity: FakeIdentity) {
  const control: { status: number | "down" | undefined; readonly fetch: typeof fetch } = {
    status: undefined,
    fetch: async (input, init) => {
      const url = new Request(input as RequestInfo).url;
      if (control.status !== undefined && url.includes("/sessions/")) {
        identity.calls.push(`GET ${url}`);
        if (control.status === "down") throw new TypeError("the identity service is unreachable");
        return new Response(null, { status: control.status });
      }
      return identity.fetch(input, init);
    },
  };
  return control;
}

describe("the keys", () => {
  it("come from IDENTITY_JWKS_URL, are kept an hour and are fetched again after it", async () => {
    const keys = await testKeys();
    const identity = fakeIdentity(keys);
    const verifier = createVerifier(testEnv(), identity.fetch);
    const token = await signSessionToken({ sub: "u1" }, keys, NOW);

    expect(await verifier.verifySession(token, NOW)).toMatchObject({ sub: "u1" });
    expect(keyFetches(identity)).toEqual(["GET https://id.meltemi.dev/.well-known/jwks.json"]);

    await verifier.verifySession(token, after(HOUR - 1));
    expect(keyFetches(identity)).toHaveLength(1);
    await verifier.verifySession(token, after(HOUR));
    expect(keyFetches(identity)).toHaveLength(2);
  });

  it("are the identity service's and nobody else's: a token signed by other keys is refused", async () => {
    const identity = fakeIdentity(await testKeys());
    const verifier = createVerifier(testEnv(), identity.fetch);
    const stranger = await signSessionToken({ sub: "u1" }, await testKeys(), NOW);
    expect(await verifier.verifySession(stranger, NOW)).toBeUndefined();
  });

  it("make nobody anyone when the address cannot be reached", async () => {
    const keys = await testKeys();
    const identity = fakeIdentity(keys);
    identity.down = true;
    const verifier = createVerifier(testEnv(), identity.fetch);
    const token = await signSessionToken({ sub: "u1" }, keys, NOW);
    expect(await verifier.verifySession(token, NOW)).toBeUndefined();
    identity.down = false;
    expect(await verifier.verifySession(token, NOW)).toMatchObject({ sub: "u1" });
  });

  it("use the fetch the Worker was given and no other", async () => {
    const global = vi.fn(async () => {
      throw new Error("the global fetch must not be used");
    });
    vi.stubGlobal("fetch", global);
    const keys = await testKeys();
    const token = await signSessionToken({ sub: "u1" }, keys, NOW);
    for (const env of [
      testEnv(),
      testEnv({ DEV: "true", IDENTITY_JWKS: JSON.stringify(testJwks(keys)) }),
    ]) {
      const identity = fakeIdentity(keys);
      const verifier = createVerifier(env, identity.fetch);
      expect(await verifier.verifySession(token, NOW)).toMatchObject({ sub: "u1" });
      expect(sessionChecks(identity)).toHaveLength(1);
    }
    expect(global).not.toHaveBeenCalled();
  });
});

describe("the inline key set", () => {
  const inline = (keys: Awaited<ReturnType<typeof testKeys>>) => JSON.stringify(testJwks(keys));

  it("counts in development: it replaces the address, which is never fetched", async () => {
    const inlineKeys = await testKeys();
    const addressKeys = await testKeys();
    const identity = fakeIdentity(addressKeys);
    const verifier = createVerifier(
      testEnv({ DEV: "true", IDENTITY_JWKS: inline(inlineKeys) }),
      identity.fetch,
    );

    const byInline = await signSessionToken({ sub: "inline" }, inlineKeys, NOW);
    const byAddress = await signSessionToken({ sub: "address" }, addressKeys, NOW);

    expect(await verifier.verifySession(byInline, NOW)).toMatchObject({ sub: "inline" });
    expect(await verifier.verifySession(byAddress, NOW)).toBeUndefined();
    expect(keyFetches(identity)).toEqual([]);
  });

  it("is honoured however old the verifier gets", async () => {
    const keys = await testKeys();
    const identity = fakeIdentity(keys);
    const verifier = createVerifier(
      testEnv({ DEV: "true", IDENTITY_JWKS: inline(keys) }),
      identity.fetch,
    );
    const token = await signSessionToken({ sub: "u1" }, keys, NOW);
    expect(await verifier.verifySession(token, NOW)).toMatchObject({ sub: "u1" });
    expect(await verifier.verifySession(token, after(3 * HOUR))).toMatchObject({ sub: "u1" });
    expect(keyFetches(identity)).toEqual([]);
  });

  it.each([undefined, "false", "1", "0", "True", "TRUE", "yes", "", " true", "true "])(
    "is ignored when DEV is %j: a cookie signed with it counts as anonymous",
    async (dev) => {
      const inlineKeys = await testKeys();
      const addressKeys = await testKeys();
      const identity = fakeIdentity(addressKeys);
      const verifier = createVerifier(
        testEnv({ DEV: dev, IDENTITY_JWKS: inline(inlineKeys) }),
        identity.fetch,
      );

      const byInline = await signSessionToken({ sub: "inline" }, inlineKeys, NOW);
      const byAddress = await signSessionToken({ sub: "address" }, addressKeys, NOW);

      expect(await verifier.verifySession(byInline, NOW)).toBeUndefined();
      expect(await verifier.verifySession(byAddress, NOW)).toMatchObject({ sub: "address" });
      expect(keyFetches(identity)).toHaveLength(1);
    },
  );

  it("is not even read outside development, so text that is not a key set is no error there", () => {
    for (const IDENTITY_JWKS of ["not json at all", "[]", "{}", "null"]) {
      expect(() => createVerifier(testEnv({ IDENTITY_JWKS }), fakeIdentity as never)).not.toThrow();
    }
  });

  it.each([
    ["not JSON", "secret-looking {", /^IDENTITY_JWKS is not JSON$/],
    [
      "an array of keys (the identity service's own variable)",
      "[]",
      /^IDENTITY_JWKS is not a key set/,
    ],
    ["an empty object", "{}", /^IDENTITY_JWKS is not a key set/],
    ["a single key", '{"kty":"EC","crv":"P-256","kid":"k"}', /^IDENTITY_JWKS is not a key set/],
    ["a string", '"secret-looking text"', /^IDENTITY_JWKS is not a key set/],
    ["a number", "7", /^IDENTITY_JWKS is not a key set/],
    ["null", "null", /^IDENTITY_JWKS is not a key set/],
    ["keys that is not an array", '{"keys":"none"}', /^IDENTITY_JWKS is not a key set/],
  ])(
    "stops the Worker in development when it is %s, without repeating it",
    (_name, text, message) => {
      const env = testEnv({ DEV: "true", IDENTITY_JWKS: text });
      expect(() => createVerifier(env, fakeIdentity as never)).toThrow(ConfigError);
      expect(() => createVerifier(env, fakeIdentity as never)).toThrow(message);
      expect(() => createVerifier(env, fakeIdentity as never)).not.toThrow(text);
    },
  );

  it("may be an empty key set, which signs nobody in", async () => {
    const keys = await testKeys();
    const verifier = createVerifier(
      testEnv({ DEV: "true", IDENTITY_JWKS: '{"keys":[]}' }),
      fakeIdentity(keys).fetch,
    );
    expect(
      await verifier.verifySession(await signSessionToken({ sub: "u1" }, keys, NOW), NOW),
    ).toBeUndefined();
  });
});

describe("the issuer", () => {
  it("is IDENTITY_ISSUER, and the session check goes to it without doubling the slash", async () => {
    const keys = await testKeys();
    const identity = fakeIdentity(keys);
    const verifier = createVerifier(
      testEnv({ IDENTITY_ISSUER: "https://id.meltemi.dev/" }),
      identity.fetch,
    );
    const token = await signSessionToken({ sub: "u1", sid: "abc" }, keys, NOW);
    expect(await verifier.verifySession(token, NOW)).toMatchObject({
      sub: "u1",
      iss: "https://id.meltemi.dev",
    });
    expect(sessionChecks(identity)).toEqual(["GET https://id.meltemi.dev/sessions/abc"]);
  });

  it("is the identity service of development when DEV says so, and only that one", async () => {
    const keys = await testKeys();
    const identity = fakeIdentity(keys, "http://localhost:8787");
    const verifier = createVerifier(
      testEnv({
        DEV: "true",
        IDENTITY_ISSUER: "http://localhost:8787",
        IDENTITY_JWKS_URL: "http://localhost:8787/.well-known/jwks.json",
      }),
      identity.fetch,
    );
    const local = await signSessionToken(
      { sub: "u1", sid: "abc", iss: "http://localhost:8787" },
      keys,
      NOW,
    );
    const production = await signSessionToken({ sub: "u1", sid: "abc" }, keys, NOW);

    expect(await verifier.verifySession(local, NOW)).toMatchObject({
      sub: "u1",
      iss: "http://localhost:8787",
    });
    expect(await verifier.verifySession(production, NOW)).toBeUndefined();
    expect(identity.calls).toEqual([
      "GET http://localhost:8787/.well-known/jwks.json",
      "GET http://localhost:8787/sessions/abc",
    ]);
  });

  it.each<[string, Partial<Env>, RegExp]>([
    [
      "an issuer over http",
      { IDENTITY_ISSUER: "http://id.meltemi.dev" },
      /IDENTITY_ISSUER must be https/,
    ],
    [
      "a key address over http",
      { IDENTITY_JWKS_URL: "http://id.meltemi.dev/jwks" },
      /IDENTITY_JWKS_URL must be https/,
    ],
    [
      "a key address that is not an address",
      { IDENTITY_JWKS_URL: "nonsense" },
      /IDENTITY_JWKS_URL is not an address/,
    ],
    ["no issuer", { IDENTITY_ISSUER: undefined }, /IDENTITY_ISSUER is not an address/],
    ["no key address", { IDENTITY_JWKS_URL: undefined }, /IDENTITY_JWKS_URL is not an address/],
  ])("is not built from %s outside development", (_name, overrides, message) => {
    expect(() => createVerifier(testEnv(overrides), fakeIdentity as never)).toThrow(ConfigError);
    expect(() => createVerifier(testEnv(overrides), fakeIdentity as never)).toThrow(message);
  });
});

describe.each([
  ["outside development", false],
  ["in development", true],
])("the session check %s", (_where, dev) => {
  async function setup(sid = "abc") {
    const keys = await testKeys();
    const identity = fakeIdentity(keys);
    const control = service(identity);
    const env = testEnv(dev ? { DEV: "true", IDENTITY_JWKS: JSON.stringify(testJwks(keys)) } : {});
    return {
      identity,
      control,
      verifier: createVerifier(env, control.fetch),
      token: await signSessionToken({ sub: "u1", sid }, keys, NOW),
    };
  }

  it("is a GET of <issuer>/sessions/<sid>, once an hour for each session", async () => {
    const { identity, verifier, token } = await setup();
    await verifier.verifySession(token, NOW);
    await verifier.verifySession(token, after(HOUR - 1));
    expect(sessionChecks(identity)).toEqual(["GET https://id.meltemi.dev/sessions/abc"]);
    await verifier.verifySession(token, after(HOUR));
    expect(sessionChecks(identity)).toHaveLength(2);
  });

  it("puts the session id in the path as one encoded segment", async () => {
    const { identity, verifier, token } = await setup("a/b c?d#e");
    expect(await verifier.verifySession(token, NOW)).toMatchObject({ sid: "a/b c?d#e" });
    expect(sessionChecks(identity)).toEqual([
      "GET https://id.meltemi.dev/sessions/a%2Fb%20c%3Fd%23e",
    ]);
  });

  it("lets a live session through (204)", async () => {
    const { verifier, token, control } = await setup();
    control.status = 204;
    expect(await verifier.verifySession(token, NOW)).toMatchObject({ sub: "u1" });
  });

  it("refuses a session the service says is gone (404) and remembers that for the hour", async () => {
    const { identity, verifier, token, control } = await setup();
    control.status = 404;
    expect(await verifier.verifySession(token, NOW)).toBeUndefined();

    control.status = 204;
    expect(await verifier.verifySession(token, after(HOUR - 1))).toBeUndefined();
    expect(sessionChecks(identity)).toHaveLength(1);

    expect(await verifier.verifySession(token, after(HOUR))).toMatchObject({ sub: "u1" });
    expect(sessionChecks(identity)).toHaveLength(2);
  });

  it.each([500, 502, 503, 429, 401, 403, 200, 301])(
    "refuses a session when the service answers %i, and does not keep that",
    async (status) => {
      const { identity, verifier, token, control } = await setup();
      control.status = status;
      expect(await verifier.verifySession(token, NOW)).toBeUndefined();

      control.status = 204;
      expect(await verifier.verifySession(token, after(1))).toMatchObject({ sub: "u1" });
      expect(sessionChecks(identity)).toHaveLength(2);
    },
  );
});

describe("an identity service that cannot be reached", () => {
  it("makes the session invalid outside development, and is asked again next time", async () => {
    const keys = await testKeys();
    const identity = fakeIdentity(keys);
    const control = service(identity);
    const verifier = createVerifier(testEnv(), control.fetch);
    const token = await signSessionToken({ sub: "u1" }, keys, NOW);

    control.status = "down";
    expect(await verifier.verifySession(token, NOW)).toBeUndefined();
    control.status = undefined;
    expect(await verifier.verifySession(token, NOW)).toMatchObject({ sub: "u1" });
  });

  it("passes the session in development, so a minted cookie works with nobody home", async () => {
    const keys = await testKeys();
    const identity = fakeIdentity(keys);
    const control = service(identity);
    control.status = "down";
    const verifier = createVerifier(
      testEnv({ DEV: "true", IDENTITY_JWKS: JSON.stringify(testJwks(keys)) }),
      control.fetch,
    );
    const token = await signSessionToken({ sub: "u1" }, keys, NOW);

    expect(await verifier.verifySession(token, NOW)).toMatchObject({ sub: "u1" });
    expect(sessionChecks(identity)).toHaveLength(1);
  });

  it("passes the session in development only because DEV is exactly true", async () => {
    const keys = await testKeys();
    for (const dev of [undefined, "false", "1", "True", ""]) {
      const identity = fakeIdentity(keys);
      identity.down = false;
      const control = service(identity);
      control.status = "down";
      const verifier = createVerifier(
        testEnv({ DEV: dev, IDENTITY_JWKS: JSON.stringify(testJwks(keys)) }),
        control.fetch,
      );
      const token = await signSessionToken({ sub: "u1" }, keys, NOW);
      expect(
        await verifier.verifySession(token, NOW),
        `DEV=${JSON.stringify(dev)}`,
      ).toBeUndefined();
    }
  });

  it("is given half a second in development, and a hung request counts as unreachable", async () => {
    const keys = await testKeys();
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    let reached!: () => void;
    const asked = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const hung: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        reached();
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("The operation timed out", "TimeoutError")),
          { once: true },
        );
      });
    const verifier = createVerifier(
      testEnv({ DEV: "true", IDENTITY_JWKS: JSON.stringify(testJwks(keys)) }),
      hung,
    );

    const pending = verifier.verifySession(await signSessionToken({ sub: "u1" }, keys, NOW), NOW);
    await asked;
    controller.abort();

    expect(await pending).toMatchObject({ sub: "u1" });
    expect(timeout).toHaveBeenCalledExactlyOnceWith(500);
  });

  it("is not told apart from a service that answers in development unless it answers 204 or 404", async () => {
    const keys = await testKeys();
    const identity = fakeIdentity(keys);
    const control = service(identity);
    const verifier = createVerifier(
      testEnv({ DEV: "true", IDENTITY_JWKS: JSON.stringify(testJwks(keys)) }),
      control.fetch,
    );
    const token = await signSessionToken({ sub: "u1" }, keys, NOW);

    // Unwell (an answer that is not an answer): invalid now, and the next request asks again.
    control.status = 500;
    expect(await verifier.verifySession(token, NOW)).toBeUndefined();
    // Gone: invalid, and kept.
    control.status = 404;
    expect(await verifier.verifySession(token, NOW)).toBeUndefined();
    control.status = 204;
    expect(await verifier.verifySession(token, NOW)).toBeUndefined();
  });
});
