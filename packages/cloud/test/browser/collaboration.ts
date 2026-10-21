/**
 * What the scenarios of live collaboration share: reading "who is here", the carets and the canvas
 * outlines of other people off a page, putting a caret or a selection in the code pane, and a client of
 * the room from Node that listens to what the room relays (the room's own account of each person: the
 * identity and the colour it attaches). Selectors and words come from the page's own code
 * (`src/cloud/presence-*.ts`, `canvas/src/presence-layer.ts`).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Page } from "playwright-core";
import type * as Y from "yjs";
import {
  elementBox,
  gateRooms,
  makeProject,
  noDialog,
  openByLink,
  type Gate,
  type ProjectRow,
} from "./cloud.js";
import { RoomClient, KIND, join as joinRoom, type Joined } from "./room-socket.js";
import type { Device, Person, Run } from "./scenario.js";
import { addMember } from "./sharing.js";
import { until } from "./support.js";

/** The file the `flow` template opens, and the other file it holds; the `free` template's slide. */
export const OVERVIEW = "diagrams/overview.meltemi";
export const MANIFEST = "project.json";
export const SLIDE = "diagrams/slide.meltemi";

/** Ana (the scenario's person, the owner) and Ben (an editor) with one project open in two browsers. */
export interface Pair {
  readonly ana: Page;
  readonly bens: Page;
  readonly ben: Person;
  readonly device: Device;
  readonly project: ProjectRow;
}

/**
 * Makes a project from a template for the scenario's person (Ana), makes `sub` (called `name`) an
 * editor of it and opens it in two browsers, Ana's and Ben's. `gate` puts a door in front of one
 * browser's sockets before its page loads (see `gateRooms`).
 */
export async function pairIn(
  t: Run,
  template: string,
  sub: string,
  name = "Ben",
  options: { gate?: "ana" | "ben"; title?: string } = {},
): Promise<Pair & { readonly door: Gate | undefined }> {
  const ben = await t.person(sub, { name });
  const project = await makeProject(t.me, options.title ?? "Together", { template });
  await addMember(t.me, project.id, ben, "editor");
  const device = await t.device({ as: ben });
  const door =
    options.gate === undefined
      ? undefined
      : await gateRooms(options.gate === "ana" ? t.context : device.context);
  await openByLink(t.page, t.origin, project.id);
  await openByLink(device.page, t.origin, project.id);
  return { ana: t.page, bens: device.page, ben, device, project, door };
}

/** Drags an element slowly, by an offset of pixels, taking `ms` milliseconds from the press to the release. */
export async function slowDrag(
  page: Page,
  id: string,
  dx: number,
  dy: number,
  ms: number,
): Promise<void> {
  const box = await elementBox(page, id);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const steps = 10;
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(x + (dx * step) / steps, y + (dy * step) / steps);
    await page.waitForTimeout(ms / steps);
  }
  await page.mouse.up();
}

/** `#e03131` as the browser reports it in a computed style: `rgb(224, 49, 49)`. */
export function rgb(hex: string): string {
  const value = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!value) throw new Error(`not a colour: ${hex}`);
  return `rgb(${parseInt(value[1]!, 16)}, ${parseInt(value[2]!, 16)}, ${parseInt(value[3]!, 16)})`;
}

// ---------------------------------------------------------------------------------------------
// The header's "who is here"

/** One person of the header, as the page draws them. */
export interface Listed {
  /** The button's accessible name: `<name>, in <path>`. */
  readonly label: string;
  readonly name: string;
  /** The last part of the path of the file they are in; null when the page shows none. */
  readonly file: string | null;
  /** The colour the page gave the person (`--presence`, as set: a hex). */
  readonly colour: string;
  /** The colour the browser draws their border in. */
  readonly border: string;
  /** Where their picture comes from, if they have one. */
  readonly picture: string | null;
}

/** The people the header lists, in order (those beyond the first four are in a menu: none here). */
export function listed(page: Page): Promise<Listed[]> {
  return page.locator(".presence-person").evaluateAll((buttons) =>
    buttons.map((button) => ({
      label: button.getAttribute("aria-label") ?? "",
      name: button.querySelector(".presence-name")?.textContent ?? "",
      file: button.querySelector(".presence-file")?.textContent ?? null,
      colour: (button as HTMLElement).style.getPropertyValue("--presence"),
      border: getComputedStyle(button).borderTopColor,
      picture: button.querySelector("img")?.getAttribute("src") ?? null,
    })),
  );
}

/**
 * Waits until the header lists exactly these button names, in whatever order (the order is the one in
 * which the page first heard of each person, which a scenario that has several arrive together does not
 * decide).
 */
export async function listsLabels(page: Page, labels: string[], what: string): Promise<void> {
  try {
    await page.waitForFunction(
      (expected) => {
        const found = [...document.querySelectorAll(".presence-person")]
          .map((button) => button.getAttribute("aria-label") ?? "")
          .sort();
        return JSON.stringify(found) === JSON.stringify(expected);
      },
      [...labels].sort(),
      { timeout: 20_000 },
    );
  } catch {
    const now = await listed(page).then((people) => people.map((person) => person.label));
    throw new Error(
      `Timed out waiting: the header to list ${JSON.stringify(labels)} (${what}); it lists ${JSON.stringify(now)}`,
    );
  }
}

/** Waits until the header lists nobody. */
export const listsNobody = (page: Page, what: string): Promise<void> => listsLabels(page, [], what);

// ---------------------------------------------------------------------------------------------
// The code pane

/** Puts the caret at a character offset of the code pane, or selects a range, with the pane focused. */
export async function select(page: Page, start: number, end = start): Promise<void> {
  await page.locator(".code-input").evaluate(
    (area: HTMLTextAreaElement, [from, to]) => {
      area.focus();
      area.setSelectionRange(from as number, to as number);
    },
    [start, end] as const,
  );
}

/** Selects the first match of `needle` in the code pane (or, with `length`, that many characters from it). */
export async function selectText(page: Page, needle: string, length?: number): Promise<string> {
  const range = await page.locator(".code-input").evaluate(
    (area: HTMLTextAreaElement, [text, size]) => {
      const at = area.value.indexOf(text as string);
      if (at < 0) throw new Error(`"${text as string}" is not in the code`);
      const end = at + ((size as number | undefined) ?? (text as string).length);
      area.focus();
      area.setSelectionRange(at, end);
      return area.value.slice(at, end);
    },
    [needle, length] as const,
  );
  return range;
}

/** A caret or selection of another person in the open file, as the page resolved it against the text. */
export interface DrawnPeer {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  /** The characters the selection covers in the code pane now. */
  readonly covers: string;
}

interface PresenceWindow {
  meltemiPlayground: {
    studio: { open: string; session: { selected: readonly string[] } };
    cloud?: {
      presence?: {
        carets(
          path: string,
          text: string,
          fallback: string,
        ): { name: string; start: number; end: number }[];
        peers: readonly { id: string; sub: string; name: string }[];
      };
    };
  };
}

/** The carets of other people that the page puts in the pane for the open file. */
export function drawn(page: Page): Promise<DrawnPeer[]> {
  return page.evaluate(() => {
    const { studio, cloud } = (window as unknown as PresenceWindow).meltemiPlayground;
    const text = (document.querySelector(".code-input") as HTMLTextAreaElement).value;
    return (cloud?.presence?.carets(studio.open, text, "Someone") ?? []).map((peer) => ({
      name: peer.name,
      start: peer.start,
      end: peer.end,
      covers: text.slice(peer.start, peer.end),
    }));
  });
}

/** How many peers (connections of other people, and of other devices of the same person) the page holds. */
export function peerCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as PresenceWindow).meltemiPlayground.cloud?.presence?.peers.length ?? 0,
  );
}

/** The ids this page's canvas has selected. */
export function selectedOnCanvas(page: Page): Promise<string[]> {
  return page.evaluate(() => [
    ...(window as unknown as PresenceWindow).meltemiPlayground.studio.session.selected,
  ]);
}

/** Waits until the ids this page's canvas has selected are exactly these (the canvas tells the Studio a moment after a click). */
export async function selectedIs(page: Page, ids: string[], what: string): Promise<void> {
  await until(
    page,
    `the canvas selection to be ${JSON.stringify(ids)} (${what})`,
    (expected) => {
      const { studio } = (window as unknown as PresenceWindow).meltemiPlayground;
      return JSON.stringify([...studio.session.selected]) === JSON.stringify(expected);
    },
    ids,
  );
}

/** What the page draws in the pane for other people: the bars, the bands and the flags. */
export interface PaneMarks {
  readonly peers: number;
  readonly bands: number;
  readonly flags: { text: string; background: string; faded: boolean; opacity: string }[];
}

export function paneMarks(page: Page): Promise<PaneMarks> {
  return page.evaluate(() => ({
    peers: document.querySelectorAll(".code-presence .presence-peer").length,
    bands: document.querySelectorAll(".code-presence .presence-band").length,
    flags: [...document.querySelectorAll(".code-presence .presence-flag")].map((flag) => ({
      text: flag.textContent ?? "",
      background: getComputedStyle(flag).backgroundColor,
      faded: flag.classList.contains("faded"),
      opacity: getComputedStyle(flag).opacity,
    })),
  }));
}

// ---------------------------------------------------------------------------------------------
// The canvas

/** What the canvas draws for other people: an outline and a tag around each element they selected. */
export interface CanvasMarks {
  readonly outlines: { target: string; stroke: string }[];
  readonly tags: { target: string; text: string; background: string }[];
  /** Whether any element was made from a name (a tag or an outline holding an element child). */
  readonly nested: number;
}

export function canvasMarks(page: Page): Promise<CanvasMarks> {
  return page.evaluate(() => ({
    outlines: [...document.querySelectorAll("#app .presence-outline")].map((outline) => ({
      target: outline.getAttribute("data-target") ?? "",
      stroke: outline.getAttribute("stroke") ?? "",
    })),
    tags: [...document.querySelectorAll("#app .presence-tag")].map((tag) => ({
      target: tag.getAttribute("data-target") ?? "",
      text: tag.textContent ?? "",
      background: getComputedStyle(tag).backgroundColor,
    })),
    nested: document.querySelectorAll("#app .presence-tag *, #app .presence-outline *").length,
  }));
}

/** Waits until the canvas outlines exactly these elements (in any order). */
export async function outlines(page: Page, targets: string[], what: string): Promise<void> {
  const wanted = [...targets].sort();
  await until(
    page,
    `the canvas to outline ${JSON.stringify(wanted)} (${what})`,
    (expected) => {
      const found = [...document.querySelectorAll("#app .presence-outline")]
        .map((outline) => outline.getAttribute("data-target") ?? "")
        .sort();
      return JSON.stringify(found) === JSON.stringify(expected);
    },
    wanted,
  );
}

/**
 * Clicks the middle of an element of the canvas, as a person selecting it does. The canvas draws the
 * diagram again when an analysis lands, and the element is gone for a moment, so its place is read
 * until it is there (`elementBox`).
 */
export async function clickElement(page: Page, id: string): Promise<void> {
  const box = await elementBox(page, id);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** Clicks the canvas where nothing is, which selects nothing. */
export async function clickNothing(page: Page): Promise<void> {
  const area = await page.locator("#app .content").first().boundingBox();
  if (!area) throw new Error("the canvas is not drawn");
  await page.mouse.click(area.x + 6, area.y + 6);
}

// ---------------------------------------------------------------------------------------------
// A client of the room from Node that listens

/** The id of a file of the project, which is how a state names the file the person has open. */
export function fileIdOf(doc: Y.Doc, path = OVERVIEW): string {
  const found = [...doc.getMap<string>("paths")].find(([, shown]) => shown === path)?.[0];
  assert.ok(found, `the project has the file ${path}`);
  return found;
}

/** What a client of the room sends as its state: a JSON object holding one entry, its own. */
export function stateOf(state: { file?: string; canvas?: { selection: string[] } }): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ me: state }));
}

/** A person as the room relays them: the identity it attached, and where the person is. */
export interface RelayedPeer {
  readonly user: { sub: string; name: string; picture: string; colour: string };
  readonly file?: string;
  readonly caret?: { anchor: string; head: string };
  readonly canvas?: { selection: string[] };
}

/** A client of the room that is not a page: it joined as `person` and listens to the awareness the room relays. */
export class Listener {
  private constructor(readonly joined: Joined) {}

  static async join(
    origin: string,
    id: string,
    person: Person,
    headers: Record<string, string> = {},
  ): Promise<Listener> {
    return new Listener(await joinRoom(origin, id, person, headers));
  }

  get client(): RoomClient {
    return this.joined.client;
  }

  /** Every kind 2 message the room sent, in order, as JSON. */
  messages(): Record<string, RelayedPeer | null>[] {
    return this.client.frames
      .filter((frame) => frame.kind === KIND.awareness)
      .map(
        (frame) =>
          JSON.parse(new TextDecoder().decode(frame.payload)) as Record<string, RelayedPeer | null>,
      );
  }

  /** The people the room has told this client about and not told it left, by connection id. */
  here(): Map<string, RelayedPeer> {
    const people = new Map<string, RelayedPeer>();
    for (const message of this.messages()) {
      for (const [id, peer] of Object.entries(message)) {
        if (peer === null) people.delete(id);
        else people.set(id, peer);
      }
    }
    return people;
  }

  /** Waits until the people here are named so (by `sub`, sorted). */
  async hereAre(subs: string[], what: string): Promise<void> {
    const wanted = [...subs].sort();
    await this.client.until(`${what}: the room to name ${wanted.join(", ") || "nobody"}`, () => {
      const found = [...this.here().values()].map((peer) => peer.user.sub).sort();
      return JSON.stringify(found) === JSON.stringify(wanted);
    });
  }

  /** The state the room relayed for a person (the last one). */
  of(sub: string): RelayedPeer | undefined {
    return [...this.here().values()].filter((peer) => peer.user.sub === sub).at(-1);
  }

  close(): void {
    this.client.close();
  }
}

// ---------------------------------------------------------------------------------------------
// What leaves the page, and what stays in the browser

/** Exports the open diagram as SVG from the Export dialog, as a person does, and gives the file's text. */
export async function exportSvg(page: Page): Promise<string> {
  await page.locator(".topbar").getByRole("button", { name: "Export" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel("Format").selectOption("svg");
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    dialog.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  const path = await download.path();
  await noDialog(page, "the export dialog to close");
  return readFileSync(path, "utf8");
}

/**
 * What runs in the page to read everything it keeps. A string, not a function: the suite's own
 * transpiler adds a helper to every named function, which a page does not have.
 */
const READ_STORAGE = `(async () => {
  const parts = [];
  const flatten = (value) => {
    if (value instanceof ArrayBuffer) value = new Uint8Array(value);
    if (ArrayBuffer.isView(value)) {
      const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      parts.push(new TextDecoder("latin1").decode(bytes));
    } else if (Array.isArray(value)) {
      for (const item of value) flatten(item);
    } else if (value !== null && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        parts.push(key);
        flatten(item);
      }
    } else if (value !== undefined) {
      parts.push(String(value));
    }
  };
  for (const area of [localStorage, sessionStorage]) {
    for (let at = 0; at < area.length; at++) {
      const key = area.key(at) || "";
      parts.push(key, area.getItem(key) || "");
    }
  }
  for (const info of await indexedDB.databases()) {
    if (!info.name) continue;
    parts.push(info.name);
    await new Promise((done) => {
      const open = indexedDB.open(info.name);
      open.onerror = () => done();
      open.onsuccess = () => {
        const db = open.result;
        const names = [...db.objectStoreNames];
        if (names.length === 0) {
          db.close();
          done();
          return;
        }
        const transaction = db.transaction(names, "readonly");
        for (const name of names) {
          parts.push(name);
          const all = transaction.objectStore(name).getAll();
          all.onsuccess = () => flatten(all.result);
        }
        transaction.oncomplete = () => {
          db.close();
          done();
        };
        transaction.onerror = () => done();
      };
    });
  }
  return parts.join(" | ");
})()`;

/**
 * Everything this browser keeps for the page: every key and value of `localStorage` and
 * `sessionStorage`, and every record of every IndexedDB database (bytes read as Latin-1 text, so that
 * a name inside a Yjs update can be found). One string, for a scenario to look for a name in.
 */
export function stored(page: Page): Promise<string> {
  return page.evaluate(READ_STORAGE) as Promise<string>;
}
