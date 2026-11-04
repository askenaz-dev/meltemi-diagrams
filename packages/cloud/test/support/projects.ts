// Test support for the tests of projects, versions, thumbnails and usage: a harness with the
// templates served, people who ask as the page does (a fresh cookie for every request, so that a test
// that walks the clock for weeks keeps its sessions), and the shorthands they share.

import { createHash } from "node:crypto";
import type { Bytes } from "../../src/crypto.js";
import { harness, jsonOf, type Harness } from "./index.js";
import { serveTemplates } from "./templates.js";

export const JSON_TYPE = { "Content-Type": "application/json" };
export const T = "2026-10-14T12:00:00.000Z";
export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const KIB = 1024;
export const MIB = 1024 * 1024;

export const sha = (content: Uint8Array | string): string =>
  createHash("sha256").update(content).digest("hex");

/** A PNG's signature and then a few bytes: all the type check reads. */
export const pngBytes = (tail = "a picture"): Bytes =>
  new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...new TextEncoder().encode(tail),
  ]);

/** A well-formed SVG of about `bytes` bytes (at least a few dozen). */
export function svgOf(bytes = 0, inner = "<circle r='1'/>"): string {
  const open = '<svg xmlns="http://www.w3.org/2000/svg">';
  const close = "</svg>";
  const base = `${open}${inner}${close}`;
  if (bytes <= base.length) return base;
  // A comment as padding keeps it well-formed whatever its length.
  const padding = bytes - base.length - "<!---->".length;
  return `${open}${inner}<!--${"x".repeat(Math.max(0, padding))}-->${close}`;
}

/** What a person's session says, besides who they are: the email and whether the provider verified it. */
export interface SessionProfile {
  readonly email?: string;
  readonly emailVerified?: boolean;
  readonly name?: string;
}

export interface Projects {
  readonly h: Harness;
  /** Asks as the person `sub`, as the page does: a fresh cookie and the page's own `Origin`. */
  send(
    sub: string,
    method: string,
    path: string,
    body?: BodyInit,
    headers?: Record<string, string>,
  ): Promise<Response>;
  /** `send` with a JSON body. */
  sendJson(sub: string, method: string, path: string, body: unknown): Promise<Response>;
  /** Asks as nobody: no cookie, no token and no `Origin`, as a browser that is not signed in does. */
  anonymous(
    method: string,
    path: string,
    body?: BodyInit,
    headers?: Record<string, string>,
  ): Promise<Response>;
  /** What the sessions of the person `sub` say from now on (their email, whether it is verified). */
  profile(sub: string, profile: SessionProfile): void;
  /** Creates a project through the API and answers its id. */
  create(sub: string, body?: Record<string, unknown>): Promise<string>;
}

/** A harness whose people exist once they have asked for anything. */
export async function projects(options: Parameters<typeof harness>[0] = {}): Promise<Projects> {
  const h = await harness(options);
  serveTemplates(h);
  const profiles = new Map<string, SessionProfile>();
  const send: Projects["send"] = async (sub, method, path, body, headers = {}) => {
    const { cookie } = await h.signedIn({ sub, name: sub, ...profiles.get(sub) });
    return h.request(
      path,
      h.fromPage(cookie, { method, ...(body === undefined ? {} : { body, headers }) }),
    );
  };
  const sendJson: Projects["sendJson"] = (sub, method, path, body) =>
    send(sub, method, path, JSON.stringify(body), JSON_TYPE);
  const anonymous: Projects["anonymous"] = (method, path, body, headers = {}) =>
    h.request(path, { method, ...(body === undefined ? {} : { body, headers }) });
  const create: Projects["create"] = async (sub, body = { name: "A project" }) => {
    const response = await sendJson(sub, "POST", "/api/projects", body);
    if (response.status !== 201) {
      throw new Error(`the project was not created: ${response.status} ${await response.text()}`);
    }
    return (await jsonOf<{ id: string }>(response)).id;
  };
  return {
    h,
    send,
    sendJson,
    anonymous,
    profile: (sub, profile) => profiles.set(sub, profile),
    create,
  };
}

/** The `code` of an error answer. */
export async function codeOf(response: Response): Promise<string | undefined> {
  return (await jsonOf<{ code?: string }>(response.clone())).code;
}
