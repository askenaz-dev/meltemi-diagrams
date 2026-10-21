/**
 * The playground in a headless Edge or Chrome, served from its built site on the loopback
 * interface: templates, the code pane and its services, the canvas both ways, undo, import,
 * share links, kept work, every export (checked with FFmpeg when it is installed), keyboard
 * access, narrow screens, the interface and exported content in Spanish, the account (sign-in as
 * a link on a static server, an answer the page cannot read, a person signed in with API tokens;
 * the account's requests are answered by the test, at the page's own origin) and no request
 * outside the page's origin. Tests run in an English browser unless they say otherwise.
 * Usage: pnpm playground:test-browser (builds the site first). PLAYGROUND_TEST_FILTER=text runs
 * only the tests whose name holds the text.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Route,
} from "playwright-core";
import { findFfmpeg } from "../../../capture/src/index.js";
import { run as cli } from "../../../cli/src/index.js";
import { ProjectSessions, produceExport } from "../../../editor/src/node.js";
import { browserPath } from "../../../vscode/scripts/browser.mjs";
import { en } from "../../src/messages/en.js";
import { es } from "../../src/messages/es.js";
import { encodeShare, SHARE_LIMITS } from "../../src/share.js";
import { readZip } from "../../src/zip.js";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "..", "dist");
const output = join(here, "..", "..", ".test-output");
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const ffmpeg = findFfmpeg();
const ffprobePath = ffmpeg
  ? join(dirname(ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe")
  : null;
const ffprobe = ffprobePath && existsSync(ffprobePath) ? ffprobePath : null;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".md": "text/markdown; charset=utf-8",
  ".map": "application/json",
};

/** Serves the built site on 127.0.0.1, as any static server would. */
function serve(): Promise<{ server: Server; origin: string }> {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const file = normalize(join(dist, path.endsWith("/") ? `${path}index.html` : path));
    if (!file.startsWith(dist + sep) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    response.end(readFileSync(file));
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as { port: number };
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    }),
  );
}

interface Templates {
  readonly templates: readonly { name: string; files: Record<string, string> }[];
}
const templates = (JSON.parse(readFileSync(join(dist, "templates.json"), "utf8")) as Templates)
  .templates;

interface Context {
  readonly page: Page;
  readonly context: BrowserContext;
  readonly url: string;
}

interface Test {
  readonly name: string;
  readonly viewport?: { width: number; height: number };
  readonly dark?: boolean;
  /** The browser's language: `en-US` unless a test says otherwise, so the page speaks English. */
  readonly locale?: string;
  /** Runs in the page before its scripts, to take away what a browser may lack. */
  readonly init?: () => void;
  /**
   * Runs before the page opens: answers some of its requests differently, or listens from the
   * first moment. `origin` is the page's own.
   */
  readonly setup?: (t: { page: Page; context: BrowserContext; origin: string }) => Promise<void>;
  /**
   * Console errors the test provokes on purpose, such as the browser's own note that a request was
   * refused with a 413. Any other error still fails the test.
   */
  readonly allowedErrors?: readonly RegExp[];
  readonly run: (t: Context) => Promise<void>;
}

/** Waits for the page and its first drawing. */
async function ready(page: Page): Promise<void> {
  await page.waitForFunction(
    () => "meltemiPlayground" in window && document.querySelector("#app .content svg") !== null,
    undefined,
    { timeout: 30_000 },
  );
}

const code = (page: Page) => page.locator(".code-input").inputValue();

/** Waits until the analysis has caught up with the text. */
async function analysed(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const playground = (
      window as unknown as { meltemiPlayground: { studio: { analysis?: { text: string } } } }
    ).meltemiPlayground;
    const text = (document.querySelector(".code-input") as HTMLTextAreaElement).value;
    return playground.studio.analysis?.text === text;
  });
  await page.waitForTimeout(50);
}

/** Waits for a condition, naming it when it does not come. */
async function until<A>(
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

/** Selects the first match of `text` in the code. */
async function selectText(page: Page, text: string): Promise<void> {
  await page.locator(".code-input").evaluate((area: HTMLTextAreaElement, needle) => {
    const at = area.value.indexOf(needle);
    if (at < 0) throw new Error(`"${needle}" is not in the code`);
    area.focus();
    area.setSelectionRange(at, at + needle.length);
  }, text);
}

/** Puts the caret after the first match of `text` in the code. */
async function caretAfter(page: Page, text: string, before = false): Promise<void> {
  await page.locator(".code-input").evaluate(
    (area: HTMLTextAreaElement, [needle, start]) => {
      const at = area.value.indexOf(needle as string);
      if (at < 0) throw new Error(`"${needle}" is not in the code`);
      const offset = start ? at : at + (needle as string).length;
      area.focus();
      area.setSelectionRange(offset, offset);
    },
    [text, before] as const,
  );
}

/** Opens a template from the Templates menu, confirming when asked. */
async function openTemplate(page: Page, name: string): Promise<void> {
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
  // The canvas fits the new drawing.
  await page.waitForTimeout(300);
}

/** Saves the file a click downloads. */
async function download(page: Page, action: () => Promise<unknown>): Promise<string> {
  const [file] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), action()]);
  const path = join(output, file.suggestedFilename());
  await file.saveAs(path);
  return path;
}

/** Exports from the dialog with the given choices. */
async function exportWith(
  page: Page,
  choices: { what?: string; format: string; fields?: Record<string, string> },
): Promise<string> {
  await page.locator(".topbar").getByRole("button", { name: "Export" }).click();
  const dialog = page.locator("dialog[open]");
  if (choices.what) await dialog.getByLabel("What").selectOption(choices.what);
  await dialog.getByLabel("Format").selectOption(choices.format);
  for (const [label, value] of Object.entries(choices.fields ?? {})) {
    await dialog.getByLabel(label, { exact: true }).fill(value);
  }
  return download(page, () => dialog.getByRole("button", { name: "Export", exact: true }).click());
}

function probe(path: string, entries: string): Record<string, string | number> {
  const out = execFileSync(
    ffprobe!,
    [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      entries,
      "-of",
      "json",
      path,
    ],
    { encoding: "utf8" },
  );
  return (JSON.parse(out) as { streams: Record<string, string | number>[] }).streams[0]!;
}

/** The SVG the CLI's export writes for a template's file, with embedded fonts. */
function cliSvg(template: string, file: string): string {
  const folder = join(tmpdir(), `pg-cli-${template}-${process.pid}`);
  rmSync(folder, { recursive: true, force: true });
  for (const [path, text] of Object.entries(templates.find((t) => t.name === template)!.files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  const projects = new ProjectSessions({ toolVersion: "1.0.0" });
  const absolute = join(folder, file).split(sep).join("/");
  const workspace = projects.forFile(absolute);
  const compiled = workspace.file(absolute)!;
  const diagram = compiled.compilation.document.diagrams[0]!;
  const output = produceExport(
    {
      file: compiled,
      workspace,
      projects,
      playerScript: () => "",
      report: () => undefined,
      printed: new Set(),
    },
    {
      target: { kind: "diagram", diagram, owner: compiled },
      format: "svg",
      theme: null,
      fonts: "embedded",
      motion: "static",
      at: null,
      scenario: undefined,
      scale: 2,
      size: null,
      background: null,
      link: null,
      embed: false,
      autoplay: false,
      loop: false,
      fps: null,
      durationMs: null,
      out: null,
    },
  );
  rmSync(folder, { recursive: true, force: true });
  assert.ok("text" in output, "the CLI exports the SVG");
  return output.text;
}

// The account ----------------------------------------------------------------------------------------
// A static server has no API: it answers `api/session` with the file the build wrote, nobody signed
// in. These helpers let a test answer the account's requests itself, still at the page's own origin,
// to see the page with a person signed in or with an answer it cannot read.

/** Everything the page logs from the first moment, whatever the level, and its uncaught errors. */
function recordLogs(page: Page): string[] {
  const logged: string[] = [];
  page.on("console", (message) => logged.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => logged.push(`uncaught: ${error.message}`));
  return logged;
}

/** The link the page builds to sign in when the server gives none: the address it was built with. */
const signInHref = (pageUrl: string): string =>
  `https://id.meltemi.dev/login?return_to=${encodeURIComponent(pageUrl)}`;

/** What the Worker answers a browser that carries a session; the picture is under the page's origin. */
function cookieAnswer(origin: string, user: Record<string, unknown> = {}): unknown {
  return {
    user: { sub: "u-ana", name: "Ana", picture: `${origin}/favicon.svg`, handle: null, ...user },
    // The identity service's account page is another site; a file of this one stands in for it.
    account: `${origin}/NOTICES.md`,
    signOut: "https://id.meltemi.dev/logout",
  };
}

interface HeldToken {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

/** The tokens the service holds for Ana at the start of a test. */
const ANAS_TOKENS = (): HeldToken[] => [
  {
    id: "t1",
    name: "laptop",
    created_at: "2026-10-01T10:00:00.000Z",
    last_used_at: "2026-10-12T08:30:00.000Z",
  },
  { id: "t2", name: "CI", created_at: "2026-10-05T09:00:00.000Z", last_used_at: null },
];

/** What the page sent to the tokens API. */
interface Sent {
  readonly method: string;
  readonly path: string;
  readonly type: string | undefined;
  readonly body: unknown;
}

/** The tokens API in memory, answered from the test, the way the Worker answers it. */
class TokensDouble {
  readonly requests: Sent[] = [];
  /** Whether the account already holds the most tokens: a creation then answers 413. */
  quotaReached = false;
  private made = 0;

  constructor(readonly rows: HeldToken[]) {}

  /** The token a creation shows, once. */
  secret(id: string): string {
    return `mdg_FAKE-SECRET-${id}`;
  }

  /** The requests of a method, in order. */
  sent(method: string): Sent[] {
    return this.requests.filter((request) => request.method === method);
  }

  readonly handle = async (route: Route): Promise<void> => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();
    let body: unknown;
    try {
      body = request.postDataJSON();
    } catch {
      body = undefined;
    }
    this.requests.push({ method, path: pathname, type: request.headers()["content-type"], body });
    const json = (status: number, answer: unknown) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(answer) });
    if (pathname === "/api/tokens" && method === "GET") return json(200, { tokens: this.rows });
    if (pathname === "/api/tokens" && method === "POST") {
      if (this.quotaReached) {
        return json(413, { code: "quota.tokens", message: "You hold the most tokens." });
      }
      const row = {
        id: `t${10 + ++this.made}`,
        name: (body as { name: string }).name,
        created_at: new Date().toISOString(),
        last_used_at: null,
      };
      this.rows.unshift(row);
      return json(201, { id: row.id, name: row.name, token: this.secret(row.id) });
    }
    const target = /^\/api\/tokens\/([^/]+)$/.exec(pathname);
    if (target && method === "DELETE") {
      const index = this.rows.findIndex((row) => row.id === decodeURIComponent(target[1]!));
      if (index < 0) return json(404, { code: "not-found", message: "There is no such token." });
      this.rows.splice(index, 1);
      return route.fulfill({ status: 204 });
    }
    return json(404, { code: "not-found", message: "Not found." });
  };
}

/** What the account has used: 3 projects of 100 and 5.2 MiB of 200 MiB. */
const ANAS_USAGE = {
  projects: 3,
  storageBytes: 5_453_333,
  limits: { projects: 100, storageBytes: 209_715_200, files: 2000 },
};

/** The usage API in memory: how many times the page asked, and what it is answered. */
class UsageDouble {
  requests = 0;

  constructor(
    public answer: { status: number; body: unknown } = { status: 200, body: ANAS_USAGE },
  ) {}

  readonly handle = async (route: Route): Promise<void> => {
    this.requests++;
    await route.fulfill({
      status: this.answer.status,
      contentType: "application/json",
      body: JSON.stringify(this.answer.body),
    });
  };
}

interface SignedIn extends Context {
  readonly origin: string;
  readonly tokens: TokensDouble;
  readonly usage: UsageDouble;
}

/**
 * A test with a person signed in: the session, the tokens API and the usage API are answered by the
 * test.
 */
function signedIn(options: {
  name: string;
  locale?: string;
  viewport?: { width: number; height: number };
  dark?: boolean;
  /** What `api/session` answers; by default Ana, signed in with a cookie. */
  answer?: (origin: string) => unknown;
  held?: HeldToken[];
  /** What `api/account/usage` answers; by default Ana's numbers. */
  usage?: { status: number; body: unknown };
  allowedErrors?: readonly RegExp[];
  run: (t: SignedIn) => Promise<void>;
}): Test {
  const tokens = new TokensDouble(options.held ?? ANAS_TOKENS());
  const usage = new UsageDouble(options.usage);
  return {
    name: options.name,
    locale: options.locale,
    viewport: options.viewport,
    dark: options.dark,
    allowedErrors: options.allowedErrors,
    async setup({ context, origin }) {
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
      await context.route("**/api/session", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify((options.answer ?? cookieAnswer)(origin)),
        }),
      );
      await context.route(/\/api\/tokens(\/[^/?]*)?(\?.*)?$/, tokens.handle);
      await context.route(/\/api\/account\/usage(\?.*)?$/, usage.handle);
    },
    run: (t) => options.run({ ...t, origin: new URL(t.url).origin, tokens, usage }),
  };
}

/** What has the focus: its label (or its text) and whether it is in a dialog. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement;
    return {
      label: element?.getAttribute("aria-label") ?? element?.textContent?.trim() ?? "",
      tag: element?.tagName ?? "",
      inDialog: element?.closest("dialog") != null,
    };
  });

/** Whether a text is anywhere in the page: in its markup or in the value of a field. */
const pageHolds = (page: Page, text: string) =>
  page.evaluate(
    (needle) =>
      document.documentElement.outerHTML.includes(needle) ||
      [...document.querySelectorAll("input, textarea")].some((field) =>
        (field as HTMLInputElement).value.includes(needle),
      ),
    text,
  );

/** Whether the header, the account control included, stays inside the screen at each width. */
async function headerFits(page: Page, widths: readonly number[]): Promise<void> {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    // The page changes its layout when the window is resized.
    await page.waitForTimeout(150);
    const state = await page.evaluate(() => {
      const bar = document.querySelector(".topbar")!;
      const account = bar.querySelector(".account-button, .sign-in")!.getBoundingClientRect();
      return {
        width: window.innerWidth,
        sideways: document.documentElement.scrollWidth > window.innerWidth,
        clipped: bar.scrollWidth > bar.clientWidth,
        inside: account.left >= 0 && account.right <= window.innerWidth,
      };
    });
    assert.deepEqual(
      state,
      { width, sideways: false, clipped: false, inside: true },
      `the header at ${width}px`,
    );
  }
}

const WIDTHS = [320, 360, 375, 480, 600, 767, 768, 900, 1024, 1280, 1440];

/** A test whose server answers `api/session` with something the page cannot use. */
function unreadableSession(label: string, body: string, type: string): Test {
  let logged: string[] = [];
  let asked = 0;
  return {
    name: `not JSON, ${label} from api/session: the header still offers sign-in, nothing is logged, the page works`,
    async setup({ page, context }) {
      logged = recordLogs(page);
      await context.route("**/api/session", (route) => {
        asked++;
        return route.fulfill({ status: 200, contentType: type, body });
      });
    },
    async run({ page, url }) {
      assert.equal(asked, 1, "api/session was asked once");
      const signIn = page.locator(".topbar").getByRole("link", { name: "Sign in" });
      assert.equal(await signIn.count(), 1);
      assert.equal(await signIn.getAttribute("href"), signInHref(url));
      assert.equal(await page.locator(".topbar .account-button").count(), 0);
      // The page works as it always has: a template opens, and the canvas draws it.
      await openTemplate(page, "c4");
      assert.ok((await page.locator('#app .content g[data-role="element"]').count()) >= 3);
      assert.deepEqual(logged, [], "nothing was logged");
    },
  };
}

/**
 * Ana signed in, from the header to a revoked token, in the words of a language: the menu and its
 * keys, the sign-out form, the tokens dialog (a token is shown once and gone when the dialog
 * closes; a revocation asks first) and the quota.
 */
async function accountFlow(t: SignedIn, m: typeof en, shot: string): Promise<void> {
  const { page, context, origin, tokens, usage } = t;
  const a = m.account;
  const k = m.tokens;
  const topbar = page.locator(".topbar");
  /** The words a sentence puts before its parameter. */
  const lead = (sentence: (when: string) => string) => sentence("\u0001").split("\u0001")[0]!;

  // The header: the person, not the sign-in link.
  assert.equal(await topbar.getByRole("link", { name: a.signIn }).count(), 0, "no sign-in link");
  const button = topbar.getByRole("button", { name: a.button("Ana") });
  assert.equal(await button.count(), 1);
  assert.equal(await button.getAttribute("aria-haspopup"), "menu");
  assert.equal(await button.getAttribute("aria-expanded"), "false");
  assert.equal(await button.locator(".account-name").textContent(), "Ana");
  const avatar = button.locator("img.account-avatar");
  assert.equal(await avatar.getAttribute("src"), `${origin}/favicon.svg`);
  assert.equal(await avatar.getAttribute("alt"), "", "the name is beside the picture");
  assert.equal(await avatar.getAttribute("referrerpolicy"), "no-referrer");
  const drawn = await avatar.evaluate((image) =>
    (image as HTMLImageElement).decode().then(
      () => true,
      () => false,
    ),
  );
  assert.equal(drawn, true, "the picture loads");

  // The menu: three entries, the first one focused, the keys of a menu.
  const menu = page.locator("#menu-account");
  assert.equal(await menu.isVisible(), false);
  assert.equal(usage.requests, 0, "nothing asks what the account holds before the menu opens");
  await button.click();
  assert.equal(await menu.isVisible(), true);
  assert.equal(await button.getAttribute("aria-expanded"), "true");
  assert.deepEqual(await menu.getByRole("menuitem").allTextContents(), [
    a.account,
    a.tokens,
    a.signOut,
  ]);
  assert.equal((await focused(page)).label, a.account, "the first entry has the focus");

  // What the account holds: words under the entries, and two thin meters that are for the eye only.
  // It was asked for as the menu opened, and arrives without moving the focus.
  const held = page.locator(".account-usage");
  await held.waitFor();
  assert.equal(usage.requests, 1);
  assert.equal(await held.getAttribute("role"), "group");
  assert.equal(await held.getAttribute("aria-label"), m.cloud.usage.label);
  const mebibytes = shot === "es" ? "5,2 MiB" : "5.2 MiB";
  assert.deepEqual(await held.locator(".usage-text").allTextContents(), [
    m.cloud.projects.count(3, 100),
    m.cloud.usage.storage(mebibytes, "200 MiB"),
  ]);
  assert.deepEqual(
    await held
      .locator("meter")
      .evaluateAll((meters) =>
        meters.map((meter) => [
          (meter as HTMLMeterElement).value,
          (meter as HTMLMeterElement).max,
          meter.getAttribute("aria-hidden"),
        ]),
      ),
    [
      [3, 100, "true"],
      [5_453_333, 209_715_200, "true"],
    ],
  );
  assert.equal(
    await menu.locator(".account-usage").count(),
    0,
    "the menu proper holds entries only",
  );
  assert.equal(await menu.getAttribute("role"), "menu");
  assert.equal((await focused(page)).label, a.account, "the numbers do not take the focus");
  await page.screenshot({ path: join(output, `account-menu-${shot}.png`) });
  const press = async (key: string) => {
    await page.keyboard.press(key);
    return (await focused(page)).label;
  };
  assert.equal(await press("ArrowDown"), a.tokens);
  assert.equal(await press("ArrowDown"), a.signOut);
  assert.equal(await press("ArrowDown"), a.account, "the arrow keys go round");
  assert.equal(await press("ArrowUp"), a.signOut);
  assert.equal(await press("Home"), a.account);
  assert.equal(await press("End"), a.signOut);
  await page.keyboard.press("Escape");
  assert.equal(await menu.isVisible(), false);
  assert.equal((await focused(page)).label, a.button("Ana"), "Escape gives the focus back");
  // From the button, the arrow keys open the menu: Up on its last entry.
  assert.equal(await press("ArrowUp"), a.signOut);
  assert.equal(await menu.isVisible(), true);
  // A click elsewhere closes it.
  await page.locator(".brand").click();
  assert.equal(await menu.isVisible(), false);
  assert.equal(await button.getAttribute("aria-expanded"), "false");

  // "Account" opens the identity service's page in a tab of its own, without handing it this one.
  await button.click();
  const account = menu.getByRole("menuitem", { name: a.account, exact: true });
  assert.equal(await account.getAttribute("href"), `${origin}/NOTICES.md`);
  assert.equal(await account.getAttribute("target"), "_blank");
  const rel = ((await account.getAttribute("rel")) ?? "").split(" ").sort();
  assert.deepEqual(rel, ["noopener", "noreferrer"]);
  const [popup] = await Promise.all([context.waitForEvent("page"), account.click()]);
  await popup.waitForLoadState();
  assert.equal(popup.url(), `${origin}/NOTICES.md`);
  await popup.close();
  assert.equal(await menu.isVisible(), false, "choosing an entry closes the menu");

  // "Sign out" is a form that posts to the identity service with the page as return address. It is
  // watched, not sent: the service is another site.
  await button.click();
  const form = menu.locator("form");
  assert.equal(await form.getAttribute("method"), "post");
  assert.equal(await form.getAttribute("action"), "https://id.meltemi.dev/logout");
  assert.equal(await form.locator('input[type="hidden"][name="return_to"]').count(), 1);
  await page.evaluate(() => {
    // The address has a query and a fragment: only the page and its query come back.
    history.replaceState(null, "", "?x=1#frag");
    localStorage.clear();
    document.addEventListener("submit", (event) => {
      event.preventDefault();
      const sent = event.target as HTMLFormElement;
      (window as unknown as { signedOut: unknown }).signedOut = {
        action: sent.action,
        method: sent.method,
        fields: [...new FormData(sent).entries()],
      };
    });
  });
  await form.getByRole("menuitem", { name: a.signOut }).click();
  const signedOut = await page.evaluate(
    () => (window as unknown as { signedOut: unknown }).signedOut,
  );
  assert.deepEqual(signedOut, {
    action: "https://id.meltemi.dev/logout",
    method: "post",
    fields: [["return_to", `${origin}/index.html?x=1`]],
  });
  const kept = await page.evaluate(
    () => localStorage.getItem("meltemi-playground:project:v1") !== null,
  );
  assert.equal(kept, true, "the work is kept before the page is left");
  await page.keyboard.press("Escape");

  // "API tokens" opens the dialog, with the name field focused and the tokens listed.
  await button.click();
  await menu.getByRole("menuitem", { name: a.tokens, exact: true }).click();
  const dialog = page.locator("dialog[open]");
  assert.equal(await dialog.locator("h2").textContent(), k.title);
  assert.equal(await menu.isVisible(), false);
  assert.equal((await focused(page)).tag, "INPUT", "the name field has the focus");
  const rows = dialog.locator(".token-row");
  await rows.first().waitFor();
  assert.deepEqual(await rows.locator(".token-name").allTextContents(), ["laptop", "CI"]);
  const meta = await rows.locator(".token-meta").allTextContents();
  assert.ok(
    meta[0]!.startsWith(lead(k.createdAt)) && meta[0]!.includes(` · ${lead(k.lastUsedAt)}`),
    meta[0],
  );
  assert.ok(
    meta[1]!.startsWith(lead(k.createdAt)) && meta[1]!.endsWith(` · ${k.neverUsed}`),
    meta[1],
  );
  assert.equal(await dialog.locator(".token-count").textContent(), k.count(2, 20));
  assert.equal(await dialog.getByRole("button", { name: k.revokeToken("laptop") }).count(), 1);

  // A name is needed, and a refused name never reaches the service.
  const nameField = dialog.getByLabel(k.name, { exact: true });
  await dialog.getByRole("button", { name: k.create, exact: true }).click();
  assert.equal(await dialog.locator(".field-problem").textContent(), k.needName);
  assert.equal(tokens.sent("POST").length, 0);
  assert.equal((await focused(page)).tag, "INPUT", "the name field has the focus again");

  // A token is made with its name, shown once, and the list catches up.
  await nameField.fill("ci build");
  await page.keyboard.press("Enter");
  await until(page, "the new token", () => document.querySelector(".token-value") !== null);
  const secret = tokens.secret("t11");
  const field = dialog.locator(".token-value");
  assert.equal(await field.inputValue(), secret);
  assert.equal(await field.getAttribute("readonly"), "");
  assert.equal(await dialog.locator(".token-status").textContent(), k.made("ci build"));
  assert.equal(
    await dialog.locator(".token-reveal p").first().textContent(),
    k.copyNow("ci build"),
  );
  assert.equal(await nameField.inputValue(), "", "the name field is empty again");
  assert.deepEqual(await focused(page), { label: k.copy, tag: "BUTTON", inDialog: true });
  await until(
    page,
    "the list to hold three tokens",
    () => document.querySelectorAll("dialog[open] .token-row").length === 3,
  );
  assert.deepEqual(await rows.locator(".token-name").allTextContents(), [
    "ci build",
    "laptop",
    "CI",
  ]);
  assert.equal(await dialog.locator(".token-count").textContent(), k.count(3, 20));
  assert.deepEqual(tokens.sent("POST"), [
    { method: "POST", path: "/api/tokens", type: "application/json", body: { name: "ci build" } },
  ]);
  await dialog.getByRole("button", { name: k.copy }).click();
  await until(
    page,
    "the token to be copied",
    (text) => document.querySelector(".token-reveal .field-hint")?.textContent === text,
    k.copied,
  );
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), secret);
  await page.screenshot({ path: join(output, `tokens-${shot}.png`) });

  // Closing the dialog drops the token from the page, and the focus returns to the button.
  await dialog.getByRole("button", { name: m.dialog.close, exact: true }).last().click();
  await until(page, "the dialog to close", () => document.querySelector("dialog") === null);
  assert.equal(await pageHolds(page, secret), false, "the token is nowhere once the dialog closes");
  assert.equal(await page.locator(".token-value").count(), 0);
  assert.equal((await focused(page)).label, a.button("Ana"));
  await button.click();
  await menu.getByRole("menuitem", { name: a.tokens, exact: true }).click();
  await rows.first().waitFor();
  assert.equal(await dialog.locator(".token-reveal").isVisible(), false);
  assert.equal(await pageHolds(page, secret), false, "reopened, the dialog does not show it again");
  assert.equal(await rows.count(), 3);

  // A revocation asks first; Cancel revokes nothing.
  const revoke = dialog.getByRole("button", { name: k.revokeToken("ci build") });
  await revoke.click();
  const confirm = page.locator("dialog[open]").last();
  assert.equal(await confirm.locator("h2").textContent(), k.revokeTitle);
  assert.equal(await confirm.locator(".dialog-body p").textContent(), k.revokeMessage("ci build"));
  await confirm.getByRole("button", { name: m.dialog.cancel, exact: true }).click();
  await until(
    page,
    "the question to close",
    () => document.querySelectorAll("dialog[open]").length === 1,
  );
  assert.equal(tokens.sent("DELETE").length, 0, "Cancel revokes nothing");
  assert.equal(await rows.count(), 3);
  await revoke.click();
  await page
    .locator("dialog[open]")
    .last()
    .getByRole("button", { name: k.revokeConfirm, exact: true })
    .click();
  await until(
    page,
    "the token to go",
    () => document.querySelectorAll("dialog[open] .token-row").length === 2,
  );
  assert.deepEqual(
    tokens.sent("DELETE").map((request) => request.path),
    ["/api/tokens/t11"],
  );
  assert.equal(await dialog.locator(".token-status").textContent(), k.revoked("ci build"));
  assert.deepEqual(await rows.locator(".token-name").allTextContents(), ["laptop", "CI"]);
  assert.deepEqual(await focused(page), {
    label: k.revokeToken("laptop"),
    tag: "BUTTON",
    inDialog: true,
  });

  // At the quota the service refuses, and the page says so in its language.
  tokens.quotaReached = true;
  await nameField.fill("one more");
  await page.keyboard.press("Enter");
  await until(
    page,
    "the quota to be explained",
    (text) => document.querySelector("dialog[open] .field-problem")?.textContent === text,
    k.quota(20),
  );
  assert.equal(await dialog.locator(".token-reveal").isVisible(), false);
  await page.keyboard.press("Escape");
  await until(page, "the dialog to close", () => document.querySelector("dialog") === null);
}

const tests: Test[] = [
  {
    name: "opens the flow template with its code, the canvas and no problem",
    async run({ page }) {
      assert.equal(await page.locator("#file-select").inputValue(), "diagrams/overview.meltemi");
      assert.match(await code(page), /diagram overview: flow/);
      assert.equal(await page.locator("#problems-title").textContent(), "No problems");
      assert.ok((await page.locator('#app .content g[data-role="element"]').count()) >= 3);
      assert.ok(
        (await page.locator(".code-highlight .hl-keyword").count()) > 3,
        "keywords are coloured",
      );
      assert.ok(
        (await page.locator(".code-highlight .hl-variable").count()) > 3,
        "ids are coloured",
      );
      for (const button of await page.locator(".topbar button").all()) {
        const name = (await button.getAttribute("aria-label")) ?? (await button.textContent());
        assert.ok(name?.trim(), "every button of the header has a name");
      }
      await page.screenshot({ path: join(output, "flow.png") });
    },
  },
  {
    name: "ships _headers for the Worker's assets, a plain file to a static server",
    async run({ page }) {
      const headers = await page.request.get(new URL("_headers", page.url()).href);
      assert.equal(headers.status(), 200);
      const text = await headers.text();
      assert.match(text, /^\/\*\n {2}Content-Security-Policy: frame-ancestors 'self'\n/);
      assert.match(text, /X-Content-Type-Options: nosniff/);
      assert.ok(existsSync(join(dist, "_headers")));
    },
  },
  {
    name: "draws again after typing, underlines problems and lists them with their lines",
    async run({ page }) {
      await caretAfter(page, 'db[("Database")]');
      await page.keyboard.press("Enter");
      await page.keyboard.type('style missing { fill "#fff" }');
      await analysed(page);
      assert.match((await page.locator("#problems-title").textContent()) ?? "", /1 error/);
      assert.match(
        (await page.locator(".problem-list").first().textContent()) ?? "",
        /ref\.unknown-element · line 12/,
      );
      assert.equal(await page.locator(".code-marks .mark-error").textContent(), "missing");
      assert.equal(await page.locator(".code-line.has-error").count(), 1);
      await page.keyboard.press("Control+a");
      await page.keyboard.press("Backspace");
      await page.keyboard.type('diagram d: flow {\nshop["Shop"]\norders["Orders"]\nshop -> orders');
      // Enter would accept the suggestion for the word just typed, as in VS Code.
      await page.keyboard.press("Escape");
      await page.keyboard.type("\n}");
      await analysed(page);
      await until(
        page,
        "two elements drawn",
        () => document.querySelectorAll('#app .content g[data-role="element"]').length === 2,
      );
      assert.equal(
        await code(page),
        'diagram d: flow {\n  shop["Shop"]\n  orders["Orders"]\n  shop -> orders\n  }',
        "Enter indents after { and keeps the indentation",
      );
    },
  },
  {
    name: "completes, explains on hover, fixes, formats, renames and goes to definitions",
    async run({ page }) {
      await caretAfter(page, 'db[("Database")]');
      await page.keyboard.press("Enter");
      await page.keyboard.type("style db { shape ");
      await analysed(page);
      await page.keyboard.press("Control+Space");
      await page.locator("#code-completion").waitFor();
      const options = await page.locator("#code-completion [role=option]").allTextContents();
      for (const shape of ["cylinder", "hexagon", "cloud", "person"]) {
        assert.ok(
          options.some((o) => o.startsWith(shape)),
          `${shape} among the shapes: ${options.join(", ")}`,
        );
      }
      await page.keyboard.type("cyl");
      await page.keyboard.press("Enter");
      await page.keyboard.type(" }");
      assert.match(await code(page), /style db \{ shape cylinder \}/);
      await analysed(page);

      // Hover a keyword.
      const area = await page.locator(".code-input").boundingBox();
      await page.mouse.move(area!.x + 30, area!.y + 8 + 3 * 20 + 10);
      await page.locator(".code-tooltip").waitFor({ state: "visible" });
      assert.match((await page.locator(".code-tooltip").textContent()) ?? "", /diagram/i);
      await page.mouse.move(area!.x + area!.width - 10, area!.y + area!.height - 10);

      // A quick fix for a misspelt property.
      await selectText(page, 'title "Overview"');
      await page.keyboard.type('titel "Overview"');
      await analysed(page);
      assert.match(
        (await page.locator(".problem-list").first().textContent()) ?? "",
        /prop\.unknown/,
      );
      await caretAfter(page, "titel", true);
      await page.keyboard.press("Control+.");
      await page.locator("#code-completion").waitFor();
      await page.keyboard.press("Enter");
      await analysed(page);
      assert.match(await code(page), /\n {2}title "Overview"/);

      // Formatting.
      await caretAfter(page, "direction LR", true);
      await page.keyboard.type("      ");
      await page.keyboard.press("Shift+Alt+F");
      await analysed(page);
      assert.match(await code(page), /\n {2}direction LR/);

      // Rename across the file.
      await caretAfter(page, 'api["API"]', true);
      await page.keyboard.press("F2");
      await page.locator(".code-rename").waitFor();
      await page.keyboard.press("Control+a");
      await page.keyboard.type("gateway");
      await page.keyboard.press("Enter");
      await analysed(page);
      const text = await code(page);
      assert.equal((text.match(/\bapi\b/g) ?? []).length, 0, text);
      assert.ok((text.match(/\bgateway\b/g) ?? []).length >= 3);

      // Definition: from a relation's end to the element.
      await caretAfter(page, "client -> gateway", false);
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("F12");
      const selected = await page
        .locator(".code-input")
        .evaluate((a: HTMLTextAreaElement) => a.value.slice(a.selectionStart, a.selectionEnd));
      assert.equal(selected, "gateway");
    },
  },
  {
    name: "writes canvas edits into the code, selects from the caret and undoes both as one history",
    async run({ page }) {
      await openTemplate(page, "free");
      const element = page
        .locator('#app .content g[data-id="browser"][data-role="element"]')
        .first();
      const box = (await element.boundingBox())!;
      const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const before = /place browser at \((\d+), (\d+)\)/.exec(await code(page))!;
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 30, start.y + 10, { steps: 4 });
      await page.mouse.move(start.x + 60, start.y + 20, { steps: 4 });
      await page.mouse.up();
      await until(
        page,
        "the drag written into the code",
        (old) =>
          !(document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(old),
        before[0],
      );
      const after = /place browser at \((\d+), (\d+)\)/.exec(await code(page))!;
      assert.ok(Number(after[1]) > Number(before[1]), "moved right in the code");

      await caretAfter(page, "box db", false);
      await page.keyboard.press("ArrowLeft");
      await until(
        page,
        "db highlighted from the caret",
        () => document.querySelectorAll('#app .overlay .highlight[data-target="db"]').length === 1,
      );

      await page.keyboard.press("Control+z");
      await until(
        page,
        "the drag undone",
        (old) => (document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(old),
        before[0],
      );
      await page.keyboard.press("Control+Shift+z");
      await until(
        page,
        "the drag redone",
        (moved) =>
          (document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(moved),
        after[0],
      );
    },
  },
  {
    name: "creates a hexagon from the canvas's grid of shapes with F, typing and Enter",
    async run({ page }) {
      await page.locator("#app .stage").focus();
      await page.keyboard.press("f");
      const grid = page.locator("#app").getByRole("dialog", { name: "Shapes" });
      await grid.waitFor({ state: "visible" });
      assert.equal(await grid.getByRole("radio").count(), 24);
      await page.keyboard.type("hex");
      assert.equal(await grid.getByRole("radio").count(), 1);
      await page.keyboard.press("Enter");
      await until(page, "the hexagon written into the code", () =>
        /\n {2}style node1 \{ shape hexagon \}\n/.test(
          (document.querySelector(".code-input") as HTMLTextAreaElement).value,
        ),
      );
      // The grid fades out as it closes.
      await grid.waitFor({ state: "hidden", timeout: 1000 });
      assert.equal(
        await page.locator('#app .toolbar button[data-tool="node"]').getAttribute("data-shape"),
        "hexagon",
      );
    },
  },
  {
    name: "creates an empty shape from the canvas and adds its text in place with a double click",
    async run({ page }) {
      await page.locator("#app .stage").focus();
      await page.keyboard.press("f");
      await page.keyboard.type("agen");
      await page.keyboard.press("Enter");
      await until(page, "the empty agent written into the code", () =>
        /\n {2}node1\[""\]\n {2}style node1 \{ shape agent \}\n/.test(
          (document.querySelector(".code-input") as HTMLTextAreaElement).value,
        ),
      );
      // An empty shape opens no editor; a double click on it does.
      assert.equal(await page.locator("#app .inline").count(), 0);
      const node = page.locator('#app .content g[data-id="node1"][data-role="element"]').first();
      await node.waitFor();
      const box = (await node.boundingBox())!;
      await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height * 0.7);
      const inline = page.locator("#app textarea.inline");
      assert.equal(await inline.isVisible(), true);
      assert.equal(await inline.getAttribute("autocomplete"), "off");
      assert.equal(await inline.getAttribute("spellcheck"), "false");
      await page.keyboard.type("Planner");
      await page.keyboard.press("Shift+Enter");
      await page.keyboard.type("agent");
      await page.screenshot({ path: join(output, "inline-agent.png") });
      await page.keyboard.press("Enter");
      await until(page, "the two-line label written into the code", () =>
        (document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(
          'node1["Planner\\nagent"]',
        ),
      );
      assert.equal(await page.locator("#app .inline").count(), 0);
    },
  },
  {
    name: "starts a diagram in an emptied file from the canvas's button, and adds another from New diagram",
    async run({ page }) {
      const app = page.locator("#app");
      await page.locator(".code-input").focus();
      await page.keyboard.press("Control+a");
      await page.keyboard.press("Backspace");
      await analysed(page);
      const empty = app.locator(".empty");
      await empty.waitFor({ state: "visible" });
      // Nothing of the template's diagram is left on the canvas.
      const picker = app.locator('.toolbar select[aria-label="Diagram"]');
      assert.equal(await picker.locator("option").count(), 0);
      assert.equal(await app.locator(".inspector h2").count(), 0);
      assert.equal(await app.locator(".minimap").isVisible(), false);
      assert.equal(await app.locator(".toolbar .badge").isVisible(), false);
      await page.screenshot({ path: join(output, "empty-file.png") });
      await empty
        .getByRole("group", { name: "Create a diagram" })
        .getByRole("button", { name: "Flow diagram" })
        .click();
      await until(
        page,
        "the flow diagram written into the code",
        () =>
          (document.querySelector(".code-input") as HTMLTextAreaElement).value ===
          'language "0.2"\n\ndiagram diagram1: flow {\n}\n',
      );
      await until(page, "the new diagram drawn", () => {
        const shown = document.querySelector("#app .empty") as HTMLElement | null;
        return document.querySelector("#app .content svg") !== null && shown?.hidden === true;
      });
      assert.equal(await picker.inputValue(), "diagram1");
      // New diagram › Free composition: appended after it, and shown.
      await app.locator(".toolbar button.new-diagram").click();
      await app.locator('.menu [data-create="free"]').click();
      await until(page, "the free composition written into the code", () =>
        (document.querySelector(".code-input") as HTMLTextAreaElement).value.endsWith(
          "}\n\ndiagram diagram2: free {\n}\n",
        ),
      );
      await until(
        page,
        "the free composition shown",
        () =>
          (
            document.querySelector(
              '#app .toolbar select[aria-label="Diagram"]',
            ) as HTMLSelectElement
          )?.value === "diagram2",
      );
      assert.equal(await app.locator('.toolbar button[data-tool="box"]').isVisible(), true);
    },
  },
  {
    name: "draws the connectors of a dragged box before the release, and Escape gives the drawing back",
    async run({ page }) {
      const app = page.locator("#app");
      const lines = () =>
        page.evaluate(() =>
          [...document.querySelectorAll('#app .content g[data-role="relation"]')].map((g) => {
            const r = g.getBoundingClientRect();
            return Math.round(r.height);
          }),
        );
      const before = await lines();
      const text = await code(page);
      const api = (await app
        .locator('.content g[data-id="api"][data-role="element"]')
        .first()
        .boundingBox())!;
      const start = { x: api.x + api.width / 2, y: api.y + api.height / 2 };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 20, start.y + 80, { steps: 4 });
      await page.mouse.move(start.x + 40, start.y + 160, { steps: 4 });
      await until(
        page,
        "a connector drawn to the dragged box",
        (heights) =>
          [...document.querySelectorAll('#app .content g[data-role="relation"]')].some(
            (g, i) => g.getBoundingClientRect().height > (heights as number[])[i]! + 60,
          ),
        before,
      );
      assert.equal(await code(page), text, "nothing is written before the release");
      await page.keyboard.press("Escape");
      await until(
        page,
        "the drawing given back",
        (heights) =>
          [...document.querySelectorAll('#app .content g[data-role="relation"]')].every(
            (g, i) => Math.abs(g.getBoundingClientRect().height - (heights as number[])[i]!) <= 1,
          ),
        before,
      );
      await page.mouse.up();
      await page.waitForTimeout(200);
      assert.equal(await code(page), text, "nothing is written after Escape");
      assert.deepEqual(await lines(), before);
    },
  },
  {
    name: "opens every template without problems, with its files",
    async run({ page }) {
      for (const template of templates) {
        await openTemplate(page, template.name);
        const files = await page.locator("#file-select option").allTextContents();
        assert.equal(files.length, Object.keys(template.files).length, template.name);
        assert.equal(
          await page.locator("#problems-title").textContent(),
          "No problems",
          template.name,
        );
        await until(
          page,
          `${template.name} drawn`,
          () => document.querySelector("#app .content svg") !== null,
        );
      }
      // The purchase story plays on the canvas.
      await page.locator("#file-select").selectOption("stories/purchase.meltemi");
      await analysed(page);
      const story = page.locator("#app").getByRole("combobox", { name: "Story" });
      await until(page, "the story offered", () => {
        const select = document.querySelector(
          '#app select[aria-label="Story"]',
        ) as HTMLSelectElement | null;
        return select !== null && !select.hidden && select.options.length > 1;
      });
      await story.selectOption({ index: 1 });
      await until(
        page,
        "the story's timeline",
        () => (document.querySelector("#app .timeline") as HTMLElement | null)?.hidden === false,
      );
      await page.screenshot({ path: join(output, "purchase-story.png") });
      assert.equal(await page.locator(".others li").count(), 0, "no other file has problems");
    },
  },
  {
    name: "adds, renames and deletes files, and opens a project archive",
    async run({ page }) {
      await page.getByRole("button", { name: "New file" }).click();
      const dialog = page.locator("dialog[open]");
      await dialog.locator("input").fill("diagrams/second.meltemi");
      await dialog.getByRole("button", { name: "OK" }).click();
      await analysed(page);
      assert.equal(await page.locator("#file-select").inputValue(), "diagrams/second.meltemi");
      assert.match(await code(page), /diagram second: flow/);
      await page.getByRole("button", { name: "Rename the file" }).click();
      await page.locator("dialog[open] input").fill("diagrams/third.meltemi");
      await page.locator("dialog[open]").getByRole("button", { name: "OK" }).click();
      await until(
        page,
        "the file renamed",
        () =>
          (document.querySelector("#file-select") as HTMLSelectElement).value ===
          "diagrams/third.meltemi",
      );
      await page.getByRole("button", { name: "Delete the file" }).click();
      await page.locator("dialog[open]").getByRole("button", { name: "Delete" }).click();
      await until(
        page,
        "the file deleted",
        () =>
          (document.querySelector("#file-select") as HTMLSelectElement).value ===
          "diagrams/overview.meltemi",
      );

      // A project archive: downloaded, then opened again.
      const zip = await download(page, async () => {
        await page.getByRole("button", { name: "Download" }).click();
        await page.getByRole("menuitem", { name: /Project/ }).click();
      });
      await caretAfter(page, "direction LR");
      await page.keyboard.type(" // changed");
      await analysed(page);
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Open", exact: true }).click();
      await (await chooser).setFiles(zip);
      await page.locator("dialog[open]").getByRole("button", { name: "Open the archive" }).click();
      await page.waitForFunction(
        () =>
          !(document.querySelector(".code-input") as HTMLTextAreaElement).value.includes("changed"),
      );
    },
  },
  {
    name: "imports Mermaid into a new file with the importer's status",
    async run({ page }) {
      await page.getByRole("button", { name: "Import" }).click();
      const dialog = page.locator("dialog[open]");
      await dialog
        .getByLabel("Source")
        .fill("flowchart LR\n  a[Shop] --> b[(Orders)]\n  b --> c{Paid?}\n");
      await dialog.getByLabel("Name of the new file").fill("shop");
      await dialog.getByRole("button", { name: "Import", exact: true }).click();
      await analysed(page);
      assert.equal(await page.locator("#file-select").inputValue(), "diagrams/shop.meltemi");
      assert.match(await code(page), /diagram shop: flow/);
      assert.match(
        (await page.locator(".status-text").textContent()) ?? "",
        /Imported mermaid into diagrams\/shop\.meltemi: complete/,
      );
      assert.equal(await page.locator("#problems-title").textContent(), "No problems");
    },
  },
  {
    name: "shares the project in a link that opens it elsewhere, and keeps the work it replaces",
    async run({ page, context, url }) {
      await caretAfter(page, "direction LR");
      await page.keyboard.type(" // shared");
      await analysed(page);
      await page.getByRole("button", { name: "Share" }).click();
      const link = await page.locator("dialog[open] .share-link").inputValue();
      assert.ok(link.startsWith(`${url}#p=`), link);
      await page.locator("dialog[open]").getByRole("button", { name: "Close" }).first().click();
      const other = await context.newPage();
      await other.goto(link);
      await ready(other);
      assert.match(await code(other), /direction LR \/\/ shared/);
      assert.equal(
        new URL(other.url()).hash,
        "",
        "the link's project is opened, then the address is clean",
      );
      await other.close();

      // A link that would decompress beyond 4 MiB leaves the work as it is.
      const big = await encodeShare({
        open: "",
        files: { "a.meltemi": "x".repeat(SHARE_LIMITS.decompressed + 1) },
      });
      await page.goto(`${url}#p=${big}`);
      await ready(page);
      assert.match((await page.locator(".status-text").textContent()) ?? "", /larger than 4 MiB/);
      assert.match(await code(page), /\/\/ shared/);
    },
  },
  {
    name: "keeps the work in the browser between visits and restores a replaced project",
    async run({ page }) {
      await caretAfter(page, "direction LR");
      await page.keyboard.type(" // kept");
      await analysed(page);
      await page.waitForTimeout(700);
      await page.reload();
      await ready(page);
      assert.match(await code(page), /\/\/ kept/);
      await openTemplate(page, "c4");
      assert.doesNotMatch(await code(page), /\/\/ kept/);
      await page.getByRole("button", { name: "Templates" }).click();
      await page.getByRole("menuitem", { name: /Restore the previous project/ }).click();
      await page.waitForFunction(() =>
        (document.querySelector(".code-input") as HTMLTextAreaElement).value.includes("// kept"),
      );
    },
  },
  {
    name: "exports SVG as the CLI does, PNG at its scale, the HTML player and a PDF page",
    async run({ page }) {
      const svg = await exportWith(page, { format: "svg" });
      assert.equal(readFileSync(svg, "utf8"), cliSvg("flow", "diagrams/overview.meltemi"));

      const png = readFileSync(await exportWith(page, { format: "png", fields: { Scale: "2" } }));
      assert.equal(png.toString("latin1", 1, 4), "PNG");
      const svgText = readFileSync(svg, "utf8");
      const width = Number(/width="([\d.]+)"/.exec(svgText)![1]);
      const height = Number(/height="([\d.]+)"/.exec(svgText)![1]);
      assert.equal(png.readUInt32BE(16), Math.round(width * 2));
      assert.equal(png.readUInt32BE(20), Math.round(height * 2));

      const html = readFileSync(await exportWith(page, { format: "html" }), "utf8");
      assert.match(html, /MeltemiPlayer/);
      assert.match(html, /Content-Security-Policy/);

      await page.evaluate(() => {
        (window as unknown as { printed: number }).printed = 0;
      });
      await page.locator(".topbar").getByRole("button", { name: "Export" }).click();
      const dialog = page.locator("dialog[open]");
      await dialog.getByLabel("Format").selectOption("pdf");
      await dialog.getByLabel("Size", { exact: true }).fill("480x300");
      await dialog.getByRole("button", { name: "Export", exact: true }).click();
      await page.waitForFunction(() => document.querySelector(".print-frame") !== null);
      const frame = await page.locator(".print-frame").getAttribute("srcdoc");
      assert.match(frame ?? "", /@page \{ size: 480px 300px; margin: 0; \}/);
      assert.match(frame ?? "", /<svg/);
      await page.waitForFunction(() =>
        /Save as PDF/.test(document.querySelector(".status-text")?.textContent ?? ""),
      );
    },
  },
  {
    name: "records GIF, WebM and MP4 from a story, frame by frame",
    async run({ page }) {
      await openTemplate(page, "purchase");
      await page.locator("#file-select").selectOption("stories/purchase.meltemi");
      await analysed(page);
      const gif = await exportWith(page, { format: "gif", fields: { Duration: "2s" } });
      assert.equal(readFileSync(gif).toString("latin1", 0, 6), "GIF89a");
      if (ffprobe) {
        const stream = probe(gif, "stream=codec_name,width,height");
        assert.deepEqual([stream.codec_name, stream.width, stream.height], ["gif", 960, 540]);
      }
      for (const format of ["webm", "mp4"] as const) {
        const path = await exportWith(page, { format, fields: { Duration: "2s" } });
        if (!ffprobe) continue;
        const stream = probe(path, "stream=codec_name,width,height,nb_read_frames");
        assert.ok(
          format === "mp4"
            ? stream.codec_name === "h264"
            : /^vp[89]$/.test(String(stream.codec_name)),
          `${format}: ${stream.codec_name}`,
        );
        assert.equal(stream.width, 1920);
        assert.equal(stream.height, 1080);
        assert.equal(Number(stream.nb_read_frames), 60, `${format} frames`);
      }
    },
  },
  {
    name: "runs the file's export profiles and downloads the model JSON and the catalog",
    async run({ page }) {
      await openTemplate(page, "purchase");
      await page.locator("#file-select").selectOption("diagrams/executive.meltemi");
      await analysed(page);
      await page.locator(".topbar").getByRole("button", { name: "Export" }).click();
      const profiles = page.locator("dialog[open] .profiles li");
      assert.ok((await profiles.count()) >= 1, "the file has profiles");
      const name = (await profiles.first().locator("code").textContent())!;
      const file = await download(page, () =>
        profiles
          .first()
          .getByRole("button", { name: /^Export the profile/ })
          .click(),
      );
      assert.ok(file.includes(name), `${file} is named after ${name}`);
      await page.keyboard.press("Escape");

      const model = JSON.parse(
        readFileSync(
          await download(page, async () => {
            await page.getByRole("button", { name: "Download" }).click();
            await page.getByRole("menuitem", { name: /Model JSON/ }).click();
          }),
          "utf8",
        ),
      );
      assert.equal(model.format, "model-json");

      const catalog = readFileSync(
        await download(page, async () => {
          await page.getByRole("button", { name: "Download" }).click();
          await page.getByRole("menuitem", { name: /Catalog/ }).click();
        }),
        "utf8",
      );
      const data = JSON.parse(
        /<script type="application\/json" id="meltemi-catalog">([\s\S]*?)<\/script>/
          .exec(catalog)![1]!
          .replace(/\\u003c/g, "<"),
      );
      assert.equal(data.entries.filter((e: { kind: string }) => e.kind === "diagram").length, 4);
      assert.equal(data.entries.filter((e: { kind: string }) => e.kind === "story").length, 1);
      assert.doesNotMatch(catalog, /<(script|link)[^>]+(src|href)="https?:/);
    },
  },
  {
    name: "downloads a project that the command line validates",
    async run({ page }) {
      await openTemplate(page, "c4");
      const zip = await download(page, async () => {
        await page.getByRole("button", { name: "Download" }).click();
        await page.getByRole("menuitem", { name: /Project/ }).click();
      });
      const folder = join(output, "c4-project");
      rmSync(folder, { recursive: true, force: true });
      for (const entry of await readZip(new Uint8Array(readFileSync(zip)))) {
        mkdirSync(dirname(join(folder, entry.path)), { recursive: true });
        writeFileSync(join(folder, entry.path), entry.data);
      }
      let stdout = "";
      const status = cli(["validate", folder], {
        stdout: (t) => (stdout += t),
        stderr: (t) => (stdout += t),
        cwd: output,
      });
      assert.equal(status, 0, stdout);
      assert.match(stdout, /0 errors, 0 warnings/);
    },
  },
  {
    name: "puts the Tabler server icon alone on a free slide from the canvas's icon picker",
    async run({ page }) {
      await openTemplate(page, "free");
      await page.locator("#app .stage").focus();
      await page.keyboard.press("i");
      const picker = page.locator("#app").getByRole("dialog", { name: "Icons" });
      await picker.waitFor();
      // The canvas's own picker: the host opens no dialog of its own.
      assert.equal(await page.locator("dialog[open]").count(), 0);
      await picker.getByRole("radio", { name: "Only the icon" }).click();
      const search = picker.getByRole("combobox", { name: "Search icons" });
      await search.fill("server");
      // The packs load as they are first searched: the result comes once Tabler is there.
      await picker.locator('[role="option"][data-reference="tabler:server"]').waitFor();
      await page.screenshot({ path: join(output, "canvas-icon-picker.png") });
      await search.press("Enter");
      await until(page, "the icon written into the code", () =>
        /\n {2}icon icon1 "tabler:server"\n/.test(
          (document.querySelector(".code-input") as HTMLTextAreaElement).value,
        ),
      );
      assert.match(await code(page), /place icon1 at \(/);
    },
  },
  {
    name: "places AWS Lambda as an icon shape from the canvas, and drops the database icon onto a box",
    dark: true,
    async run({ page }) {
      await openTemplate(page, "flow");
      const app = page.locator("#app");
      await app.locator(".stage").focus();
      await page.keyboard.press("i");
      const picker = app.getByRole("dialog", { name: "Icons" });
      await picker.waitFor();
      assert.equal(
        await picker.getByRole("radio", { name: "Icon", exact: true }).getAttribute("aria-checked"),
        "true",
      );
      await page.keyboard.type("lambda");
      const lambda = picker.locator('[role="option"][data-reference="aws:lambda"]');
      await lambda.waitFor();
      await page.screenshot({ path: join(output, "canvas-icon-picker-dark.png") });
      await lambda.click();
      // The ghost shows the icon; a click on the empty canvas places it.
      const stage = (await app.locator(".stage").boundingBox())!;
      const at = { x: stage.x + 80, y: stage.y + stage.height - 120 };
      await page.mouse.move(at.x, at.y);
      await page.mouse.move(at.x + 2, at.y + 2);
      await app.locator('.overlay .ghost-icon[data-placement="icon"]').waitFor();
      await page.mouse.click(at.x, at.y);
      await until(page, "the icon shape written into the code", () =>
        /\n {2}node1\[""\]\n {2}style node1 \{ icon "aws:lambda"; shape icon \}\n/.test(
          (document.querySelector(".code-input") as HTMLTextAreaElement).value,
        ),
      );
      // A result dragged onto a box gives it the icon, and nothing else.
      await app.locator(".stage").focus();
      await page.keyboard.press("Escape");
      await page.keyboard.press("i");
      await picker.waitFor();
      await page.keyboard.type("database");
      const database = picker.locator('[role="option"][data-reference="tabler:database"]');
      await database.waitFor();
      const from = (await database.boundingBox())!;
      const db = (await app
        .locator('.content g[data-id="db"][data-role="element"]')
        .boundingBox())!;
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2, { steps: 8 });
      await app.locator('.overlay .highlight.drop[data-target="db"]').waitFor();
      await page.screenshot({ path: join(output, "canvas-icon-drop-dark.png") });
      await page.mouse.up();
      await until(page, "the database's icon written into the code", () =>
        /style db \{ icon "tabler:database" \}/.test(
          (document.querySelector(".code-input") as HTMLTextAreaElement).value,
        ),
      );
      assert.doesNotMatch(await code(page), /node2/);
    },
  },
  {
    name: "creates the project's theme from the canvas, edits its file and styles from the strip",
    async run({ page }) {
      await openTemplate(page, "flow");
      const app = page.locator("#app");
      const fileText = (path: string) =>
        page.evaluate(
          (p) =>
            (
              window as unknown as {
                meltemiPlayground: { studio: { text(path: string): string } };
              }
            ).meltemiPlayground.studio.text(p),
          path,
        );
      await app.getByRole("button", { name: "New theme from this one…" }).click();
      const dialog = app.getByRole("dialog", { name: "New theme from this one" });
      await dialog.getByRole("textbox", { name: "Id" }).fill("brand");
      assert.equal(await dialog.getByLabel(/The project/).isChecked(), true);
      await dialog.getByRole("button", { name: "Create" }).click();
      await until(page, "the theme's file in the project", () =>
        [...(document.querySelector("#file-select") as HTMLSelectElement).options].some(
          (o) => o.value === "themes/brand.meltemi",
        ),
      );
      assert.equal(
        await fileText("themes/brand.meltemi"),
        ['language "0.2"', "", "theme brand {", '  extends "technical.light"', "}", ""].join("\n"),
      );
      assert.equal(JSON.parse(await fileText("project.json")).theme, "themes/brand.meltemi#brand");
      assert.match(
        (await page.locator(".status-text").textContent()) ?? "",
        /themes\/brand\.meltemi/,
      );
      // The panel of the new theme opens; a token is written in the theme's own file.
      const panel = app.getByRole("complementary", { name: "Theme" });
      await panel.waitFor();
      assert.match((await panel.textContent()) ?? "", /Written in brand\.meltemi/);
      const accent = panel.locator("#mdg-field-theme-accent");
      await accent.fill("#6A4FD0");
      await accent.press("Enter");
      await until(page, "the accent in the theme's file", () =>
        (
          window as unknown as { meltemiPlayground: { studio: { text(path: string): string } } }
        ).meltemiPlayground.studio
          .text("themes/brand.meltemi")
          .includes('accent "#6A4FD0"'),
      );
      assert.doesNotMatch(await code(page), /accent/);
      await panel.getByRole("button", { name: "Done" }).click();
      // The strip styles a box with the theme's own accent.
      const api = (await app
        .locator('.content g[data-id="api"][data-role="element"]')
        .first()
        .boundingBox())!;
      await page.mouse.click(api.x + api.width / 2, api.y + api.height / 2);
      const fill = app.getByRole("radiogroup", { name: "Fill" });
      const swatch = fill.getByRole("radio", { name: /^accent / });
      assert.equal(await swatch.getAttribute("aria-label"), "accent #6A4FD0");
      await swatch.click();
      await until(page, "the fill in the code", () =>
        (document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(
          "style api { fill accent }",
        ),
      );
      await page.screenshot({ path: join(output, "theme-panel.png") });
    },
  },
  {
    name: "works by keyboard and shows the code and the canvas as tabs on a narrow screen",
    viewport: { width: 375, height: 760 },
    async run({ page }) {
      assert.equal(await page.locator(".view-tabs").isVisible(), true);
      assert.equal(await page.locator(".canvas-pane").isVisible(), false);
      const wide = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      assert.equal(wide, false, "no sideways scrolling");
      await page.locator("#tab-code").focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await page.locator(".canvas-pane").isVisible(), true);
      assert.equal(await page.locator("#tab-canvas").getAttribute("aria-selected"), "true");
      // Tab leaves the code after Escape.
      await page.locator("#tab-canvas").press("ArrowLeft");
      await page.locator(".code-input").focus();
      await page.keyboard.press("Escape");
      await page.keyboard.press("Tab");
      assert.notEqual(await page.evaluate(() => document.activeElement?.className), "code-input");
      await page.screenshot({ path: join(output, "narrow.png") });
    },
  },
  {
    name: "keeps working when the browser keeps nothing, and says so",
    init: () => {
      Storage.prototype.setItem = () => {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      };
    },
    async run({ page }) {
      await caretAfter(page, "direction LR");
      await page.keyboard.type(" // not kept");
      await analysed(page);
      await until(page, "the warning", () =>
        /no room to keep this project/.test(
          document.querySelector(".status-text")?.textContent ?? "",
        ),
      );
      assert.match(await code(page), /not kept/);
    },
  },
  {
    name: "disables a video format the browser cannot encode, and cancels a recording",
    init: () => {
      delete (window as { VideoEncoder?: unknown }).VideoEncoder;
    },
    async run({ page }) {
      await page.locator(".topbar").getByRole("button", { name: "Export" }).click();
      const dialog = page.locator("dialog[open]");
      await dialog.getByLabel("Format").selectOption("webm");
      await until(page, "the reason", () =>
        /no video encoder.*meltemi-diagrams export --format webm/.test(
          document.querySelector("dialog[open]")?.textContent ?? "",
        ),
      );
      assert.equal(
        await dialog.getByRole("button", { name: "Export", exact: true }).isDisabled(),
        true,
      );
      // GIF needs no encoder of the browser; a long one is cancelled while it records.
      await dialog.getByLabel("Format").selectOption("gif");
      await until(page, "Export enabled", () => {
        const button = document.querySelector(
          "dialog[open] .dialog-actions .primary",
        ) as HTMLButtonElement | null;
        return button !== null && !button.disabled;
      });
      await dialog.getByLabel("Duration", { exact: true }).fill("60s");
      await dialog.getByRole("button", { name: "Export", exact: true }).click();
      await until(page, "frames recorded", () =>
        /Frame \d+ of 900/.test(
          document.querySelector("dialog[open] .progress-row")?.textContent ?? "",
        ),
      );
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await until(page, "cancelled", () =>
        /cancelled/.test(document.querySelector(".status-text")?.textContent ?? ""),
      );
    },
  },
  {
    name: "switches to dark and remembers it, and lists the notices",
    async run({ page }) {
      await page.getByRole("button", { name: "Switch light and dark" }).click();
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
      await page.reload();
      await ready(page);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
      await page.screenshot({ path: join(output, "dark.png") });
      await page.getByRole("button", { name: "About the playground" }).click();
      const dialog = page.locator("dialog[open]");
      await dialog.locator(".notices li strong").first().waitFor();
      const notices = await dialog.locator(".notices").textContent();
      assert.match(notices ?? "", /elkjs 0\.12\.0 · EPL-2\.0/);
      const text = await page.evaluate(() => fetch("NOTICES.md").then((r) => r.text()));
      assert.match(text, /## elkjs[\s\S]*Eclipse Public License/);
      assert.match(text, /## inter-ui[\s\S]*SIL Open Font License|## @fontsource\/inter[\s\S]*OFL/);
    },
  },
  {
    name: "switches the interface to Spanish from the header, keeping the project and the open file",
    async run({ page }) {
      // A file of the person's own is open when the language changes.
      await page.getByRole("button", { name: "New file" }).click();
      const created = page.locator("dialog[open]");
      await created.locator("input").fill("diagrams/second.meltemi");
      await created.getByRole("button", { name: "OK" }).click();
      await analysed(page);
      assert.match(await code(page), /start\["Start"\]/);
      await caretAfter(page, 'title "second"');
      await page.keyboard.type(" // kept");
      await analysed(page);
      // An image too large for the browser to keep is named before the page reloads.
      await page.evaluate(() =>
        (
          window as unknown as {
            meltemiPlayground: {
              studio: { addFiles(files: [string, Uint8Array][]): void };
            };
          }
        ).meltemiPlayground.studio.addFiles([["diagrams/large.png", new Uint8Array(600 * 1024)]]),
      );

      const topbar = page.locator(".topbar");
      const spanish = async () => {
        await topbar.getByRole("button", { name: "Language: English" }).click();
        assert.equal(
          await page
            .getByRole("menuitemradio", { name: /^Automatic/ })
            .getAttribute("aria-checked"),
          "true",
        );
        await page.getByRole("menuitemradio", { name: "Español" }).click();
        const confirm = page.locator("dialog[open]");
        assert.match((await confirm.textContent()) ?? "", /diagrams\/large\.png must be added/);
        return confirm;
      };
      await (await spanish()).getByRole("button", { name: "Cancel" }).click();
      assert.equal(await page.evaluate(() => document.documentElement.lang), "en");
      const confirm = await spanish();
      await Promise.all([
        page.waitForEvent("load"),
        confirm.getByRole("button", { name: "Change the language" }).click(),
      ]);
      await ready(page);

      assert.equal(await page.evaluate(() => document.documentElement.lang), "es");
      assert.equal(await page.title(), "Playground de Meltemi Diagrams");
      assert.equal(await page.locator("#file-select").inputValue(), "diagrams/second.meltemi");
      assert.match(await code(page), /title "second" \/\/ kept/);
      assert.equal(
        await page.locator(".status-text").textContent(),
        "No se guardaron las imágenes grandes: diagrams/large.png.",
      );
      for (const name of [
        "Plantillas",
        "Abrir",
        "Importar",
        "Compartir",
        "Exportar",
        "Descargar",
      ]) {
        assert.equal(await topbar.getByRole("button", { name, exact: true }).count(), 1, name);
      }
      assert.equal(await page.locator("#problems-title").textContent(), "Sin problemas");
      assert.match(
        (await page.locator(".privacy").textContent()) ?? "",
        /^Se ejecuta en tu navegador/,
      );
      await topbar.getByRole("button", { name: "Plantillas" }).click();
      await page
        .getByRole("menuitem", { name: /^flow ?Un diagrama de flujo para empezar$/ })
        .waitFor();
      await page.keyboard.press("Escape");

      // A new file's labels are what the person would type, in Spanish; its code stays as written.
      await page.getByRole("button", { name: "Nuevo archivo", exact: true }).click();
      const dialog = page.locator("dialog[open]");
      assert.equal(await dialog.locator("h2").textContent(), "Nuevo archivo");
      await dialog.getByLabel("Ruta del nuevo archivo").fill("diagrams/tercero.meltemi");
      await dialog.getByRole("button", { name: "Aceptar" }).click();
      await analysed(page);
      assert.match(
        await code(page),
        /^diagram tercero: flow \{[\s\S]*start\["Inicio"\][\s\S]*done\["Fin"\]/,
      );
      // The canvas and the editor run in the page and speak its language: a note from the
      // palette is written as the person would have typed it; a node is placed empty.
      await page.locator('.toolbar button[data-tool="note"]').click();
      const stage = (await page.locator(".stage").boundingBox())!;
      await page.mouse.click(stage.x + stage.width / 2, stage.y + 60);
      await until(page, "the new note, in Spanish, in the code", () =>
        (document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(
          'note note1 "Nota"',
        ),
      );
      assert.equal(
        await page.locator("#app textarea.inline").getAttribute("aria-label"),
        "Etiqueta de note1",
      );
      await page.keyboard.press("Escape");
      await page.locator('.toolbar button[data-tool="node"]').click();
      await page.mouse.click(stage.x + stage.width / 2, stage.y + 160);
      await until(page, "the new empty node in the code", () =>
        (document.querySelector(".code-input") as HTMLTextAreaElement).value.includes('node1[""]'),
      );
      assert.equal(await page.locator("#app .inline").count(), 0);

      // The switch shows the language chosen.
      await topbar.getByRole("button", { name: "Idioma: Español" }).click();
      assert.equal(
        await page.getByRole("menuitemradio", { name: "Español" }).getAttribute("aria-checked"),
        "true",
      );
      await page.keyboard.press("Escape");
      await page.screenshot({ path: join(output, "spanish.png") });
    },
  },
  {
    name: "follows a Spanish browser and exports in the dialog's language, preset from the project",
    locale: "es-CL",
    async run({ page }) {
      assert.equal(await page.evaluate(() => document.documentElement.lang), "es");
      const topbar = page.locator(".topbar");
      await topbar.getByRole("button", { name: "Idioma: Español" }).click();
      assert.equal(
        await page.getByRole("menuitemradio", { name: /^Automático/ }).getAttribute("aria-checked"),
        "true",
      );
      await page.keyboard.press("Escape");
      await topbar.getByRole("button", { name: "Plantillas" }).click();
      await page.getByRole("menuitem", { name: /^c4/ }).click();
      await until(
        page,
        "the c4 template opened",
        () => document.querySelector(".status-text")?.textContent === "Se abrió la plantilla c4.",
      );
      await analysed(page);

      /** Exports the container view from the dialog; the text of the file it downloads. */
      const exported = async (format: string, language?: string): Promise<string> => {
        await topbar.getByRole("button", { name: "Exportar", exact: true }).click();
        const dialog = page.locator("dialog[open]");
        await dialog.getByLabel("Qué").selectOption("diagram:containers");
        await dialog.getByLabel("Formato").selectOption(format);
        if (language) await dialog.getByLabel("Idioma", { exact: true }).selectOption(language);
        const path = await download(page, () =>
          dialog.getByRole("button", { name: "Exportar", exact: true }).click(),
        );
        // Success is a flag of the export, not its English words: the dialog closes.
        await until(
          page,
          "the dialog closed",
          () => document.querySelector("dialog[open]") === null,
        );
        assert.match((await page.locator(".status-text").textContent()) ?? "", /^Se descargó /);
        return readFileSync(path, "utf8");
      };

      // The project has no `locale`: the dialog starts in English, and Spanish is a choice.
      await topbar.getByRole("button", { name: "Exportar", exact: true }).click();
      let dialog = page.locator("dialog[open]");
      assert.equal(await dialog.locator("h2").textContent(), "Exportar");
      assert.equal(await dialog.getByLabel("Idioma", { exact: true }).inputValue(), "en");
      await page.keyboard.press("Escape");
      assert.match(await exported("svg"), /\[Container:/);
      const svg = await exported("svg", "es");
      assert.match(svg, /\[Contenedor:/);
      assert.doesNotMatch(svg, /\[Container:/);
      assert.match(await exported("html", "es"), /<html lang="es"/);

      // A problem keeps the dialog open and says why, in Spanish.
      await topbar.getByRole("button", { name: "Exportar", exact: true }).click();
      dialog = page.locator("dialog[open]");
      await dialog.getByLabel("Formato").selectOption("png");
      await dialog.getByLabel("Escala", { exact: true }).fill("9");
      await dialog.getByRole("button", { name: "Exportar", exact: true }).click();
      await until(
        page,
        "the problem, in Spanish",
        () =>
          document.querySelector("dialog[open] .field-problem")?.textContent ===
          "La escala admite de 1 a 8.",
      );
      // The project's catalog, in the dialog's language.
      await dialog.getByLabel("Idioma", { exact: true }).selectOption("es");
      const catalog = readFileSync(
        await download(page, () =>
          dialog.getByRole("button", { name: "Exportar el catálogo del proyecto" }).click(),
        ),
        "utf8",
      );
      assert.match(catalog, /<html lang="es"/);
      await page.keyboard.press("Escape");

      // `locale` in project.json presets the dialog's language.
      await page.locator("#file-select").selectOption("project.json");
      await analysed(page);
      await caretAfter(page, '"name": "c4",');
      await page.keyboard.type('\n"locale": "es",');
      await analysed(page);
      assert.equal(JSON.parse(await code(page)).locale, "es");
      await page.locator("#file-select").selectOption("diagrams/views.meltemi");
      await analysed(page);
      await topbar.getByRole("button", { name: "Exportar", exact: true }).click();
      assert.equal(
        await page.locator("dialog[open]").getByLabel("Idioma", { exact: true }).inputValue(),
        "es",
      );
      await page.keyboard.press("Escape");
      assert.match(await exported("svg"), /\[Contenedor:/);
    },
  },
  // The account ----------------------------------------------------------------------------------
  {
    name: "served by a static server, sign-in is a link, api/session is asked once and the build's file answers",
    async run({ page, url }) {
      const header = page.locator(".topbar");
      const signIn = header.getByRole("link", { name: "Sign in" });
      assert.equal(await signIn.count(), 1);
      assert.equal(await signIn.evaluate((element) => element.tagName), "A");
      // The link goes to the identity service the page was built with, and back to this page.
      const href = (await signIn.getAttribute("href"))!;
      assert.ok(href.startsWith("https://id.meltemi.dev/login?return_to="), href);
      assert.equal(href, signInHref(page.url()));
      assert.equal(page.url(), url);
      assert.equal(await signIn.getAttribute("title"), "Sign in with your Meltemi account");
      // Signing in is a navigation: no form and no account menu in the header.
      assert.equal(await header.locator("form").count(), 0);
      assert.equal(await header.locator(".account-button").count(), 0);

      // The page asked once, and the file the build wrote answered it.
      const asked = await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .filter((entry) => new URL(entry.name).pathname.endsWith("/api/session"))
          .map((entry) => ({
            name: entry.name,
            status: (entry as PerformanceResourceTiming).responseStatus,
          })),
      );
      assert.deepEqual(asked, [{ name: new URL("api/session", url).href, status: 200 }]);
      assert.equal(readFileSync(join(dist, "api", "session"), "utf8"), '{"user":null}');
      // (This static server calls an extensionless file octet-stream: the page does not mind.)
      const served = await page.evaluate(async () => {
        const response = await fetch("api/session");
        return { status: response.status, text: await response.text() };
      });
      assert.deepEqual(served, { status: 200, text: '{"user":null}' });

      // The policy the build wrote lets the sign-out form reach the identity service, and nothing
      // else: the page's connections stay its own.
      const policy = (await page
        .locator('meta[http-equiv="Content-Security-Policy"]')
        .getAttribute("content"))!;
      assert.ok(policy.startsWith("default-src 'none'; "), policy);
      assert.ok(policy.includes("; connect-src 'self'; "), policy);
      assert.ok(policy.endsWith("; form-action 'self' https://id.meltemi.dev"), policy);

      // Everything else is as it was.
      assert.match(await code(page), /diagram overview: flow/);
      assert.equal(await page.locator("#problems-title").textContent(), "No problems");

      // Following the link keeps the person's work first (the click is watched, not followed).
      await page.evaluate(() => {
        localStorage.clear();
        document.addEventListener("click", (event) => {
          if ((event.target as Element).closest("a.sign-in")) event.preventDefault();
        });
      });
      await signIn.click();
      const kept = await page.evaluate(
        () => localStorage.getItem("meltemi-playground:project:v1") !== null,
      );
      assert.equal(kept, true, "the work is kept before the page is left");
      assert.equal(page.url(), url);
    },
  },
  unreadableSession(
    "an HTML page",
    "<!doctype html><html><head><title>Not the API</title></head><body><h1>Welcome</h1></body></html>",
    "text/html; charset=utf-8",
  ),
  unreadableSession(
    "a JSON body that is cut short",
    '{"user":{"sub":"u1","name":"An',
    "application/json",
  ),
  unreadableSession("a JSON array instead of an object", '[{"user":null}]', "application/json"),
  {
    name: "switches the interface to Spanish and the sign-in link says Iniciar sesión",
    async run({ page }) {
      const topbar = page.locator(".topbar");
      const before = await topbar.getByRole("link", { name: "Sign in" }).getAttribute("href");
      await topbar.getByRole("button", { name: "Language: English" }).click();
      await Promise.all([
        page.waitForEvent("load"),
        page.getByRole("menuitemradio", { name: "Español" }).click(),
      ]);
      await ready(page);
      assert.equal(await page.evaluate(() => document.documentElement.lang), "es");
      const signIn = topbar.getByRole("link", { name: "Iniciar sesión" });
      assert.equal(await signIn.count(), 1);
      assert.equal(await topbar.getByRole("link", { name: "Sign in" }).count(), 0);
      assert.equal(await signIn.getAttribute("title"), "Inicia sesión con tu cuenta de Meltemi");
      assert.equal(await signIn.getAttribute("href"), before, "the same link, in other words");
    },
  },
  signedIn({
    name: "signed in, shows the person, a menu of three entries, a sign-out form and API tokens",
    // The browser notes in its console that the quota's refusal was a 413.
    allowedErrors: [/status of 413/],
    run: (t) => accountFlow(t, en, "en"),
  }),
  signedIn({
    name: "signed in, in a Spanish browser, does all of it in Spanish",
    locale: "es-CL",
    allowedErrors: [/status of 413/],
    run: (t) => accountFlow(t, es, "es"),
  }),
  {
    name: "keeps the header, with its sign-in link, inside the screen from a phone to a wide screen",
    run: ({ page }) => headerFits(page, WIDTHS),
  },
  signedIn({
    name: "keeps the header, with a long name beside the avatar, inside the screen at every width",
    answer: (origin) => cookieAnswer(origin, { name: "Ana María de los Ángeles Fernández Ortiz" }),
    run: ({ page }) => headerFits(page, WIDTHS),
  }),
  signedIn({
    name: "signed in on a narrow screen, the header does not scroll and the menu stays in view",
    viewport: { width: 375, height: 760 },
    async run({ page }) {
      const wide = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      assert.equal(wide, false, "no sideways scrolling");
      const button = page.locator(".topbar .account-button");
      const inView = async (target: typeof button) => {
        const box = (await target.boundingBox())!;
        return box.x >= 0 && box.x + box.width <= 375;
      };
      assert.equal(await inView(button), true, "the account button is in view");
      await button.click();
      assert.equal(await inView(page.locator("#menu-account")), true, "the menu is in view");
      await page.locator(".account-usage").waitFor();
      assert.equal(await inView(page.locator(".account-usage")), true, "the usage is in view");
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
        false,
        "the usage does not make the page scroll sideways",
      );
      await page.screenshot({ path: join(output, "account-narrow.png") });
    },
  }),
  signedIn({
    name: "signed in, in Spanish on a narrow screen, the menu keeps its words and its usage in view",
    locale: "es-CL",
    viewport: { width: 375, height: 760 },
    async run({ page }) {
      await page.locator(".topbar .account-button").click();
      const held = page.locator(".account-usage");
      await held.waitFor();
      assert.deepEqual(await held.locator(".usage-text").allTextContents(), [
        "3 de 100 proyectos",
        "5,2 MiB de 200 MiB usados",
      ]);
      const box = (await page.locator(".pg-menu:has(.account-usage)").boundingBox())!;
      assert.ok(box.x >= 0 && box.x + box.width <= 375, "the menu is in view");
      await page.screenshot({ path: join(output, "account-narrow-es.png") });
    },
  }),
  signedIn({
    name: "signed in, near the limits the meters turn to the warning colour, and over them stay full while the words say the numbers",
    usage: {
      status: 200,
      body: {
        projects: 96,
        storageBytes: 190 * 1024 * 1024,
        limits: { projects: 100, storageBytes: 200 * 1024 * 1024 },
      },
    },
    async run({ page, usage }) {
      const button = page.locator(".topbar .account-button");
      const held = page.locator(".account-usage");
      const state = () =>
        held.evaluate((block) => ({
          text: [...block.querySelectorAll(".usage-text")].map((text) => text.textContent),
          meters: [...block.querySelectorAll("meter")].map((meter) => [
            meter.value,
            meter.max,
            meter.classList.contains("full"),
          ]),
        }));
      await button.click();
      await held.waitFor();
      assert.deepEqual(await state(), {
        text: ["96 of 100 projects", "190 MiB of 200 MiB used"],
        meters: [
          [96, 100, true],
          [190 * 1024 * 1024, 200 * 1024 * 1024, true],
        ],
      });
      await page.screenshot({ path: join(output, "account-usage-full.png") });
      await page.keyboard.press("Escape");

      // Over the limit (versions are not refused for it): the meter stops at the end, the words go on.
      usage.answer = {
        status: 200,
        body: {
          projects: 100,
          storageBytes: 210 * 1024 * 1024,
          limits: { projects: 100, storageBytes: 200 * 1024 * 1024 },
        },
      };
      await button.click();
      await until(
        page,
        "the new numbers",
        () => document.querySelector(".usage-text")?.textContent === "100 of 100 projects",
      );
      assert.deepEqual(await state(), {
        text: ["100 of 100 projects", "210 MiB of 200 MiB used"],
        meters: [
          [100, 100, true],
          [200 * 1024 * 1024, 200 * 1024 * 1024, true],
        ],
      });
    },
  }),
  signedIn({
    name: "signed in, a failed read of the usage shows nothing and breaks nothing; the next opening reads it again",
    usage: { status: 500, body: { code: "internal", message: "Oops." } },
    // The browser notes in its console that the read was a 500.
    allowedErrors: [/status of 500/],
    async run({ page, usage }) {
      const button = page.locator(".topbar .account-button");
      const menu = page.locator("#menu-account");
      await button.click();
      await page.waitForTimeout(200);
      assert.equal(usage.requests, 1);
      assert.equal(await page.locator(".account-usage").isVisible(), false, "no numbers, no block");
      assert.equal(await menu.getByRole("menuitem").count(), 3, "the menu is whole");
      await page.keyboard.press("Escape");

      // An answer that is not what the contract says is no answer either.
      usage.answer = { status: 200, body: { projects: "many" } };
      await button.click();
      await page.waitForTimeout(200);
      assert.equal(usage.requests, 2, "every opening asks again");
      assert.equal(await page.locator(".account-usage").isVisible(), false);
      await page.keyboard.press("Escape");

      // The service answers again: the numbers appear, and a later failure keeps what was read.
      usage.answer = { status: 200, body: ANAS_USAGE };
      await button.click();
      await page.locator(".account-usage").waitFor();
      assert.equal(usage.requests, 3);
      await page.keyboard.press("Escape");
      usage.answer = { status: 200, body: { projects: "many" } };
      await button.click();
      await page.waitForTimeout(200);
      assert.equal(usage.requests, 4);
      assert.equal(
        await page.locator(".account-usage .usage-text").first().textContent(),
        en.cloud.projects.count(3, 100),
        "the last numbers read stay while the menu waits for new ones",
      );
    },
  }),
  signedIn({
    name: "signed in, in the dark, shows the account menu and the tokens dialog",
    dark: true,
    async run({ page }) {
      assert.equal(
        await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches),
        true,
      );
      await page.locator(".topbar .account-button").click();
      await page.locator(".account-usage").waitFor();
      await page.screenshot({ path: join(output, "account-menu-dark.png") });
      await page.locator("#menu-account").getByRole("menuitem", { name: "API tokens" }).click();
      const dialog = page.locator("dialog[open]");
      await dialog.locator(".token-row").first().waitFor();
      await dialog.getByLabel("Name", { exact: true }).fill("night");
      await page.keyboard.press("Enter");
      await dialog.locator(".token-value").waitFor();
      await page.screenshot({ path: join(output, "tokens-dark.png") });
    },
  }),
  signedIn({
    name: "shows a name, a token name and a picture from the server as text and never as markup",
    answer: (origin) =>
      cookieAnswer(origin, {
        name: '<img src=x onerror="window.pwned=1">Ana',
        picture: "javascript:window.pwned=2",
      }),
    held: [
      {
        id: "t1",
        name: '<img src=x onerror="window.pwned=3"><b>laptop</b>',
        created_at: "2026-10-01T10:00:00.000Z",
        last_used_at: "<script>window.pwned=4</script>",
      },
    ],
    async run({ page }) {
      const button = page.locator(".topbar .account-button");
      assert.equal(
        await button.locator(".account-name").textContent(),
        '<img src=x onerror="window.pwned=1">Ana',
      );
      assert.equal(await button.locator("img").count(), 0, "a javascript: address is no picture");
      assert.equal(await button.locator(".account-avatar.outline").count(), 1);
      await button.click();
      await page.locator("#menu-account").getByRole("menuitem", { name: "API tokens" }).click();
      const dialog = page.locator("dialog[open]");
      await dialog.locator(".token-row").first().waitFor();
      assert.equal(
        await dialog.locator(".token-name").textContent(),
        '<img src=x onerror="window.pwned=3"><b>laptop</b>',
      );
      // A time that is not a time is shown as the text it is.
      assert.match(
        (await dialog.locator(".token-meta").textContent()) ?? "",
        /<script>window\.pwned=4<\/script>/,
      );
      const made = await page.evaluate(() => ({
        pwned: (window as unknown as { pwned?: number }).pwned,
        images: document.querySelectorAll('img[src="x"]').length,
        scripts: document.querySelectorAll("body script").length,
        handlers: document.querySelectorAll("[onerror], [onload], [onclick]").length,
        bold: document.querySelectorAll(".token-name b").length,
      }));
      assert.deepEqual(made, { pwned: undefined, images: 0, scripts: 0, handlers: 0, bold: 0 });
    },
  }),
  signedIn({
    name: "signed in with no name and no picture, the button is named Account and draws an outline",
    answer: (origin) => cookieAnswer(origin, { name: "", picture: "" }),
    async run({ page }) {
      const button = page.locator(".topbar").getByRole("button", { name: "Account", exact: true });
      assert.equal(await button.count(), 1);
      assert.equal(await button.locator(".account-name").count(), 0);
      assert.equal(await button.locator("img").count(), 0);
      assert.equal(await button.locator(".account-avatar.outline").count(), 1);
      await button.click();
      const entries = await page.locator("#menu-account").getByRole("menuitem").allTextContents();
      assert.deepEqual(entries, ["Account", "API tokens", "Sign out"]);
    },
  }),
  signedIn({
    name: "draws an outline in place of a picture that cannot be loaded",
    answer: (origin) => cookieAnswer(origin, { picture: `${origin}/no-such-picture.png` }),
    // The browser notes in its console that the picture was not found.
    allowedErrors: [/status of 404/],
    async run({ page }) {
      await until(
        page,
        "the outline in place of the picture",
        () => document.querySelector(".account-button .account-avatar.outline") !== null,
      );
      assert.equal(await page.locator(".account-button img").count(), 0);
      assert.equal(await page.locator(".account-button .account-name").textContent(), "Ana");
    },
  }),
  signedIn({
    name: "takes an answer whose addresses are not web addresses for nobody signed in",
    async run({ page, context, url }) {
      // Each answer is a person signed in but for one address the page must not use.
      const base = (origin: string) => cookieAnswer(origin) as Record<string, unknown>;
      const hostile: [string, (origin: string) => unknown][] = [
        ["a javascript: sign-out", (o) => ({ ...base(o), signOut: "javascript:window.pwned=1" })],
        [
          "a data: account page",
          (o) => ({ ...base(o), account: "data:text/html,<script>window.pwned=2</script>" }),
        ],
        [
          "a sign-out with a password",
          (o) => ({ ...base(o), signOut: "https://id:secret@id.meltemi.dev/logout" }),
        ],
        ["no sign-out at all", (o) => ({ ...base(o), signOut: undefined })],
      ];
      const origin = new URL(url).origin;
      for (const [label, answer] of hostile) {
        await context.unroute("**/api/session");
        await context.route("**/api/session", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(answer(origin)),
          }),
        );
        await page.reload();
        await ready(page);
        const topbar = page.locator(".topbar");
        assert.equal(await topbar.getByRole("link", { name: "Sign in" }).count(), 1, label);
        assert.equal(await topbar.locator(".account-button, form").count(), 0, label);
        const found = await page.evaluate(() => ({
          pwned: (window as unknown as { pwned?: number }).pwned,
          addresses: document.querySelectorAll(
            '[href^="javascript:" i], [action^="javascript:" i], [src^="javascript:" i], [action^="data:" i], [href^="data:" i]',
          ).length,
        }));
        assert.deepEqual(found, { pwned: undefined, addresses: 0 }, label);
      }
    },
  }),
  {
    name: "opens a project by its link in view mode: reads it once, draws, exports, refuses every edit and keeps nothing",
    async setup({ context }) {
      await shareByLink(context, { found: true });
    },
    async run({ page, url }) {
      const key = "meltemi-playground:project:v1";
      const before = await page.evaluate((k) => localStorage.getItem(k), key);
      assert.ok(before, "the page keeps its own project");
      const asked: string[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).pathname.startsWith("/api/")) asked.push(request.method());
      });
      await page.goto(`${url}?project=${SHARED_ID}`);
      await ready(page);
      assert.equal(new URL(page.url()).searchParams.get("project"), SHARED_ID, "the address stays");
      assert.equal(await page.locator(".view-badge").innerText(), "View only");
      assert.equal(await page.locator(".view-copy").isVisible(), true);
      assert.equal(await page.locator(".view-save").isVisible(), false, "nobody has an account");
      assert.equal(await page.locator(".privacy").isHidden(), true);
      assert.equal(await page.locator("#playground").getAttribute("data-viewing"), "snapshot");
      assert.match(
        await page.locator(".status-text").innerText(),
        /Opened Shared purchase to view/,
      );
      assert.match(await code(page), /diagram|language/);
      // The code pane and the canvas only show.
      assert.equal(
        await page.locator(".code-input").evaluate((a: HTMLTextAreaElement) => a.readOnly),
        true,
      );
      assert.equal(
        await page.evaluate(() => document.querySelector("#app")?.closest(".view-only") !== null),
        true,
        "the canvas is read-only",
      );
      const text = await code(page);
      await page.locator(".code-input").click();
      await page.keyboard.press("Control+End");
      await page.keyboard.type("typed", { delay: 2 });
      for (const key of [
        "Enter",
        "Tab",
        "Backspace",
        "Control+z",
        "Control+y",
        "Shift+Alt+F",
        "F2",
      ]) {
        await page.keyboard.press(key);
      }
      assert.equal(await code(page), text, "nothing was typed");
      // The completion list opens, to read; choosing from it changes nothing.
      await caretAfter(page, "using commerce {\n  ");
      await page.keyboard.press("Control+Space");
      await page.locator(".code-popup:not([hidden])").waitFor({ timeout: 5000 });
      await page.keyboard.press("Enter");
      assert.equal(await code(page), text, "the suggestion was not inserted");
      assert.equal(await page.locator(".code-popup:not([hidden])").count(), 0);
      // Every method of the page that edits refuses, whoever calls it: the buttons are only the first guard.
      // (A script as text: the runner's transpiler adds helpers to functions that a page cannot see.)
      const calls = (await page.evaluate(`(async () => {
        const p = window.meltemiPlayground;
        const snapshot = () =>
          JSON.stringify([...p.files()].map(([k, v]) => [k, typeof v === "string" ? v : "bytes"]));
        const before = snapshot();
        const late = [];
        const edits = new Map([[p.studio.open, [{ start: 0, end: 0, newText: "// x\\n" }]]]);
        const methods = [
          ["applyEdits", [edits]],
          ["format", []],
          ["rename", [0, "renamed"]],
          ["newFile", []],
          ["renameFile", []],
          ["deleteFile", []],
          ["openLocal", [[new File(["x"], "extra.meltemi")]]],
          ["pickImage", []],
          ["openTemplate", ["flow"]],
          ["undo", []],
          ["redo", []],
        ];
        for (const [name, args] of methods) {
          // None may wait for a dialog or a file chooser: a refusal comes back at once.
          const done = await Promise.race([
            Promise.resolve(p[name].apply(p, args)).then(() => "returned"),
            new Promise((resolve) => setTimeout(() => resolve("late"), 500)),
          ]);
          if (done === "late") late.push(name);
        }
        return {
          same: snapshot() === before,
          dialogs: document.querySelectorAll("dialog[open]").length,
          late,
        };
      })()`)) as { same: boolean; dialogs: number; late: string[] };
      assert.equal(calls.same, true, "no method changed the project");
      assert.equal(calls.dialogs, 0, "no dialog opened");
      assert.deepEqual(calls.late, [], "each refused at once");
      for (const name of ["Open", "Import", "New file", "Rename the file", "Delete the file"]) {
        assert.equal(
          await page.getByRole("button", { name, exact: true }).first().isDisabled(),
          true,
          name,
        );
      }
      assert.equal(
        await page
          .locator("#menu-templates")
          .evaluate((e) => (e.closest(".pg-menu-wrapper") as HTMLElement).hidden),
        true,
      );
      // The story plays on the canvas, as it does for the person who wrote it.
      await page.locator("#file-select").selectOption("stories/purchase.meltemi");
      await analysed(page);
      await until(page, "the story offered", () => {
        const select = document.querySelector(
          '#app select[aria-label="Story"]',
        ) as HTMLSelectElement | null;
        return select !== null && !select.hidden && select.options.length > 1;
      });
      await page
        .locator("#app")
        .getByRole("combobox", { name: "Story" })
        .selectOption({ index: 1 });
      await until(
        page,
        "the story's timeline",
        () => (document.querySelector("#app .timeline") as HTMLElement | null)?.hidden === false,
      );
      // The export works as always.
      const svg = readFileSync(await exportWith(page, { format: "svg" }), "utf8");
      assert.match(svg, /^<svg|^<\?xml/);
      // Nothing was kept, no socket, nothing but reads.
      assert.equal(await page.evaluate((k) => localStorage.getItem(k), key), before);
      assert.deepEqual([...new Set(asked)], ["GET"]);
      assert.equal(
        await page.evaluate(async () =>
          (await indexedDB.databases()).some((d) => d.name === "meltemi-cloud"),
        ),
        false,
      );
      assert.equal(
        await page.evaluate(
          () =>
            (window as unknown as { meltemiPlayground: { cloud?: unknown } }).meltemiPlayground
              .cloud,
        ),
        undefined,
      );
      await page.screenshot({ path: join(output, "view-mode.png") });
    },
  },
  {
    name: "makes a copy of a viewed project as the page's own project, which then edits and is kept",
    async setup({ context }) {
      await shareByLink(context, { found: true });
    },
    async run({ page, url }) {
      await page.goto(`${url}?project=${SHARED_ID}`);
      await ready(page);
      await page.locator(".view-copy").click();
      await until(
        page,
        "view mode to end",
        () => document.querySelector("#playground")?.getAttribute("data-viewing") === null,
      );
      assert.equal(await page.locator(".view-actions").isHidden(), true);
      assert.equal(
        new URL(page.url()).searchParams.get("project"),
        null,
        "the address stops naming it",
      );
      assert.equal(await page.locator(".privacy").isVisible(), true);
      assert.match(
        await page.locator(".status-text").innerText(),
        /Made a copy of Shared purchase/,
      );
      await page.locator(".code-input").click();
      await page.keyboard.press("Control+End");
      await page.keyboard.type("\n// mine");
      assert.ok((await code(page)).endsWith("// mine"));
      await page.waitForTimeout(700);
      const kept = JSON.parse(
        (await page.evaluate(() => localStorage.getItem("meltemi-playground:project:v1")))!,
      ) as { files: Record<string, string> };
      assert.ok(
        Object.values(kept.files).some((text) => text.endsWith("// mine")),
        "kept as usual",
      );
      assert.equal(
        Object.keys(kept.files).length,
        Object.keys(templates.find((t) => t.name === "purchase")!.files).length,
      );
    },
  },
  {
    name: "says a project that is not found was not found, offers sign-in, and opens the page's own project",
    allowedErrors: [/status of 404/],
    async setup({ context }) {
      await shareByLink(context, { found: false });
    },
    async run({ page, url }) {
      const own = await code(page);
      await page.goto(`${url}?project=${SHARED_ID}&invite=abc`);
      await ready(page);
      assert.match(
        await page.locator(".status-text").innerText(),
        /Sign in to accept the invitation/,
      );
      assert.equal(new URL(page.url()).searchParams.get("invite"), "abc", "the invitation stays");
      const signIn = decodeURIComponent(
        (await page.locator(".topbar a.sign-in").getAttribute("href"))!,
      );
      assert.ok(signIn.includes(`project=${SHARED_ID}&invite=abc`), signIn);
      await page.goto(`${url}?project=${SHARED_ID}`);
      await ready(page);
      assert.match(await page.locator(".status-text").innerText(), /project was not found/);
      assert.equal(await page.locator(".view-badge").count(), 0);
      assert.equal(await code(page), own, "the page's own project");
      assert.equal(
        await page.evaluate(
          () =>
            (window as unknown as { meltemiPlayground: { studio: { readOnly: boolean } } })
              .meltemiPlayground.studio.readOnly,
        ),
        false,
      );
    },
  },
  signedIn({
    name: "opens a #p= link as the anonymous project for a person signed in, and the drawer offers to save it to the cloud",
    async run({ page, context, url }) {
      await context.route(/\/api\/projects(\?.*)?$/, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ projects: [] }),
        }),
      );
      const flow = templates.find((t) => t.name === "flow")!;
      const value = await encodeShare({
        open: "diagrams/linked.meltemi",
        files: {
          ...flow.files,
          "diagrams/linked.meltemi": 'diagram linked: flow {\n  title "Linked"\n}\n',
        },
      });
      await page.goto(`${url}#p=${value}`);
      await ready(page);
      assert.match(await code(page), /diagram linked: flow/);
      assert.equal(
        new URL(page.url()).hash,
        "",
        "the link's project is opened, then the address is clean",
      );
      assert.equal(new URL(page.url()).searchParams.get("project"), null);
      // The anonymous project: not a cloud project, and kept in the browser as usual.
      assert.equal(await page.locator(".cloud-status").isHidden(), true);
      assert.notEqual(await page.locator("#playground").getAttribute("data-cloud"), "open");
      assert.equal(await page.locator(".view-actions").count(), 0);
      assert.equal(await page.locator(".privacy").isVisible(), true);
      await page.locator(".projects-button").click();
      const save = page.getByRole("button", { name: "Save this project to the cloud" });
      await save.waitFor();
      assert.equal(await save.isVisible(), true);
    },
  }),
];

/** A project somebody shared by its link (its metadata and its files, for anybody), or one that is not found. */
const SHARED_ID = "sharedproject0123456";
async function shareByLink(context: BrowserContext, answer: { found: boolean }): Promise<void> {
  const purchase = templates.find((t) => t.name === "purchase")!;
  await context.route(new RegExp(`/api/projects/${SHARED_ID}(/files)?$`), (route) => {
    if (!answer.found) {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ code: "project.not-found", message: "No such project." }),
      });
    }
    const files = route.request().url().endsWith("/files");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        files
          ? { revision: 1, files: purchase.files, binaries: {}, collisions: [] }
          : {
              id: SHARED_ID,
              name: "Shared purchase",
              description: "",
              updated_at: "2026-10-15T10:00:00.000Z",
              thumbnail: null,
              role: "viewer",
            },
      ),
    });
  });
}

async function main(): Promise<void> {
  const { server, origin } = await serve();
  const url = `${origin}/index.html`;
  const browser: Browser = await chromium.launch({ executablePath: browserPath(), headless: true });
  let failed = 0;
  const filter = process.env["PLAYGROUND_TEST_FILTER"];
  const chosen = filter ? tests.filter((test) => test.name.includes(filter)) : tests;
  try {
    for (const test of chosen) {
      const context = await browser.newContext({
        acceptDownloads: true,
        viewport: test.viewport ?? { width: 1440, height: 900 },
        colorScheme: test.dark ? "dark" : "light",
        locale: test.locale ?? "en-US",
      });
      await context.addInitScript(() => {
        // The print dialog would wait for a person.
        window.print = () => undefined;
      });
      if (test.init) await context.addInitScript(test.init);
      const page = await context.newPage();
      const outside: string[] = [];
      const errors: string[] = [];
      context.on("request", (request) => {
        const target = request.url();
        // The browser's own pages (its downloads list) are not the page's requests.
        if (/^(https?|wss?|ftp):/.test(target) && !target.startsWith(`${origin}/`))
          outside.push(target);
      });
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      try {
        await test.setup?.({ page, context, origin });
        await page.goto(url);
        await ready(page);
        await test.run({ page, context, url });
        const unexpected = errors.filter(
          (message) => !test.allowedErrors?.some((allowed) => allowed.test(message)),
        );
        assert.deepEqual(unexpected, [], "no errors");
        assert.deepEqual(outside, [], "no request leaves the page's origin");
        console.log(`  ✓ ${test.name}`);
      } catch (error) {
        failed++;
        console.log(`  ✗ ${test.name}\n    ${(error as Error).message.split("\n").join("\n    ")}`);
        await page
          .screenshot({ path: join(output, `failed-${tests.indexOf(test)}.png`) })
          .catch(() => undefined);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(
    `\n${chosen.length - failed} passed, ${failed} failed${ffprobe ? "" : " (FFmpeg not found: videos checked without ffprobe)"}`,
  );
  if (failed > 0) process.exitCode = 1;
}

await main();
