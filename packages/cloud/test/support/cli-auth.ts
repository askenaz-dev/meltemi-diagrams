// Test support for the command line's sign-in: a store that remembers what was written to it,
// helpers that drive the real flow through the approval page, and oracles for the check value and
// the csrf token written out here so they share no code with the Worker.

import { createHash, createHmac } from "node:crypto";
import { memoryStore } from "../../src/store/memory.js";
import type { CliCode, CloudStore, TokenRow } from "../../src/store/types.js";
import type { Harness } from "./index.js";

/** The `FORMS_SECRET` of `testEnv()`. */
export const FORMS_SECRET = "test-forms-secret";

/** An address from the documentation range, so a test never names a real caller. */
export const IP = "203.0.113.7";

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** A valid `state` of `length` base64url characters (the command line makes 43: 32 bytes). */
export function stateOf(length = 43, offset = 0): string {
  let out = "";
  for (let i = 0; i < length; i++) out += BASE64URL[(i * 7 + offset) % 64];
  return out;
}

export const STATE = stateOf();

// ---------------------------------------------------------------------------------------------
// Oracles

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * The six-character check of a state, worked out from the bits: the first 30 bits of the SHA-256
 * of the state, five at a time, through the RFC 4648 base32 alphabet.
 */
export function checkOf(state: string): string {
  const bits = [...createHash("sha256").update(state, "utf8").digest()]
    .map((byte) => byte.toString(2).padStart(8, "0"))
    .join("");
  let out = "";
  for (let i = 0; i < 30; i += 5) out += BASE32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

/** The hex HMAC-SHA256 of `data` with `secret`. */
export function hmacOf(data: string, secret = FORMS_SECRET): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

/** The csrf token the approval page must carry for a session. */
export function csrfOf(sid: string, secret = FORMS_SECRET): string {
  return hmacOf(`cli-auth:${sid}`, secret);
}

/** The key a caller's failures are counted under: a keyed hash of its address, apart from the csrf. */
export function callerOf(address: string, secret = FORMS_SECRET): string {
  return hmacOf(`cli-caller:${address}`, secret);
}

// ---------------------------------------------------------------------------------------------
// A store that remembers

export interface StoreLog {
  /** The codes written, in order. */
  readonly codes: CliCode[];
  /** The hashes asked of `takeCliCode`, in order. */
  readonly taken: string[];
  /** The failures recorded, in order. */
  readonly failures: { key: string; at: string }[];
  /** The tokens created (not the refused ones), in order. */
  readonly tokens: TokenRow[];
}

/** The memory store, plus a log of the writes that matter to the command line's sign-in. */
export function recordingStore(inner: CloudStore = memoryStore()): {
  store: CloudStore;
  log: StoreLog;
} {
  const log: StoreLog = { codes: [], taken: [], failures: [], tokens: [] };
  const store: CloudStore = {
    ...inner,
    async createCliCode(code) {
      log.codes.push(code);
      await inner.createCliCode(code);
    },
    async takeCliCode(hash) {
      log.taken.push(hash);
      return inner.takeCliCode(hash);
    },
    async recordCliFailure(key, at) {
      log.failures.push({ key, at });
      await inner.recordCliFailure(key, at);
    },
    async createToken(token, limit) {
      const outcome = await inner.createToken(token, limit);
      if (outcome === "created") log.tokens.push(token);
      return outcome;
    },
  };
  return { store, log };
}

/** Gives a person `count` tokens straight into the store (ids and hashes are made up). */
export async function fillTokens(h: Harness, sub: string, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const outcome = await h.store.createToken(
      {
        id: `existing-${sub}-${i}`,
        sub,
        name: `token ${i}`,
        hash: `hash-${sub}-${i}`,
        createdAt: h.clock.now().toISOString(),
        lastUsedAt: null,
      },
      100,
    );
    if (outcome !== "created") throw new Error("the test could not fill the tokens");
  }
}

// ---------------------------------------------------------------------------------------------
// Driving the flow

/** The value of a hidden field of the approval page. */
export function fieldOf(html: string, name: string): string | undefined {
  return new RegExp(`<input type="hidden" name="${name}" value="([^"]*)">`).exec(html)?.[1];
}

/** The query of an approval request. */
export function queryOf(port: string, state: string, extra: Record<string, string> = {}): string {
  return new URLSearchParams({ port, state, ...extra }).toString();
}

/** Posts a form to the Worker the way the page does: from the page's own origin, with the cookie. */
export function postForm(
  h: Harness,
  cookie: string,
  fields: Record<string, string>,
  path = "/cli-auth",
  init: RequestInit = {},
): Promise<Response> {
  return h.request(
    path,
    h.fromPage(cookie, { ...init, method: "POST", body: new URLSearchParams(fields) }),
  );
}

export interface Approval {
  readonly response: Response;
  readonly location: string;
  /** The code in the redirect; "" when the approval was refused. */
  readonly code: string;
  readonly port: string;
  readonly state: string;
  readonly csrf: string;
}

/**
 * A person approves: the page is requested, its csrf token is read from the form, and the form is
 * posted. The redirect's code is returned when there is one.
 */
export async function approved(
  h: Harness,
  person: { cookie: string },
  options: { port?: string; state?: string } = {},
): Promise<Approval> {
  const port = options.port ?? "43123";
  const state = options.state ?? STATE;
  const page = await h.request(`/cli-auth?${queryOf(port, state)}`, h.fromPage(person.cookie));
  const csrf = fieldOf(await page.text(), "csrf");
  if (!csrf) throw new Error("the approval page held no csrf token");
  const response = await postForm(h, person.cookie, { port, state, csrf });
  const location = response.headers.get("Location") ?? "";
  const code = response.status === 303 ? (new URL(location).searchParams.get("code") ?? "") : "";
  return { response, location, code, port, state, csrf };
}

/**
 * The command line exchanges a code: a JSON request from a terminal, with no cookie and no
 * `Origin`. `ip` is the address Cloudflare would report (`null` for none).
 */
export function exchange(
  h: Harness,
  body: unknown,
  options: { ip?: string | null; headers?: Record<string, string> } = {},
): Promise<Response> {
  const headers = new Headers({ "Content-Type": "application/json", ...options.headers });
  const ip = options.ip === undefined ? IP : options.ip;
  if (ip !== null) headers.set("CF-Connecting-IP", ip);
  return h.request("/cli-auth/token", {
    method: "POST",
    headers,
    // Text and bytes travel as they are; anything else as JSON.
    body:
      typeof body === "string"
        ? body
        : body instanceof Uint8Array
          ? new Uint8Array(body)
          : JSON.stringify(body),
  });
}

/** Sends `times` exchanges that fail (an unknown code) from `ip`; returns their statuses. */
export async function failTimes(
  h: Harness,
  times: number,
  ip: string | null = IP,
): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < times; i++) {
    const response = await exchange(h, { code: `unknown-code-${i}`, state: STATE }, { ip });
    statuses.push(response.status);
  }
  return statuses;
}

/**
 * The harness with every response it gives kept as text (status, headers and body), so a test
 * can look for something that must appear nowhere.
 */
export function taped(h: Harness): { h: Harness; seen: string[] } {
  const seen: string[] = [];
  const request: Harness["request"] = async (path, init) => {
    const response = await h.request(path, init);
    const copy = response.clone();
    const headers = [...copy.headers].map(([name, value]) => `${name}: ${value}`);
    seen.push([String(copy.status), ...headers, await copy.text()].join("\n"));
    return response;
  };
  return { h: { ...h, request }, seen };
}
