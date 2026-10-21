// Test support: everything a test of the cloud Worker needs, with no network and no cloud.
// `harness()` builds an environment, a fake clock, generated keys, an in-memory store, a fake
// identity service and fake assets, and gives `request()` to call the Worker as a browser would.

import { signSessionToken, testJwks, testKeys, type TestKeys } from "@meltemi/identity/testing";
import type { Env } from "../../src/env.js";
import { cloud } from "../../src/handler.js";
import { materialise } from "../../src/materialise.js";
import { memoryStore } from "../../src/store/memory.js";
import type { CloudStore } from "../../src/store/types.js";
import type { Deps } from "../../src/types.js";
import { createVerifier } from "../../src/verifier.js";
import { fakeR2, type FakeR2 } from "./r2.js";
import { memoryRooms, type MemoryRooms, type MemoryRoomsOptions } from "./rooms.js";

export { memoryStore, testKeys };
export { fakeR2, type FakeR2 };
export { memoryRooms, type MemoryRooms };

// ---------------------------------------------------------------------------------------------
// A clock that only moves when a test says so.

export interface FakeClock {
  now(): Date;
  set(iso: string): void;
  advance(ms: number): void;
}

export function fakeClock(start = "2026-10-14T12:00:00.000Z"): FakeClock {
  let time = new Date(start).getTime();
  return {
    now: () => new Date(time),
    set: (iso) => {
      time = new Date(iso).getTime();
    },
    advance: (ms) => {
      time += ms;
    },
  };
}

/** Deterministic "random" bytes: a counter-seeded generator, so a run is the same every time. */
export function seededRandom(seed = 1): (length: number) => Uint8Array {
  let state = seed >>> 0 || 1;
  return (length) => {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      state ^= state << 13;
      state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      bytes[i] = state & 0xff;
    }
    return bytes;
  };
}

// ---------------------------------------------------------------------------------------------
// The identity service as the Worker sees it: its key set and its session check, from memory.
// A request to any other address is an error: no test reaches the network.

export interface FakeIdentity {
  readonly fetch: typeof fetch;
  /** Every request made, as `METHOD url`, in order. */
  readonly calls: string[];
  /** The session ids the service answers 404 for. */
  readonly revoked: Set<string>;
  /** When true, the service is unreachable (the fetch throws). */
  down: boolean;
}

export function fakeIdentity(keys: TestKeys, issuer = "https://id.meltemi.dev"): FakeIdentity {
  const identity: FakeIdentity = {
    calls: [],
    revoked: new Set(),
    down: false,
    fetch: async (input, init) => {
      const request = new Request(input as RequestInfo, init);
      identity.calls.push(`${request.method} ${request.url}`);
      if (identity.down) throw new TypeError("the identity service is unreachable");
      if (request.url === `${issuer}/.well-known/jwks.json`) {
        return new Response(JSON.stringify(testJwks(keys)), {
          headers: { "Content-Type": "application/json" },
        });
      }
      if (request.url.startsWith(`${issuer}/sessions/`)) {
        const sid = decodeURIComponent(request.url.slice(`${issuer}/sessions/`.length));
        return new Response(null, { status: identity.revoked.has(sid) ? 404 : 204 });
      }
      throw new Error(`The test made a request to ${request.url}: no test reaches the network`);
    },
  };
  return identity;
}

// ---------------------------------------------------------------------------------------------
// The environment, the dependencies and a way to call the Worker.

export function testEnv(overrides: Partial<Env> = {}): Env {
  const unavailable = () => {
    throw new Error("D1 is not available in the tests: use the in-memory store");
  };
  return {
    ORIGIN: "https://diagrams.meltemi.dev",
    IDENTITY_ISSUER: "https://id.meltemi.dev",
    IDENTITY_JWKS_URL: "https://id.meltemi.dev/.well-known/jwks.json",
    IDENTITY_EVENTS_SECRET: "test-events-secret",
    FORMS_SECRET: "test-forms-secret",
    DB: { prepare: unavailable, batch: unavailable },
    ASSETS: {
      fetch: async () => {
        throw new Error("the test did not provide assets");
      },
    },
    ROOMS: {
      idFromName: () => {
        throw new Error("the Durable Objects are not available in the tests: use h.rooms");
      },
      get: () => {
        throw new Error("the Durable Objects are not available in the tests: use h.rooms");
      },
    },
    BLOBS: fakeR2(),
    ...overrides,
  };
}

export interface FakeAssets {
  /** The paths asked of the assets, in order. */
  readonly calls: string[];
  /** Answers by path; a path not listed is a 404 like the real binding's. */
  readonly files: Map<string, { body: string; type: string }>;
  readonly binding: Env["ASSETS"];
}

export function fakeAssets(): FakeAssets {
  const assets: FakeAssets = {
    calls: [],
    files: new Map([
      ["/", { body: "<!doctype html><title>playground</title>", type: "text/html" }],
    ]),
    binding: {
      fetch: async (request) => {
        const path = new URL(request.url).pathname;
        assets.calls.push(path);
        const file = assets.files.get(path);
        if (!file) return new Response("Not found", { status: 404 });
        return new Response(file.body, { headers: { "Content-Type": file.type } });
      },
    },
  };
  return assets;
}

export interface Harness {
  readonly env: Env;
  readonly deps: Deps;
  readonly store: CloudStore;
  /**
   * The projects' rooms, in memory: the room's real logic over a fake clock, storage and sockets,
   * and the real materialiser over `store` and `blobs` (unless the harness was given its own).
   */
  readonly rooms: MemoryRooms;
  /** The R2 bucket (`env.BLOBS`), in memory. */
  readonly blobs: FakeR2;
  readonly clock: FakeClock;
  readonly keys: TestKeys;
  readonly identity: FakeIdentity;
  readonly assets: FakeAssets;
  /** Calls the Worker as a browser would: a path (or full URL) and the usual `RequestInit`. */
  request(path: string, init?: RequestInit): Promise<Response>;
  /** A `Cookie` header value of a person with a live session minted with the test keys. */
  signedIn(person?: {
    sub?: string;
    name?: string;
    picture?: string;
    email?: string;
    emailVerified?: boolean;
    sid?: string;
  }): Promise<{ cookie: string; sid: string; sub: string }>;
  /** A request init that comes from this service's own page: `Origin` and the cookie set. */
  fromPage(cookie: string, init?: RequestInit): RequestInit;
}

export async function harness(
  options: {
    env?: Partial<Env>;
    store?: CloudStore;
    start?: string;
    /** Narrower limits for the rooms, so that a test of a limit does not have to build a huge document. */
    roomLimits?: MemoryRoomsOptions["limits"];
    /** What the rooms' `materialise()` does; by default the real one over `store` and the bucket. */
    materialise?: MemoryRoomsOptions["materialise"];
  } = {},
): Promise<Harness> {
  const keys = await testKeys();
  const clock = fakeClock(options.start);
  const identity = fakeIdentity(keys);
  const assets = fakeAssets();
  const store = options.store ?? memoryStore();
  // The bucket tells time by the test's clock, so that a test can make an object old.
  const blobs = fakeR2(() => clock.now());
  const env = testEnv({ ASSETS: assets.binding, BLOBS: blobs, ...options.env });
  const rooms = memoryRooms({
    store,
    clock,
    materialise:
      options.materialise ??
      ((input) => materialise({ store, blobs: env.BLOBS, now: () => clock.now() }, input)),
    ...(options.roomLimits ? { limits: options.roomLimits } : {}),
  });
  const deps: Deps = {
    store,
    rooms,
    verifier: createVerifier(env, identity.fetch),
    assets: assets.binding,
    now: () => clock.now(),
    randomBytes: seededRandom(),
    fetch: identity.fetch,
  };
  let people = 0;
  return {
    env,
    deps,
    store,
    rooms,
    blobs,
    clock,
    keys,
    identity,
    assets,
    request: (path, init) => {
      const url = path.startsWith("http") ? path : `${env.ORIGIN}${path}`;
      return cloud(new Request(url, init), env, deps);
    },
    async signedIn(person = {}) {
      people += 1;
      const sub = person.sub ?? `user-${people}`;
      const sid = person.sid ?? `sid-${sub}`;
      const token = await signSessionToken(
        {
          sub,
          sid,
          name: person.name ?? "Ana",
          picture: person.picture ?? "",
          email: person.email ?? "ana@example.com",
          email_verified: person.emailVerified ?? true,
          iss: env.IDENTITY_ISSUER,
        },
        keys,
        clock.now(),
      );
      return { cookie: `meltemi_session=${token}`, sid, sub };
    },
    fromPage(cookie, init = {}) {
      const headers = new Headers(init.headers);
      headers.set("Cookie", cookie);
      headers.set("Origin", env.ORIGIN);
      return { ...init, headers };
    },
  };
}

/** The JSON body of a response. */
export async function jsonOf<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
