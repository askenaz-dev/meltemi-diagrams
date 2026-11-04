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
import type { BrowserContext, Download, Page } from "playwright-core";
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

/** A console error or an uncaught exception a page logged. */
export interface Logged {
  readonly text: string;
  /**
   * The address the console names as the message's source: for a load that failed, the resource's.
   * Empty for an uncaught exception.
   */
  readonly url: string;
}

/** What a browser context did: every request it made and every error the pages logged. */
export interface Watch {
  /** The address of every `http`, `https`, `ws` and `wss` request, in order. */
  readonly requests: string[];
  /** Console errors and uncaught exceptions, whatever page logged them. */
  readonly errors: Logged[];
  /** The address of every WebSocket a page opened, in order (a context's requests do not list them). */
  readonly sockets: string[];
  /** Every download the context's pages started, in order. */
  readonly downloads: Download[];
}

/** A download a page started: the address it came from and the file the browser saved. */
export interface Downloaded {
  readonly url: string;
  /** Null for a download that failed, or that had not ended five seconds after it was asked. */
  readonly file: string | null;
}

/** Each download, once it has ended, with the file the browser saved it in. */
export function downloaded(downloads: readonly Download[]): Promise<Downloaded[]> {
  return Promise.all(
    downloads.map(async (download) => {
      const late = new Promise<null>((done) => setTimeout(() => done(null), 5_000).unref());
      const file = await Promise.race([download.path().catch(() => null), late]);
      return { url: download.url(), file };
    }),
  );
}

/**
 * What Edge on Linux logs for each download: its list of downloads asks the browser for the icon of
 * the saved file (`edge://fileicon/?path=<file>`), which a headless browser on Linux cannot draw,
 * and the page's console reports that load as failed. A message for the icon of a file a download
 * saved is the download, not an error of the page, however often the browser asks for it.
 */
export const DOWNLOAD_CONSOLE_ERROR = "Failed to load resource: net::ERR_FAILED";

/** The file a browser's file icon address (`edge://fileicon/?path=…`) is for; null for any other. */
export function fileIconOf(address: string): string | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  const browser = url.protocol === "edge:" || url.protocol === "chrome:";
  return browser && url.hostname === "fileicon" ? url.searchParams.get("path") : null;
}

/** `errors` without the download messages: those for the icon of a file one of `downloads` saved. */
export function withoutDownloads(
  errors: readonly Logged[],
  downloads: readonly Downloaded[],
): Logged[] {
  const files = new Set(downloads.map((download) => download.file));
  return errors.filter((error) => {
    if (error.text !== DOWNLOAD_CONSOLE_ERROR) return true;
    const file = fileIconOf(error.url);
    return file === null || !files.has(file);
  });
}

/** A logged error as the suite reports it: its text, and the address it names, if any. */
export function describeLogged(error: Logged): string {
  return error.url === "" ? error.text : `${error.text} (${error.url})`;
}

export function watch(context: BrowserContext): Watch {
  const requests: string[] = [];
  const errors: Logged[] = [];
  const sockets: string[] = [];
  const downloads: Download[] = [];
  context.on("request", (request) => {
    const address = request.url();
    // The browser's own pages (data:, blob:, about:) are not the page's requests.
    if (/^(https?|wss?|ftp):/.test(address)) requests.push(address);
  });
  context.on("page", (page) => {
    page.on("pageerror", (error) => errors.push({ text: `uncaught: ${error.message}`, url: "" }));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push({ text: message.text(), url: message.location().url });
      }
    });
    page.on("websocket", (socket) => sockets.push(socket.url()));
    page.on("download", (download) => downloads.push(download));
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

/**
 * Makes the project of this browser a template's, from its card in New project (the switcher's
 * panel): "In this browser" when the person is signed in and may choose, the card's title as the
 * name, and a confirmation when the work differs from every template.
 */
export async function openTemplate(page: Page, name: string): Promise<void> {
  await page.evaluate(() => {
    document.querySelector(".status-text")!.textContent = "";
  });
  const panel = page.locator(".switcher-panel:not(.leaving)");
  if ((await panel.count()) === 0) await page.locator(".switcher-button").click();
  await panel.getByRole("button", { name: "New project…" }).click();
  const dialog = page.locator("dialog.new-project");
  await dialog.locator(`[data-template="${name}"]`).click();
  const title = await dialog.getByLabel("Name", { exact: true }).inputValue();
  const here = dialog.getByRole("radio", { name: /^In this browser/ });
  if ((await here.count()) > 0) await here.check();
  await dialog.getByRole("button", { name: "Create the project" }).click();
  await until(
    page,
    `the ${name} template opened or asked about`,
    () =>
      (document.querySelector(".status-text")?.textContent ?? "").startsWith("Created ") ||
      [...document.querySelectorAll("dialog[open] button")].some(
        (button) => button.textContent === "Open the template",
      ),
  );
  const confirm = page.locator("dialog[open]").getByRole("button", { name: "Open the template" });
  if ((await confirm.count()) > 0) await confirm.click();
  await until(
    page,
    `the ${name} template opened`,
    (wanted) => document.querySelector(".status-text")?.textContent === `Created ${wanted}.`,
    title,
  );
  await analysed(page);
}

// ---------------------------------------------------------------------------------------------
// The explorer

/** Whether the explorer lists a file without Show all files: diagrams and images. */
export const listedByDefault = (path: string): boolean =>
  /\.(meltemi|png|jpe?g|gif|webp|svg)$/i.test(path);

/** Turns Show all files on in the explorer's footer, for the files the tree hides otherwise. */
export async function showAllFiles(page: Page): Promise<void> {
  if (!(await page.locator(".explorer-foot .switch-input").isChecked())) {
    await page.locator(".explorer-foot .switch").click();
  }
  await until(
    page,
    "Show all files on",
    () =>
      (document.querySelector(".explorer-foot .switch-input") as HTMLInputElement | null)
        ?.checked === true,
  );
}

/**
 * Waits until a file is the open one: the Studio has it open and, when the tree lists it, the
 * explorer marks its row.
 */
export async function expectOpen(page: Page, path: string): Promise<void> {
  await until(
    page,
    `${path} open, and marked in the explorer`,
    (wanted) => {
      const studio = (window as unknown as { meltemiPlayground: { studio: { open: string } } })
        .meltemiPlayground.studio;
      if (studio.open !== wanted) return false;
      const all =
        (document.querySelector(".explorer-foot .switch-input") as HTMLInputElement | null)
          ?.checked === true;
      if (!all && !/\.(meltemi|png|jpe?g|gif|webp|svg)$/i.test(wanted)) return true;
      return (
        document
          .querySelector(`.tree li[data-key="f:${wanted}"]`)
          ?.classList.contains("current") === true
      );
    },
    path,
  );
}

/**
 * Shows a file's row in the explorer: Show all files on for a file the tree hides, and the folders
 * that hold it opened, outermost first.
 */
export async function revealFile(page: Page, path: string): Promise<void> {
  if (!listedByDefault(path)) await showAllFiles(page);
  const parts = path.split("/");
  for (let at = 1; at < parts.length; at++) {
    const folder = page.locator(`.tree li[data-key="d:${parts.slice(0, at).join("/")}"]`);
    if ((await folder.getAttribute("aria-expanded")) === "false") {
      await folder.locator(":scope > .tree-row").click();
    }
  }
  await page.locator(`.tree li[data-key="f:${path}"]`).waitFor();
}

/**
 * Opens a file from the explorer as a person does: its row shown, then a click on its name. A
 * diagram's analysis is waited for too.
 */
export async function openFile(page: Page, path: string): Promise<void> {
  await revealFile(page, path);
  await page.locator(`.tree li[data-key="f:${path}"] > .tree-row .tree-name`).click();
  await expectOpen(page, path);
  if (path.endsWith(".meltemi")) await analysed(page);
}

/**
 * Renames a file in its folder from the explorer: F2 on its row puts a box in it (a diagram's name
 * without `.meltemi`), the new name is typed and Enter keeps it.
 */
export async function renameFile(page: Page, path: string, name: string): Promise<void> {
  await revealFile(page, path);
  const row = page.locator(`.tree li[data-key="f:${path}"]`);
  await row.focus();
  await page.keyboard.press("F2");
  const box = row.locator("input.tree-rename");
  await box.waitFor();
  await box.fill(name);
  await box.press("Enter");
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
