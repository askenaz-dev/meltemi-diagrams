/**
 * What the scenarios of the browser suite share: asking the Worker from Node, a session cookie
 * minted with the test keys, the listener that stands for the command line, what to watch in the
 * browser, and a computation of the approval page's check that uses none of the Worker's code.
 */
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { signSessionToken, type TestKeys } from "@meltemi/identity/testing";
import type { BrowserContext, Page } from "playwright-core";
import type { Person } from "./scenario.js";
import { IDENTITY, type RunningWorker } from "./worker.js";

/** A problem the person running the suite can fix: reported as its message, without a stack. */
export class SuiteError extends Error {}

// ---------------------------------------------------------------------------------------------
// Sessions

/** The cookie the identity service sets and every product reads. */
export const SESSION_COOKIE = "meltemi_session";

/**
 * A session token as the identity service would sign it for a person: the local issuer, the test
 * keys and a `picture` under the Worker's own origin (the page draws avatars from its own origin
 * only, and the suite checks that no request leaves it). `sid` names the session so that the
 * stand-in for the identity service can be told about it; `keys` and `at` are for the sessions that
 * must not count: signed by other keys, or issued a long time ago.
 */
export function mintSession(
  worker: RunningWorker,
  sub: string,
  options: {
    readonly name?: string;
    readonly sid?: string;
    readonly keys?: TestKeys;
    readonly at?: Date;
    /** The email the provider vouches for; `<sub>@example.com` by default. */
    readonly email?: string;
    /** Whether the provider verified it (it did, by default). */
    readonly emailVerified?: boolean;
  } = {},
): Promise<string> {
  return signSessionToken(
    {
      sub,
      name: options.name ?? "Ana",
      iss: IDENTITY,
      picture: `${worker.origin}/favicon.svg`,
      email: options.email ?? `${sub}@example.com`,
      email_verified: options.emailVerified ?? true,
      ...(options.sid === undefined ? {} : { sid: options.sid }),
    },
    options.keys ?? worker.keys,
    options.at ?? new Date(),
  );
}

/** What a person is made with: the name and the email their session carries (see `mintSession`). */
export interface PersonOptions {
  readonly name?: string;
  readonly email?: string;
  readonly emailVerified?: boolean;
}

/** A person with a session of their own, who calls the Worker as the page would. */
export async function makePerson(
  worker: RunningWorker,
  sub: string,
  options: PersonOptions = {},
): Promise<Person> {
  const token = await mintSession(worker, sub, options);
  const cookie = { Cookie: `${SESSION_COOKIE}=${token}` };
  return {
    sub,
    token,
    cookie,
    api(method, path, body, headers = {}) {
      const sent: Record<string, string> = { ...cookie, Origin: worker.origin, ...headers };
      let payload: BodyInit | undefined;
      if (body === undefined) payload = undefined;
      else if (typeof body === "string" || body instanceof Uint8Array) {
        payload = body as unknown as BodyInit;
      } else {
        payload = JSON.stringify(body);
        if (!Object.keys(sent).some((name) => name.toLowerCase() === "content-type")) {
          sent["Content-Type"] = "application/json";
        }
      }
      return ask(`${worker.origin}${path}`, {
        method,
        headers: sent,
        ...(payload === undefined ? {} : { body: payload }),
      });
    },
  };
}

/** The session cookie of a minted token, for a browser context on `localhost` (any port). */
export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    domain: "localhost",
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Lax" as const,
  };
}

// ---------------------------------------------------------------------------------------------
// Asking the Worker from Node

/** What the Worker answered: the status, the headers and the body as text. */
export interface Answer {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
  /** The body as JSON; fails the test when it is not. */
  json(): Record<string, unknown>;
}

/** A request from Node. Redirects are not followed: the answer is what the Worker said. */
export async function ask(url: string, init: RequestInit = {}): Promise<Answer> {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
    ...init,
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    text,
    json() {
      const value: unknown = JSON.parse(text);
      assert.ok(
        typeof value === "object" && value !== null && !Array.isArray(value),
        `not a JSON object: ${text.slice(0, 200)}`,
      );
      return value as Record<string, unknown>;
    },
  };
}

/** The headers of a request that carries a bearer token. */
export const bearer = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
});

/** `{ code, message }`, the Worker's error: asserts the status and the stable code. */
export function assertError(answer: Answer, status: number, code: string): void {
  assert.equal(answer.status, status, `status of ${answer.text.slice(0, 200)}`);
  const body = answer.json();
  assert.equal(body["code"], code);
  assert.equal(typeof body["message"], "string");
  assert.deepEqual(Object.keys(body).sort(), ["code", "message"]);
}

/** The shape of a token as the page and the command line see it: `mdg_` and 32 bytes in base64url. */
export const TOKEN_SHAPE = /^mdg_[A-Za-z0-9_-]{43}$/;

/**
 * An event as the identity service posts it to a product: its JSON text and the headers that
 * authenticate it (`Meltemi-Signature: v1=<hex HMAC-SHA256 of the body, keyed with the secret>`).
 */
export function signedEvent(
  secret: string,
  event: Record<string, unknown>,
): { readonly body: string; readonly headers: Record<string, string> } {
  const body = JSON.stringify(event);
  return {
    body,
    headers: {
      "Content-Type": "application/json",
      "Meltemi-Event-Id": String(event["id"]),
      "Meltemi-Signature": `v1=${createHmac("sha256", secret).update(body).digest("hex")}`,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The check of the approval page, computed from the RFC and the hash alone

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32 without padding: the bits five at a time, written out as text. */
export function base32(bytes: Uint8Array): string {
  const bits = [...bytes].map((byte) => byte.toString(2).padStart(8, "0")).join("");
  let out = "";
  for (let at = 0; at < bits.length; at += 5) {
    out += BASE32[parseInt(bits.slice(at, at + 5).padEnd(5, "0"), 2)];
  }
  return out;
}

/** The test vectors of RFC 4648 section 10 (their padding removed): proof that `base32` is the RFC's. */
export function assertBase32IsTheRfcs(): void {
  const vectors: [string, string][] = [
    ["", ""],
    ["f", "MY"],
    ["fo", "MZXQ"],
    ["foo", "MZXW6"],
    ["foob", "MZXW6YQ"],
    ["fooba", "MZXW6YTB"],
    ["foobar", "MZXW6YTBOI"],
  ];
  for (const [text, encoded] of vectors) {
    assert.equal(base32(Buffer.from(text, "latin1")), encoded, `base32 of "${text}"`);
  }
}

/** What `mdg login` prints beside the terminal's request: the first six characters of base32(SHA-256(state)). */
export function expectedCheck(state: string): string {
  return base32(createHash("sha256").update(state, "utf8").digest()).slice(0, 6);
}

// ---------------------------------------------------------------------------------------------
// The command line's side of the approval: a listener on the loopback interface

/** A request that reached the listener. */
export interface Arrival {
  readonly path: string;
  readonly query: URLSearchParams;
  readonly headers: IncomingHttpHeaders;
}

export interface Listener {
  readonly port: number;
  /** `http://127.0.0.1:<port>`. */
  readonly origin: string;
  /** Every request, in order. */
  readonly arrivals: Arrival[];
  close(): Promise<void>;
}

/** What the listener shows the person once the browser has been sent to it. */
const LISTENER_PAGE =
  '<!doctype html><meta charset="utf-8"><title>mdg</title><p>The command line has your answer.</p>';

/** A tiny server on 127.0.0.1, on a port the system picks, that records what it is asked. */
export function listen(): Promise<Listener> {
  const arrivals: Arrival[] = [];
  const server: Server = createServer((request, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    arrivals.push({ path: url.pathname, query: url.searchParams, headers: request.headers });
    if (url.pathname === "/favicon.ico") {
      // The browser asks for the page's icon; the command line has none.
      response.writeHead(204).end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(LISTENER_PAGE);
  });
  return new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      done({
        port,
        origin: `http://127.0.0.1:${port}`,
        arrivals,
        close: () =>
          new Promise<void>((closed) => {
            server.close(() => closed());
            server.closeAllConnections();
          }),
      });
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Watching the browser

/** What a browser context did: every request it made and every error the pages logged. */
export interface Watch {
  /** The address of every `http`, `https`, `ws` and `wss` request, in order. */
  readonly requests: string[];
  /** Console errors and uncaught exceptions, whatever page logged them. */
  readonly errors: string[];
  /** The address of every WebSocket a page opened, in order (a context's requests do not list them). */
  readonly sockets: string[];
  /** How many downloads the context's pages started. */
  readonly downloads: { count: number };
}

/**
 * What Chrome on Linux logs, once, when a navigation or a link becomes a download: the page's own
 * load of that resource "fails" because the browser takes it as a file instead. One such message per
 * download is the download, not an error of the page.
 */
export const DOWNLOAD_CONSOLE_ERROR = "Failed to load resource: net::ERR_FAILED";

/** `errors` without one download message per download the context started. */
export function withoutDownloads(errors: readonly string[], downloads: number): string[] {
  let left = downloads;
  return errors.filter((message) => {
    if (left > 0 && message === DOWNLOAD_CONSOLE_ERROR) {
      left--;
      return false;
    }
    return true;
  });
}

export function watch(context: BrowserContext): Watch {
  const requests: string[] = [];
  const errors: string[] = [];
  const sockets: string[] = [];
  const downloads = { count: 0 };
  context.on("request", (request) => {
    const address = request.url();
    // The browser's own pages (data:, blob:, about:) are not the page's requests.
    if (/^(https?|wss?|ftp):/.test(address)) requests.push(address);
  });
  context.on("page", (page) => {
    page.on("pageerror", (error) => errors.push(`uncaught: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("websocket", (socket) => sockets.push(socket.url()));
    page.on("download", () => {
      downloads.count++;
    });
  });
  return { requests, errors, sockets, downloads };
}

/** The addresses among `sockets` that are not on the Worker's own host (`localhost:<port>`). */
export function socketsOutside(sockets: readonly string[], origin: string): string[] {
  const host = new URL(origin).host;
  return sockets.filter((address) => new URL(address).host !== host);
}

/** The addresses among `requests` whose origin is not one of `allowed`. */
export function outside(requests: readonly string[], allowed: readonly string[]): string[] {
  return requests.filter((address) => !allowed.includes(new URL(address).origin));
}

// ---------------------------------------------------------------------------------------------
// The page

/** Waits for the playground to start and draw its first diagram. */
export async function ready(page: Page): Promise<void> {
  await page.waitForFunction(
    () => "meltemiPlayground" in window && document.querySelector("#app .content svg") !== null,
    undefined,
    { timeout: 30_000 },
  );
}

/** Waits for a condition in the page, naming it when it does not come. */
export async function until<A>(
  page: Page,
  label: string,
  test: (arg: A) => boolean,
  arg?: A,
): Promise<void> {
  try {
    await page.waitForFunction(test as (arg: unknown) => boolean, arg, { timeout: 20_000 });
  } catch {
    throw new Error(`Timed out waiting: ${label}`);
  }
}

/** Waits until the analysis has caught up with the text in the code pane. */
export async function analysed(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const playground = (
      window as unknown as { meltemiPlayground: { studio: { analysis?: { text: string } } } }
    ).meltemiPlayground;
    const text = (document.querySelector(".code-input") as HTMLTextAreaElement).value;
    return playground.studio.analysis?.text === text;
  });
}

/** Opens a template from the Templates menu, confirming when asked. */
export async function openTemplate(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Templates" }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${name}`) }).click();
  const confirm = page.locator("dialog[open]").getByRole("button", { name: "Open the template" });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await until(
    page,
    `the ${name} template opened`,
    (template) =>
      document.querySelector(".status-text")?.textContent?.includes(`the ${template} template`) ??
      false,
    name,
  );
  await analysed(page);
}

/** Whether a text is anywhere in the page: in its markup or in the value of a field. */
export const pageHolds = (page: Page, text: string): Promise<boolean> =>
  page.evaluate(
    (needle) =>
      document.documentElement.outerHTML.includes(needle) ||
      [...document.querySelectorAll("input, textarea")].some((field) =>
        (field as HTMLInputElement).value.includes(needle),
      ),
    text,
  );
