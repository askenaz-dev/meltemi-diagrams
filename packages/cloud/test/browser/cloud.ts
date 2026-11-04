/**
 * What the scenarios of the cloud projects share: making projects and reading rooms through the
 * Worker, and driving the playground as a person does (typing, dragging, the switcher's panel,
 * waiting for the connection). Selectors and words come from the page's own code.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { BrowserContext, Locator, Page } from "playwright-core";
import type { Person } from "./scenario.js";
import { analysed, until } from "./support.js";

/** Accessors of the playground's own parts, for what is read from inside the page. */
interface PageStudio {
  open: string;
  text(path: string): string | undefined;
  isBound(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  host: { paths(): string[]; get(path: string): string | Uint8Array | undefined };
}
interface PageWindow {
  meltemiPlayground: {
    studio: PageStudio;
    cloud?: { status?: { state: string }; flush(): void; network(): void };
  };
}

/**
 * The browser's note that a request answered 429. Two devices open on one project both send its
 * picture; the Worker takes one in thirty seconds (`thumbnail.rate`) and the page, which tries once
 * more a minute later and says nothing, ignores the refusal, but the browser logs it as an error.
 */
export const THUMBNAIL_RATE_LOGGED = /status of 429/;

/**
 * What Playwright's routed socket throws in the page when the room's message reaches a socket the
 * page is already closing: `routeWebSocket` (`gateRooms`, `muteRooms`) puts Playwright's own socket
 * in place of the browser's, and it throws this when the route hands it a message after the close
 * began. The page's own sends never cause it (they check `readyState` and catch), as the scenario on
 * a socket the Worker closes checks with no console error allowed.
 */
export const ROUTED_SOCKET_CLOSING = /^WebSocket is already in CLOSING or CLOSED state\.$/;

// ---------------------------------------------------------------------------------------------
// Files the scenarios make projects of

/** A one-pixel PNG. */
export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** A picture of a project, as the thumbnail the page sends is: an SVG. */
export const PICTURE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64" width="96" height="64">' +
  '<rect width="96" height="64" fill="#2a6df4"/><text x="8" y="36" fill="#ffffff">Notes</text></svg>';

/** A small flow of two boxes: a file that draws, with lines to type into and a label to change. */
export const NOTES = [
  'language "0.2"',
  "",
  "diagram notes: flow {",
  '  title "Notes"',
  "  direction LR",
  "",
  '  alpha["Alpha"]',
  '  beta["Beta"]',
  '  gamma["Gamma"]',
  "",
  "  alpha -> beta",
  "  beta -> gamma",
  "}",
  "",
].join("\n");

export const sha256 = (bytes: Uint8Array | string): string =>
  createHash("sha256").update(bytes).digest("hex");

// ---------------------------------------------------------------------------------------------
// The Worker's side: projects and rooms

/** A project as the Worker lists it. */
export interface ProjectRow {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly updated_at: string;
  readonly thumbnail: string | null;
  readonly role: string;
}

/** What a room holds, as `GET /api/projects/:id/files` answers. */
export interface RoomRead {
  readonly revision: number;
  readonly files: Record<string, string>;
  readonly binaries: Record<string, string>;
  readonly collisions: readonly unknown[];
}

/** What the room counts (`GET /api/dev/rooms/:id/stats`). */
export interface RoomStats {
  readonly revision: number;
  readonly clients: number;
  readonly storageWrites: number;
  readonly materialisations: number;
  readonly materialiseFailures: number;
  readonly d1RowsWritten: number;
  readonly messages: number;
  /** Of `messages`, the awareness (kind 2) ones, the dropped and the invalid ones included. */
  readonly awareness: number;
  /** Awareness messages the room did not relay: beyond 20 a second from one client, or malformed. */
  readonly awarenessDropped: number;
}

/** Makes a project from a template or from files. */
export async function makeProject(
  person: Person,
  name: string,
  content: { template: string } | { files: Record<string, string> },
): Promise<ProjectRow> {
  const made = await person.api("POST", "/api/projects", { name, ...content });
  assert.equal(made.status, 201, made.text.slice(0, 300));
  return made.json() as unknown as ProjectRow;
}

/** The projects of a person, newest first. */
export async function listProjects(person: Person): Promise<ProjectRow[]> {
  const listed = await person.api("GET", "/api/projects");
  assert.equal(listed.status, 200, listed.text.slice(0, 300));
  return (listed.json()["projects"] ?? []) as ProjectRow[];
}

/** The room's latest files, which readers read from the room and never from D1. */
export async function readRoom(person: Person, id: string): Promise<RoomRead> {
  const read = await person.api("GET", `/api/projects/${id}/files`);
  assert.equal(read.status, 200, read.text.slice(0, 300));
  return read.json() as unknown as RoomRead;
}

export async function roomStats(person: Person, id: string): Promise<RoomStats> {
  const read = await person.api("GET", `/api/dev/rooms/${id}/stats`);
  assert.equal(read.status, 200, read.text.slice(0, 300));
  return read.json() as unknown as RoomStats;
}

/**
 * Lowers how many clients the room admits from now on (development only), so that "the 21st client
 * is refused" can be seen with two; no `clients` gives the real limit back. Nobody connected is cut.
 * Answers the limit now in force. The room tells a refused client with a kind 4 `room.full`; its close
 * (4409) is sent before the upgrade is answered and reaches a client only after many seconds.
 */
export async function limitRoom(person: Person, id: string, clients?: number): Promise<number> {
  const set = await person.api("POST", `/api/dev/rooms/${id}/limits`, { clients: clients ?? null });
  assert.equal(set.status, 200, set.text.slice(0, 300));
  return Number(set.json()["clients"]);
}

/**
 * Cuts the sockets of a room (development only): how many were closed. With `target`, only the
 * sockets of one person (`sub`) or one connection (`id`); with none, every socket of the room.
 */
export async function cutRoom(
  person: Person,
  id: string,
  target?: { readonly sub?: string; readonly id?: string },
): Promise<number> {
  const cut = await person.api("POST", `/api/dev/rooms/${id}/disconnect`, target);
  assert.equal(cut.status, 200, cut.text.slice(0, 300));
  return Number(cut.json()["closed"]);
}

/** A blob as the Worker serves it: its status, headers and bytes (none for a `HEAD`). */
export async function blobOf(
  origin: string,
  person: Person,
  id: string,
  hash: string,
  method: "GET" | "HEAD" = "GET",
): Promise<{ status: number; headers: Headers; bytes: Uint8Array }> {
  const response = await fetch(`${origin}/api/projects/${id}/blobs/${hash}`, {
    method,
    headers: person.cookie,
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  return {
    status: response.status,
    headers: response.headers,
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
}

/** Polls from Node until `test` holds, naming what it waited for when it does not. */
export async function waitFor(
  label: string,
  test: () => boolean | Promise<boolean>,
  timeout = 20_000,
): Promise<void> {
  const until = Date.now() + timeout;
  while (!(await test())) {
    if (Date.now() > until) throw new Error(`Timed out waiting: ${label}`);
    await new Promise((done) => setTimeout(done, 100));
  }
}

/** Polls the room until its files satisfy `test`; the last read is the answer. */
export async function roomHolds(
  person: Person,
  id: string,
  label: string,
  test: (room: RoomRead) => boolean,
  timeout = 20_000,
): Promise<RoomRead> {
  const until = Date.now() + timeout;
  let last: RoomRead | undefined;
  for (;;) {
    last = await readRoom(person, id);
    if (test(last)) return last;
    if (Date.now() > until) {
      throw new Error(
        `Timed out waiting for the room: ${label} (revision ${last.revision}, files ${Object.keys(last.files).join(", ")})`,
      );
    }
    await new Promise((done) => setTimeout(done, 150));
  }
}

// ---------------------------------------------------------------------------------------------
// The page

/** The text in the code pane. */
export const code = (page: Page): Promise<string> => page.locator(".code-input").inputValue();

/** Waits until the code pane holds exactly `expected`. */
export async function codeIs(page: Page, expected: string, label: string): Promise<void> {
  await until(
    page,
    label,
    (text) => (document.querySelector(".code-input") as HTMLTextAreaElement).value === text,
    expected,
  );
}

/** What the status line says. */
export const statusLine = (page: Page): Promise<string> => page.locator(".status-text").innerText();

/** The cloud project's connection: `connected`, `saving`, `reconnecting`, `offline`, `connecting`. */
export const connection = (page: Page): Promise<string | null> =>
  page.locator(".cloud-status").getAttribute("data-state");

/** Waits until the page says the project is saved to the cloud. */
export async function connected(
  page: Page,
  label = "the project connected and saved",
): Promise<void> {
  await until(
    page,
    label,
    () => document.querySelector(".cloud-status")?.getAttribute("data-state") === "connected",
  );
}

/** Opens a project by its link as a person does and waits until it is open and saved. */
export async function openByLink(page: Page, origin: string, id: string): Promise<void> {
  await page.goto(`${origin}/p/${id}`);
  await page.waitForFunction(
    () => "meltemiPlayground" in window && document.querySelector("#app .content svg") !== null,
    undefined,
    { timeout: 30_000 },
  );
  await connected(page);
  await analysed(page);
}

/** The Studio's state, read from the page. */
export async function studioState(page: Page): Promise<{
  open: string;
  paths: string[];
  bound: boolean;
  canUndo: boolean;
  canRedo: boolean;
}> {
  return page.evaluate(() => {
    const { studio } = (window as unknown as PageWindow).meltemiPlayground;
    return {
      open: studio.open,
      paths: studio.host.paths(),
      bound: studio.isBound(),
      canUndo: studio.canUndo(),
      canRedo: studio.canRedo(),
    };
  });
}

/** The text of a file of the open project, as the Studio holds it. */
export const textOf = (page: Page, path: string): Promise<string | undefined> =>
  page.evaluate(
    (file) => (window as unknown as PageWindow).meltemiPlayground.studio.text(file),
    path,
  );

/** Waits until the text of a file holds `needle` (or, with `present` false, no longer holds it). */
export async function textHas(
  page: Page,
  path: string,
  needle: string,
  present = true,
): Promise<void> {
  await until(
    page,
    `${path} ${present ? "holds" : "no longer holds"} ${JSON.stringify(needle.slice(0, 60))}`,
    ([file, wanted, should]) => {
      const text = (window as unknown as PageWindow).meltemiPlayground.studio.text(file);
      return text !== undefined && text.includes(wanted) === should;
    },
    [path, needle, present] as const,
  );
}

/** The caret of the code pane: where it is, the line it is on (1-based) and the text after it. */
export const caret = (
  page: Page,
): Promise<{ start: number; end: number; line: number; after: string }> =>
  page.locator(".code-input").evaluate((area: HTMLTextAreaElement) => ({
    start: area.selectionStart,
    end: area.selectionEnd,
    line: area.value.slice(0, area.selectionStart).split("\n").length,
    after: area.value.slice(area.selectionStart, area.selectionStart + 24),
  }));

/** Puts the caret at the start of the first match of `needle` (or after it) in the code pane. */
export async function caretAt(page: Page, needle: string, after = false): Promise<void> {
  await page.locator(".code-input").evaluate(
    (area: HTMLTextAreaElement, [text, behind]) => {
      const at = area.value.indexOf(text as string);
      if (at < 0) throw new Error(`"${text as string}" is not in the code`);
      const offset = behind ? at + (text as string).length : at;
      area.focus();
      area.setSelectionRange(offset, offset);
    },
    [needle, after] as const,
  );
}

/** Types at the end of the open file, as a person does: a click in the pane, End, then the keys. */
export async function typeAtEnd(page: Page, text: string, delay = 12): Promise<void> {
  await page.locator(".code-input").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text, { delay });
}

/** Presses Ctrl+Z in the code pane. */
export async function undo(page: Page): Promise<void> {
  await page.locator(".code-input").focus();
  await page.keyboard.press("Control+z");
}

/** The header's undo button. */
export const undoButton = (page: Page) => page.getByRole("button", { name: "Undo", exact: true });

/**
 * Waits until the header's undo button is enabled (or disabled): it follows what the person can
 * undo once the analysis after a change has settled, not at the moment of the change.
 */
export async function undoIs(page: Page, enabled: boolean, label: string): Promise<void> {
  await until(
    page,
    `the undo button ${enabled ? "enabled" : "disabled"}: ${label}`,
    (wanted) =>
      (document.querySelector('button[aria-label="Undo"]') as HTMLButtonElement).disabled ===
      !wanted,
    enabled,
  );
}

/**
 * Where an element of the canvas is drawn. The canvas draws the diagram again after a file is opened or
 * an analysis lands, and the element is gone for a moment, so its place is read until it is there.
 */
export async function elementBox(
  page: Page,
  id: string,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const element = page.locator(`#app .content g[data-id="${id}"][data-role="element"]`).first();
  let box = await element.boundingBox();
  for (let attempt = 0; box === null && attempt < 50; attempt++) {
    await page.waitForTimeout(100);
    box = await element.boundingBox();
  }
  assert.ok(box, `${id} is drawn`);
  return box;
}

/** Drags an element of the canvas by an offset of pixels, in a few steps as a hand does. */
export async function dragElement(page: Page, id: string, dx: number, dy: number): Promise<void> {
  const box = await elementBox(page, id);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

// ---------------------------------------------------------------------------------------------
// The connection to the room

/**
 * A door to the room that a scenario can shut, for the time the connection is "down": the sockets
 * the page opens pass through it to the real room, or, while it is shut, are closed on the spot (the
 * network that does not reach the Worker). The real cut is the Worker's own (`cutRoom`); this keeps
 * the page from reaching the room again until the scenario says so, so that what a person does
 * while offline takes as long as the scenario needs. Install it before the page loads.
 */
export interface Gate {
  /** Sockets opened from now on are closed at once. */
  shut(): void;
  /** Sockets opened from now on reach the room. */
  open(): void;
  /** How many sockets were closed at the door. */
  readonly refused: number;
}

export async function gateRooms(context: BrowserContext): Promise<Gate> {
  let shut = false;
  let refused = 0;
  await context.routeWebSocket(/\/rooms\//, (socket) => {
    if (shut) {
      refused++;
      void socket.close();
    } else socket.connectToServer();
  });
  return {
    shut: () => void (shut = true),
    open: () => void (shut = false),
    get refused() {
      return refused;
    },
  };
}

/**
 * A page that can go silent towards its room: what the page sends on its sockets is swallowed for as
 * long as it is muted, while its sockets stay open and what the room says still reaches it. That is a
 * browser that is suspended, or whose network has gone, from the room's side: it hears nothing from it,
 * and never hears that it left. Install it before the page loads.
 */
export interface Mute {
  /** What the page sends from now on is swallowed. */
  mute(): void;
  /** What the page sends from now on reaches the room. */
  unmute(): void;
  /** How many messages were swallowed. */
  readonly swallowed: number;
}

export async function muteRooms(context: BrowserContext): Promise<Mute> {
  let muted = false;
  let swallowed = 0;
  await context.routeWebSocket(/\/rooms\//, (socket) => {
    const room = socket.connectToServer();
    // What the room says goes to the page by itself; what the page says is ours to pass on.
    socket.onMessage((message) => {
      if (muted) swallowed++;
      else room.send(message);
    });
  });
  return {
    mute: () => void (muted = true),
    unmute: () => void (muted = false),
    get swallowed() {
      return swallowed;
    },
  };
}

/** Tells the page the browser is back online, as the browser does: it reconnects at once. */
export async function backOnline(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
}

/** Waits until the project's connection is none of `states`. */
export async function connectionLeaves(page: Page, ...states: string[]): Promise<void> {
  await until(
    page,
    `the connection to leave ${states.join(" or ")}`,
    (left) =>
      !left.includes(document.querySelector(".cloud-status")?.getAttribute("data-state") ?? ""),
    states,
  );
}

// ---------------------------------------------------------------------------------------------
// The switcher and the dialogs

/** The panel the explorer's switcher opens, while it is open (not the one fading out). */
export const switcherPanel = (page: Page): Locator => page.locator(".switcher-panel:not(.leaving)");

/** Opens the switcher's panel and waits until it has read the person's cloud projects. */
export async function openSwitcher(page: Page): Promise<Locator> {
  const panel = switcherPanel(page);
  if ((await panel.count()) === 0) await page.locator(".switcher-button").click();
  await panel.waitFor();
  await until(
    page,
    "the panel's list",
    () =>
      (document.querySelector(".switcher-panel:not(.leaving) .panel-count")?.textContent ?? "") !==
      "",
  );
  return panel;
}

/** Closes the switcher's panel with Escape, as a person does, and waits until it is gone. */
export async function closeSwitcher(page: Page): Promise<void> {
  const panel = switcherPanel(page);
  if ((await panel.count()) > 0) {
    // The panel hears its own keys: Escape reaches it with the focus inside.
    if (!(await panel.evaluate((element) => element.contains(document.activeElement)))) {
      await panel.locator(".switcher-close").focus();
    }
    await page.keyboard.press("Escape");
  }
  await until(page, "the panel to close", () => document.querySelector(".switcher-panel") === null);
}

/** The names of the cloud projects the panel lists, in order. */
export const switcherNames = (page: Page): Promise<string[]> =>
  switcherPanel(page).locator(".project-row .panel-project-name").allInnerTexts();

/** The row of a cloud project in the panel. */
export const switcherRow = (page: Page, name: string): Locator =>
  switcherPanel(page)
    .locator(".project-row")
    .filter({
      has: page.locator(".panel-project-name", { hasText: new RegExp(`^${escape(name)}$`) }),
    });

/** The project of this browser in the panel: the button that opens it, marked when it is open. */
export const switcherLocal = (page: Page): Locator =>
  switcherPanel(page).locator('button.panel-project[aria-label$=", the project of this browser"]');

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Waits until no dialog is open. */
export async function noDialog(page: Page, label = "the dialogs to close"): Promise<void> {
  await until(page, label, () => document.querySelector("dialog[open]") === null);
}
