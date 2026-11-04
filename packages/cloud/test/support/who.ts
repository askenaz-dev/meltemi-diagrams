// Test support for "who is asking": the variations of configuration, cookies and tokens that the
// principal, verifier, session and Origin tests share. It builds on `harness()`; nothing here
// reaches the network.

import type { SessionClaims } from "@meltemi/identity";
import { signSessionToken, testJwks, testKeys, type TestKeys } from "@meltemi/identity/testing";
import { base64url, utf8 } from "../../src/crypto.js";
import type { Env } from "../../src/env.js";
import { cloud } from "../../src/handler.js";
import { hashToken } from "../../src/principal.js";
import { MAX_TOKENS, type CloudStore, type TokenRow } from "../../src/store/types.js";
import type { Deps } from "../../src/types.js";
import { createVerifier } from "../../src/verifier.js";
import type { FakeIdentity, Harness } from "./index.js";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Everything a test needs to call the Worker built from one configuration. */
export interface Variant {
  readonly env: Env;
  readonly deps: Deps;
  readonly identity: FakeIdentity;
  request(path: string, init?: RequestInit): Promise<Response>;
}

/**
 * The same Worker (store, clock, randomness) with another environment and a verifier of its own
 * built from it, reaching `identity` (the harness's by default). A path is taken against `ORIGIN`;
 * a full address is used as it is.
 */
export function variant(
  h: Harness,
  overrides: Partial<Env> = {},
  identity: FakeIdentity = h.identity,
): Variant {
  const env: Env = { ...h.env, ...overrides };
  const deps: Deps = {
    ...h.deps,
    verifier: createVerifier(env, identity.fetch),
    fetch: identity.fetch,
  };
  return {
    env,
    deps,
    identity,
    request: (path, init) =>
      cloud(new Request(path.startsWith("http") ? path : `${env.ORIGIN}${path}`, init), env, deps),
  };
}

/**
 * The Worker as `wrangler dev` runs it with a minted cookie: `DEV=true` and the harness's keys
 * inline, so no identity service is needed for the keys.
 */
export function devVariant(
  h: Harness,
  overrides: Partial<Env> = {},
  identity?: FakeIdentity,
): Variant {
  return variant(
    h,
    { DEV: "true", IDENTITY_JWKS: JSON.stringify(testJwks(h.keys)), ...overrides },
    identity,
  );
}

/** The requests the fake identity service saw for its key set. */
export function keyFetches(identity: FakeIdentity): string[] {
  return identity.calls.filter((call) => call.includes("/.well-known/jwks.json"));
}

/** The requests the fake identity service saw for a session check. */
export function sessionChecks(identity: FakeIdentity): string[] {
  return identity.calls.filter((call) => call.includes("/sessions/"));
}

// ---------------------------------------------------------------------------------------------
// Cookies

/** A `Cookie` header value for a session token with these claims, signed by `keys` at `at`. */
export async function cookieOf(
  keys: TestKeys,
  claims: Partial<SessionClaims> & { readonly sub: string },
  at: Date,
): Promise<string> {
  return `meltemi_session=${await signSessionToken(claims, keys, at)}`;
}

/** The JSON of a token part, as one base64url piece. */
function part(value: unknown): string {
  return base64url(utf8(JSON.stringify(value)));
}

/**
 * A compact token whose signature is a real ES256 signature of `<header>.<payload>` by `keys`,
 * whatever the header says: it isolates the one thing a test changed (the `kid`, a claim).
 */
export async function craft(
  keys: TestKeys,
  header: Record<string, unknown>,
  claims: Record<string, unknown>,
): Promise<string> {
  const { kty, crv, x, y, d } = keys.privateJwk;
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty, crv, x, y, d, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const input = `${part(header)}.${part(claims)}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(input)),
  );
  return `${input}.${base64url(signature)}`;
}

/** A token with the claims of `token` altered by `change` and its old signature kept. */
export function withClaims(token: string, change: Record<string, unknown>): string {
  const [header, payload, signature] = token.split(".") as [string, string, string];
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
  return `${header}.${part({ ...claims, ...change })}.${signature}`;
}

// ---------------------------------------------------------------------------------------------
// Cookies that must not make anybody anyone: each recipe answers a `Cookie` header value.

export type Recipe = (h: Harness) => Promise<string>;

const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

/** Claims of the harness's issuer for `u1`, as the identity service would sign them at `at`. */
function claimsAt(h: Harness, at: Date): Record<string, unknown> {
  const iat = seconds(at);
  return {
    iss: h.env.IDENTITY_ISSUER,
    aud: "meltemi",
    sub: "u1",
    sid: "sid-u1",
    name: "Ana",
    picture: "",
    email: "ana@example.com",
    email_verified: true,
    iat,
    exp: iat + 30 * 24 * 60 * 60,
  };
}

/**
 * Cookies a request may carry and the Worker must treat as no cookie at all. `u1` is the person
 * every one of them pretends to be.
 */
export const COOKIES_THAT_DO_NOT_COUNT: [string, Recipe][] = [
  [
    "a token that expired yesterday",
    (h) =>
      cookieOf(
        h.keys,
        { sub: "u1", sid: "sid-u1", iss: h.env.IDENTITY_ISSUER },
        new Date(h.clock.now().getTime() - 31 * DAY),
      ),
  ],
  [
    "a token whose exp passed a minute and a second ago",
    (h) => {
      const now = h.clock.now();
      return cookieOf(
        h.keys,
        { sub: "u1", sid: "sid-u1", iss: h.env.IDENTITY_ISSUER, exp: seconds(now) - 61 },
        now,
      );
    },
  ],
  [
    "a token issued a day from now",
    (h) =>
      cookieOf(
        h.keys,
        { sub: "u1", sid: "sid-u1", iss: h.env.IDENTITY_ISSUER },
        new Date(h.clock.now().getTime() + DAY),
      ),
  ],
  [
    "a token signed by other keys",
    async (h) =>
      cookieOf(
        await testKeys(),
        { sub: "u1", sid: "sid-u1", iss: h.env.IDENTITY_ISSUER },
        h.clock.now(),
      ),
  ],
  [
    "a signature by other keys under the real key's kid",
    async (h) => {
      const impostor = await testKeys();
      const token = await craft(
        impostor,
        { alg: "ES256", typ: "JWT", kid: h.keys.publicJwk.kid },
        claimsAt(h, h.clock.now()),
      );
      return `meltemi_session=${token}`;
    },
  ],
  [
    "a payload altered after it was signed",
    async (h) => {
      const real = await signSessionToken(
        { sub: "u2", sid: "sid-u2", iss: h.env.IDENTITY_ISSUER },
        h.keys,
        h.clock.now(),
      );
      return `meltemi_session=${withClaims(real, { sub: "u1", sid: "sid-u1" })}`;
    },
  ],
  [
    "an unsigned token (alg none)",
    async (h) =>
      `meltemi_session=${part({ alg: "none", typ: "JWT", kid: h.keys.publicJwk.kid })}.${part(
        claimsAt(h, h.clock.now()),
      )}.`,
  ],
  [
    "a token of another issuer",
    (h) =>
      cookieOf(h.keys, { sub: "u1", sid: "sid-u1", iss: "https://evil.example" }, h.clock.now()),
  ],
  [
    "a token whose issuer is the right one over http",
    (h) =>
      cookieOf(h.keys, { sub: "u1", sid: "sid-u1", iss: "http://id.meltemi.dev" }, h.clock.now()),
  ],
  [
    "a token whose issuer ends with a slash",
    (h) =>
      cookieOf(h.keys, { sub: "u1", sid: "sid-u1", iss: "https://id.meltemi.dev/" }, h.clock.now()),
  ],
  [
    "a token for another audience",
    (h) =>
      cookieOf(
        h.keys,
        { sub: "u1", sid: "sid-u1", iss: h.env.IDENTITY_ISSUER, aud: "another-product" },
        h.clock.now(),
      ),
  ],
  ["text that is not a token", async () => "meltemi_session=not-a-token"],
  ["three words between dots", async () => "meltemi_session=abc.def.ghi"],
  ["an empty cookie", async () => "meltemi_session="],
  ["a cookie of 5000 characters", async () => `meltemi_session=${"a".repeat(5000)}`],
  [
    "a good token under another cookie's name",
    async (h) => {
      const { cookie } = await h.signedIn({ sub: "u1" });
      return cookie.replace("meltemi_session=", "session=");
    },
  ],
];

// ---------------------------------------------------------------------------------------------
// API tokens

let made = 0;

export interface StoredToken {
  /** The token as the person holds it; the store has only its hash. */
  readonly token: string;
  readonly row: TokenRow;
}

/** Stores an API token the way the service does (only its SHA-256) and returns it with its row. */
export async function addToken(
  store: CloudStore,
  options: {
    readonly sub: string;
    readonly name?: string;
    readonly value?: string;
    readonly lastUsedAt?: string | null;
    readonly createdAt?: string;
  },
): Promise<StoredToken> {
  made += 1;
  const token = options.value ?? `mdg_test-token-${made}`;
  const row: TokenRow = {
    id: `token-${made}`,
    sub: options.sub,
    name: options.name ?? "laptop",
    hash: await hashToken(token),
    createdAt: options.createdAt ?? "2026-10-01T00:00:00.000Z",
    lastUsedAt: options.lastUsedAt ?? null,
  };
  if ((await store.createToken(row, MAX_TOKENS)) !== "created") {
    throw new Error("the test token was not stored");
  }
  return { token, row };
}

/** A request init that carries a bearer token. */
export function bearer(token: string, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}
