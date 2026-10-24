/**
 * Webview tests in a headless Edge or Chrome. The harness plays the extension: it owns the text,
 * the canvas session and the revision, applies plans and posts renders, so every test drives the
 * real webview bundle through the same loop as VS Code. Usage: pnpm vscode:test-webview
 */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeDocument,
  CanvasSession,
  renderDiagram,
  type CanvasSettings,
  type HostMessage,
  type PresencePerson,
} from "@meltemi/diagrams-editor";
import { resolveLocale, setLocale } from "@meltemi/diagrams-i18n";
import { compile, readDiagramType, type DiagramTypeDefinition } from "@meltemi/diagrams-model";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { chromium, type Browser, type Locator, type Page } from "playwright-core";
import { browserPath } from "../../scripts/browser.mjs";
import { IconRegistry, SvgFolderPack, librariesOf } from "@meltemi/diagrams-assets";
import { planEdit } from "@meltemi/diagrams-edit";
import { createNodeIconPacks, createNodeLibraries } from "@meltemi/diagrams-assets/node";

/** The built-in packs and libraries, as the extension's host gives them to a session. */
const ICONS = new IconRegistry(createNodeIconPacks());
const LIBRARIES = librariesOf(ICONS, createNodeLibraries());

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const output = join(root, ".test-output");
mkdirSync(output, { recursive: true });
const script = readFileSync(join(root, "dist", "webview.js"), "utf8");
const css = readFileSync(join(root, "dist", "canvas.css"), "utf8");

const SHEET = `diagram d: flow {
  title "Checkout"
  layout manual
  api["API"]
  db[("DB")]
  cache["Cache"]
  api -> db: "save" as save
  placement {
    place api at (126, 112)
    place db at (420, 112)
    place cache at (420, 266)
  }
}
`;

/** A square drawn behind a database, which stacks on it without being inside it. */
const STACKED_SQUARE = `diagram d: flow {
  layout manual
  client["Client"]
  node3[""]
  db[("Database")]
  style node3 { shape square; fill "#DBBDBD" }
  client -> db as read
  placement {
    place client at (126, 112)
    place node3 at (480, 160)
    size node3 (238, 196)
    place db at (480, 160)
  }
}
`;

/** Three nodes placed apart, for the rotation handle and the turned elements. */
const TURNABLE = `diagram d: flow {
  layout manual
  api["API"]
  db[("DB")]
  cache["Cache"]
  api -> db: "save" as save
  placement {
    place api at (200, 140)
    place db at (520, 140)
    place cache at (200, 360)
  }
}
`;

const FREE = `diagram s: free {
  title "Slide"
  layers main, front
  text heading "Checkout"
  group g "Backend" {
    box api "API"
    box db "DB"
  }
  box client "Client"
  client -> api as call
  placement {
    place heading at (300, 40)
    place g at (420, 220)
    size g (420, 196)
    place api at (98, 56)
    place db at (294, 56)
    place client at (98, 224)
  }
}
`;

/** Two boxes in a row and one far below, with room for lines between them (y 168 to 440). */
const LINES = `diagram s: free {
  title "Lines"
  layout manual
  box a "A"
  box b "B"
  box far "Far"
  placement {
    place a at (126, 112)
    place b at (546, 112)
    place far at (700, 476)
  }
}
`;

/** A placed group `g` whose interior starts at (116, 120), holding `a`, and `c` beside it. */
const NESTED = `diagram s: free {
  title "Nested"
  layout manual
  group g "Backend" {
    box a "A"
  }
  box c "C"
  placement {
    place g at (300, 200)
    size g (400, 240)
    place a at (84, 60)
    place c at (700, 200)
  }
}
`;

/** A flow group `g` without place, drawn around its only child `api`: (304, 32), 192 × 112. */
const DERIVED = `diagram d: flow {
  layout manual
  web["Web"]
  group g "Backend" {
    api["API"]
  }
  web -> api
  placement {
    place web at (100, 100)
    place api at (400, 100)
  }
}
`;

/** A placed group `g` without size, drawn around `a` and `b` at (114, 143), 372 × 114. */
const UNSIZED = `diagram s: free {
  layout manual
  group g "G" {
    box a "A"
    box b "B"
  }
  box c "C"
  placement {
    place g at (300, 200)
    place a at (80, 30)
    place b at (260, 30)
    place c at (700, 400)
  }
}
`;

/** A group `g` on the layer `back`, holding `a` on the default layer: its interior at (116, 120). */
const BACK_GROUP = `diagram s: free {
  layout manual
  layers back, main
  group g "G" {
    layer back
    box a "A"
  }
  placement {
    place g at (300, 200)
    size g (400, 240)
    place a at (80, 30)
  }
}
`;

/** An empty hexagon `box1` and a two-line agent node, for the editor in place. */
const EMPTY = `diagram s: free {
  layout manual
  box box1 ""
  box planner "Planner\\nagent"
  box1 -> planner
  style box1 { shape hexagon }
  style planner { shape agent }
  placement {
    place box1 at (200, 160)
    place planner at (520, 160)
  }
}
`;

/** `client -> api` in a row, api 294 units right of client: the live preview's connector. */
const LIVE = `diagram d: flow {
  layout manual
  client["Client"]
  api["API"]
  client -> api as call
  placement {
    place client at (126, 112)
    place api at (420, 112)
  }
}
`;

/** `api` with a Tabler icon beside its label, `db` with one and a fill, `cache` without one. */
const ICONED = `diagram d: flow {
  title "Checkout"
  layout manual
  api["API"]
  db[("DB")]
  cache["Cache"]
  api -> db: "save" as save
  style api { icon "tabler:server" }
  style db { icon "tabler:database"; fill "#eef" }
  placement {
    place api at (126, 112)
    place db at (420, 112)
    place cache at (420, 266)
  }
}
`;

/** `fn` drawn as its AWS Lambda icon, its label under the square, and `api` to connect to it. */
const ICON_SHAPE = `diagram d: flow {
  layout manual
  api["API"]
  fn["Function"]
  style fn { icon "aws:lambda"; shape icon }
  placement {
    place api at (126, 112)
    place fn at (420, 112)
  }
}
`;

/** `fn` drawn as an outline icon (Tabler's server, strokes only), its label under the square. */
const OUTLINE_ICON = `diagram d: flow {
  layout manual
  api["API"]
  fn["Función"]
  style fn { icon "tabler:server"; shape icon }
  placement {
    place api at (126, 112)
    place fn at (420, 112)
  }
}
`;

/** A free composition with an outline icon object `srv` beside a box. */
const OUTLINE_OBJECT = `diagram s: free {
  layout manual
  icon srv "tabler:server"
  box api "API"
  placement {
    place srv at (420, 150)
    place api at (140, 150)
  }
}
`;

/** `api` with an icon beside its label, `db` with a centred icon whose label sits under it. */
const CENTRED_ICON = `diagram d: flow {
  layout manual
  api["API"]
  db[("DB")]
  style api { icon "tabler:server" }
  style db { icon "tabler:database"; iconPosition center }
  placement {
    place api at (126, 112)
    place db at (420, 112)
  }
}
`;

/** The acceptance sheet of icons in free compositions: icon shapes with labels on every side. */
const ICON_SHEET = readFileSync(
  join(here, "..", "..", "..", "..", "corpus", "acceptance", "free", "icons.meltemi"),
  "utf8",
);

/** An icon of one's own, and one the sanitiser refuses, for the Add icon dialog. */
const PIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z"/></svg>';
const SCRIPT_SVG =
  '<svg viewBox="0 0 24 24"><script>alert(1)</script><path d="M0 0h24v24H0z"/></svg>';

/** A Mermaid flowchart as the importer writes it: plain relations stay anonymous. */
const IMPORTED_FLOWCHART = readFileSync(
  join(here, "..", "..", "..", "..", "corpus", "import", "mermaid", "flowchart-checkout.meltemi"),
  "utf8",
);

/** Two diagrams, `overview` first, which the canvas shows. */
const TWO = `${SHEET.replace("diagram d: flow", "diagram overview: flow")}\n${SHEET}`;

/** Three boxes stacked at one centre, outer first, a diamond beside them and a box below it. */
const STACK = `diagram s: free {
  layout manual
  box outer "Outer"
  box middle "Middle"
  box inner "Inner"
  box kite "Kite"
  box j "J"
  style kite { shape diamond }
  placement {
    place outer at (300, 220)
    size outer (400, 280)
    place middle at (300, 220)
    size middle (240, 160)
    place inner at (300, 220)
    size inner (120, 64)
    place kite at (700, 220)
    place j at (700, 420)
  }
}
`;

/** A slide wider than the stage, with a box at its right edge, where the properties stand. */
const WIDE_SLIDE = `diagram slide: free {
  canvas (1280, 720)
  layout manual
  box browser "Browser"
  box db "Database"
  placement {
    place browser at (220, 400)
    place db at (1150, 400)
  }
}
`;

const SEQUENCE = `diagram payment: sequence {
  actor customer "Customer"
  participant api "API"
  participant bank "Bank"

  customer -> api: "Pay" as pay
  activate api
  api -> bank: "Authorize" as authorize

  alt result "Approved" {
    bank --> api: "OK" as approved
  } else "Declined" {
    bank --> api: "Declined" as declined
  }

  deactivate api

  scenario happy "Approved" {
    choose result "Approved"
  }
}
`;

/** A note with an outline, one without, and a text, each attached to a box. */
const FREE_NOTES = `diagram s: free {
  box api "API"
  note bare "Bare" on api
  note framed "Framed" on api
  text label "Label"
  style framed { stroke "#7a5af8" }
  placement {
    place api at (126, 112)
    place bare at (400, 112)
    place framed at (400, 220)
    place label at (126, 300)
  }
}
`;

const C4 = `model commerce {
  person customer "Customer"
  system shop "Shop" {
    container web "Web" { technology "React" }
    container api "API" { technology "Kotlin" }
    datastore db "Orders" { technology "PostgreSQL" }
  }
  system bank "Bank" { external }
  customer -> shop.web: "Buys" as visit
  shop.web -> shop.api: "HTTPS" as request
  shop.api -> shop.db: "SQL" as persist
  shop.api -> bank: "Pays" as pay
}

diagram containers: c4 using commerce {
  level container
  scope shop
  include customer, shop.web, shop.api, shop.db
}
`;

const STORY = `diagram checkout: flow {
  layout manual
  client["Client"]
  api["API"]
  db[("DB")]
  client -> api: "HTTPS" as request
  api -> db: "SQL" as save
  placement {
    place client at (126, 112)
    place api at (378, 112)
    place db at (630, 112)
  }
}

story purchase for checkout {
  title "A purchase"

  scene overview {
    reveal client, api, db over 800ms
    hold 1s
  }

  scene processing {
    trace request over 1200ms
    parallel {
      trace save over 1200ms
      highlight db over 1200ms
    }
    hold 2s
  }
}
`;

const DARK = `:root {
  --vscode-editor-background: #1e1e1e; --vscode-foreground: #cccccc; --vscode-editor-foreground: #d4d4d4;
  --vscode-sideBar-background: #252526; --vscode-panel-border: #3c3c3c; --vscode-focusBorder: #007fd4;
  --vscode-input-background: #3c3c3c; --vscode-input-foreground: #cccccc; --vscode-badge-background: #4d4d4d;
  --vscode-badge-foreground: #ffffff; --vscode-editorWidget-background: #252526; --vscode-menu-background: #252526;
  --vscode-dropdown-background: #3c3c3c; --vscode-dropdown-foreground: #f0f0f0; --vscode-descriptionForeground: #9d9d9d;
}`;

/** The `erd` type of the plugins corpus project, for the declared-type test. */
const ERD = readDiagramType(
  JSON.parse(
    readFileSync(
      join(
        here,
        "..",
        "..",
        "..",
        "..",
        "corpus",
        "projects",
        "valid",
        "plugins",
        "plugins",
        "erd",
        "meltemi-plugin.json",
      ),
      "utf8",
    ),
  ).diagramTypes[0],
  { name: "erd", version: "1.0.0" },
).definition!;

class Harness {
  text: string;
  revision = 1;
  types: DiagramTypeDefinition[] = [];

  /** The icons: the built-in packs, and the packs of icons the canvas added to the project. */
  icons = ICONS;
  /** The icons added, by pack and name, as the host would write `assets/icons/<pack>/<name>.svg`. */
  readonly added = new Map<string, Map<string, string>>();

  /** The analysis of a text, with the declared types of the test. */
  analyze(text: string, revision: number) {
    return analyzeDocument({
      text,
      revision,
      compilation: compile(text, { types: this.types }),
      layout: { icons: this.icons },
      icons: this.icons,
      libraries: LIBRARIES,
    });
  }
  /** A scenario `project` swaps it for a session of a document in a project. */
  session = new CanvasSession({ grid: 14 });
  readonly received: unknown[] = [];
  /** When each of `received` arrived, in milliseconds, for the ones that are about timing. */
  readonly receivedAt: number[] = [];
  clipboard = "";
  /** The settings the host sends on `ready`; `readOnly` is absent, as VS Code never sends it. */
  config: CanvasSettings = {
    grid: 14,
    showGrid: true,
    snap: true,
    guides: true,
    minimap: true,
    inspector: true,
  };
  private busy = 0;

  constructor(
    readonly page: Page,
    text: string,
  ) {
    this.text = text;
  }

  private opened: { theme: string; lang?: string } = { theme: "" };

  /** Opens the webview; `lang` is the interface language the extension writes in the page. */
  async start(theme = "", lang?: string): Promise<void> {
    this.opened = { theme, ...(lang ? { lang } : {}) };
    await this.page.exposeFunction("__toHost", (message: unknown) => this.fromCanvas(message));
    await this.page.setContent(this.html(undefined));
    await this.settled();
  }

  /**
   * Opens the webview again over the state it kept, as VS Code does when a panel comes back, and
   * with a new session, as after a restart of the extension.
   */
  async reload(): Promise<void> {
    const state = await this.page.evaluate(() => (window as { __state?: unknown }).__state);
    (this as { session: CanvasSession }).session = new CanvasSession({ grid: 14 });
    await this.page.setContent(this.html(state));
    await this.settled();
  }

  private html(state: unknown): string {
    const { theme, lang } = this.opened;
    const kept = state === undefined ? "" : `window.__state = ${JSON.stringify(state)};`;
    return `<!DOCTYPE html><html${lang ? ` lang="${lang}"` : ""}><head><style>${css}${theme}</style></head><body>
<div id="app"></div>
<script>${kept}window.acquireVsCodeApi = () => ({ postMessage: (m) => window.__toHost(m), getState: () => window.__state, setState: (s) => { window.__state = s; } });</script>
<script>${script}</script></body></html>`;
  }

  private async post(messages: readonly HostMessage[]): Promise<void> {
    for (const message of messages) {
      await this.page.evaluate(
        (m) => window.postMessage(m, "*"),
        message as unknown as Record<string, unknown>,
      );
    }
  }

  /**
   * Sends a whole `settings` message, as the host does when its settings change: the keys of
   * `next` over the ones sent so far. `replace` sends exactly `next`, as a host that does not
   * know `readOnly` would.
   */
  async settings(next: Partial<CanvasSettings>, replace?: CanvasSettings): Promise<void> {
    this.config = replace ?? { ...this.config, ...next };
    await this.post([{ type: "settings", settings: this.config }]);
    await this.settled();
  }

  /**
   * Sends a `presence` message, as a host does when the other people of a shared project (or what
   * they have selected) change; each one replaces the last.
   */
  async presence(people: readonly PresencePerson[]): Promise<void> {
    await this.post([{ type: "presence", people }]);
    await this.settled();
  }

  /** Posts anything as a host message, including what a host should never send. */
  async postRaw(message: unknown): Promise<void> {
    await this.page.evaluate((m) => window.postMessage(m, "*"), message as Record<string, unknown>);
    await this.settled();
  }

  /**
   * The messages the canvas sent that would change the document, or open what does. A preview
   * only asks for a drawing: it writes nothing.
   */
  writes(): unknown[] {
    return this.received.filter((m) => {
      const message = m as { type: string; open?: boolean };
      return (
        (["action", "newTheme", "themeToken"].includes(message.type) && !isPreview(message)) ||
        (message.type === "editTheme" && message.open === true)
      );
    });
  }

  /** The preview actions the canvas sent while it dragged or resized. */
  previews(): { token: number; action: { kind: string } }[] {
    return this.received
      .filter(isPreview)
      .map((m) => (m as { action: { token: number; action: { kind: string } } }).action);
  }

  /** Answers every preview with no drawing, as the session does for a move it would refuse. */
  refusePreviews = false;

  /** Replaces the text, as if the user typed in the text editor. */
  async type(text: string): Promise<void> {
    this.text = text;
    this.revision++;
    await this.post(this.session.update(this.analyze(text, this.revision)));
    await this.settled();
  }

  private async fromCanvas(message: unknown): Promise<void> {
    this.busy++;
    try {
      this.received.push(message);
      this.receivedAt.push(Date.now());
      if ((message as { type: string }).type === "ready") {
        await this.post([{ type: "settings", settings: this.config }]);
        await this.post(this.session.update(this.analyze(this.text, this.revision)));
      }
      if (this.refusePreviews && isPreview(message)) {
        const token = (message as { action: { token: number } }).action.token;
        await this.post([{ type: "preview", token, svg: null }]);
        return;
      }
      await this.handle(this.session.receive(message));
    } finally {
      this.busy--;
    }
  }

  private async handle(result: ReturnType<CanvasSession["receive"]>): Promise<void> {
    await this.post(result.messages);
    if (result.clipboard !== undefined) this.clipboard = result.clipboard;
    if (result.plan) {
      this.text = applyTextEdits(this.text, result.plan.edits);
      this.revision++;
      await this.post(this.session.update(this.analyze(this.text, this.revision)));
    }
    if (result.project?.kind === "files" && result.project.assets) {
      // The host writes the icons and the project reads them: the packs grow, the statements
      // that give the icon are applied, and the canvas gets the drawing that knows them.
      for (const file of result.project.assets.create) {
        const match = /^assets\/icons\/([^/]+)\/(.+)\.svg$/.exec(file.path);
        if (!match) continue;
        const files = this.added.get(match[1]!) ?? new Map<string, string>();
        files.set(match[2]!, file.text);
        this.added.set(match[1]!, files);
      }
      this.icons = new IconRegistry([
        ...ICONS.list(),
        ...[...this.added].map(
          ([prefix, files]) =>
            new SvgFolderPack(prefix, files, {
              title: prefix,
              version: null,
              source: `assets/icons/${prefix}`,
              license: "MIT",
              author: null,
              url: null,
              redistribute: true,
            }),
        ),
      ]);
      for (const step of result.project.steps) {
        if (!("operation" in step) || step.file !== null) continue;
        const planned = planEdit(compile(this.text, { types: this.types }), step.operation);
        if (!planned.ok) throw new Error(planned.rejection.reason);
        this.text = applyTextEdits(this.text, planned.plan.edits);
        this.revision++;
      }
      await this.post(this.session.update(this.analyze(this.text, this.revision)));
    }
    if (result.readClipboard)
      await this.handle(this.session.paste(this.clipboard, result.readClipboard.at));
    // The extension asks the user for an image file; the harness picks for them.
    if (result.pick) {
      await this.handle(
        this.session.createObject(result.pick.kind, "logo.png", result.pick.at, result.pick.parent),
      );
    }
  }

  /** Waits until the canvas and the harness have nothing left to say to each other. */
  async settled(): Promise<void> {
    for (let i = 0; i < 50; i++) {
      await this.page.waitForTimeout(30);
      if (this.busy === 0) {
        await this.page.waitForTimeout(30);
        if (this.busy === 0) return;
      }
    }
    throw new Error("The canvas did not settle.");
  }

  /** Screen centre of an element's drawn box. */
  async centre(id: string): Promise<{ x: number; y: number }> {
    const box = await this.page
      .locator(`.content g[data-id="${id}"][data-role="element"]`)
      .first()
      .boundingBox();
    assert.ok(box, `no box for ${id}`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  place(id: string): { x: number; y: number } {
    const match = new RegExp(`place ${id} at \\((-?\\d+), (-?\\d+)\\)`).exec(this.text);
    assert.ok(match, `no place for ${id} in\n${this.text}`);
    return { x: Number(match[1]), y: Number(match[2]) };
  }

  async focusStage(): Promise<void> {
    await this.page.locator(".stage").focus();
  }
}

/**
 * Presses on an element's centre, drags it by `dx`, `dy` in steps and releases; `during` runs with
 * the button still down.
 */
async function dragBy(
  h: Harness,
  id: string,
  dx: number,
  dy: number,
  during?: () => Promise<void>,
): Promise<void> {
  const start = await h.centre(id);
  const page = h.page;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx / 2, start.y + dy / 2, { steps: 4 });
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 4 });
  await during?.();
  await page.mouse.up();
  await h.settled();
}

// ------------------------------------------------------------------ presence helpers

/** The people of the presence tests: a light colour, a mid one and a dark one. */
const BEN: PresencePerson = { name: "Ben", colour: "#1c7ed6", selection: ["api"] };
const ANA: PresencePerson = { name: "Ana", colour: "#e03131", selection: ["db"] };
const LI: PresencePerson = { name: "Li", colour: "#364fc7", selection: ["cache"] };

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the presence layer holds right now: each outline and each tag, with its drawn box. */
async function drawn(h: Harness): Promise<{
  outlines: { tag: string; target: string | null; stroke: string | null; box: Rect }[];
  tags: { target: string | null; text: string; background: string; color: string; box: Rect }[];
}> {
  // No named functions inside: the test runner's bundler would add a helper the page lacks.
  return h.page.evaluate(() => ({
    outlines: [...document.querySelectorAll(".presence .presence-outline")].map((e) => {
      const r = e.getBoundingClientRect();
      return {
        tag: e.tagName.toLowerCase(),
        target: e.getAttribute("data-target"),
        stroke: e.getAttribute("stroke"),
        box: { x: r.x, y: r.y, width: r.width, height: r.height },
      };
    }),
    tags: [...document.querySelectorAll(".presence .presence-tag")].map((e) => {
      const r = e.getBoundingClientRect();
      const style = getComputedStyle(e);
      return {
        target: e.getAttribute("data-target"),
        text: e.textContent ?? "",
        background: style.backgroundColor,
        color: style.color,
        box: { x: r.x, y: r.y, width: r.width, height: r.height },
      };
    }),
  }));
}

/** The drawn box of an element of the scene, in page pixels. */
async function boxOf(h: Harness, id: string): Promise<Rect> {
  const found = await h.page
    .locator(`.content g[data-id="${id}"][data-role="element"]`)
    .first()
    .boundingBox();
  assert.ok(found, `no box for ${id}`);
  return found;
}

/** The open editor in place: its box in page pixels and the styles it types with. */
async function editorOf(h: Harness): Promise<{
  box: Rect;
  fontSize: number;
  font: string;
  background: string;
  border: string;
  textAlign: string;
}> {
  return h.page.locator("textarea.inline").evaluate((area: HTMLTextAreaElement) => {
    const style = getComputedStyle(area);
    const r = area.getBoundingClientRect();
    return {
      box: { x: r.x, y: r.y, width: r.width, height: r.height },
      fontSize: parseFloat(style.fontSize),
      font: style.fontFamily,
      background: style.backgroundColor,
      border: style.borderTopWidth,
      textAlign: style.textAlign,
    };
  });
}

/**
 * The centre of what an element draws of its own, in page pixels: a note's group holds its leader
 * too, which reaches the element it is attached to, so the group's box is no place to press.
 */
async function bodyCentre(h: Harness, id: string): Promise<{ x: number; y: number }> {
  const box = await h.page
    .locator(`.content g[data-id="${id}"][data-role="element"]`)
    .first()
    .evaluate((group) => {
      const own = [...group.children].filter((child) => !child.classList.contains("leader"));
      const rects = own.map((child) => child.getBoundingClientRect());
      const left = Math.min(...rects.map((r) => r.left));
      const top = Math.min(...rects.map((r) => r.top));
      const right = Math.max(...rects.map((r) => r.right));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      return { x: (left + right) / 2, y: (top + bottom) / 2 };
    });
  return box;
}

/**
 * What the presence layer's trails canvas holds: how many pixels are drawn, and the colour of the
 * most opaque one.
 */
async function trailPixels(h: Harness): Promise<{
  count: number;
  colour: [number, number, number] | null;
}> {
  return h.page.locator(".presence-trails").evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d")!;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    let best = 0;
    let colour: [number, number, number] | null = null;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3]!;
      if (alpha > 0) count++;
      if (alpha > best) {
        best = alpha;
        colour = [data[i]!, data[i + 1]!, data[i + 2]!];
      }
    }
    return { count, colour };
  });
}

/** The zoom of the canvas: the scale of its drawing. */
async function zoomOf(h: Harness): Promise<number> {
  return h.page
    .locator(".content")
    .evaluate((content: HTMLElement) => new DOMMatrix(getComputedStyle(content).transform).a);
}

/** The lines of text an element's drawing shows, in order. */
async function drawnLines(h: Harness, id: string): Promise<string[]> {
  return h.page
    .locator(`.content g[data-id="${id}"][data-role="element"] > text`)
    .evaluateAll((texts) =>
      texts
        .filter((t) => getComputedStyle(t).visibility !== "hidden")
        .map((t) => t.textContent ?? ""),
    );
}

/** The text an element's drawing shows, its lines joined. */
async function drawnText(h: Harness, id: string): Promise<string> {
  return (await drawnLines(h, id)).join("\n");
}

/** The drawn box of a relation's connector, in page pixels. */
async function lineOf(h: Harness, key: string): Promise<Rect> {
  const found = await h.page
    .locator(`.content g[data-id="${key}"][data-role="relation"]`)
    .first()
    .boundingBox();
  assert.ok(found, `no connector for ${key}`);
  return found;
}

/**
 * Whether a popover or a menu is closed: it is hidden at once and fades out over 120 ms, so this
 * waits for the fade to end (a second at most).
 */
async function closed(locator: Locator): Promise<boolean> {
  try {
    await locator.waitFor({ state: "hidden", timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * The centre of a locator's box, in page pixels. A list that draws again (the icon results while
 * the search settles) can replace the element between finding and measuring it, so it is measured
 * again until it stays.
 */
async function middleOf(locator: Locator): Promise<{ x: number; y: number }> {
  for (let tries = 0; tries < 40; tries++) {
    const box = await locator.boundingBox().catch(() => null);
    if (box) return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await locator.page().waitForTimeout(50);
  }
  assert.fail("no box");
}

/** The icon picker, its search field and one of its results by reference. */
function iconPicker(page: Page, name = "Icons") {
  const picker = page.getByRole("dialog", { name, exact: true });
  return {
    picker,
    search: picker.getByRole("combobox"),
    option: (reference: string) => picker.locator(`[role="option"][data-reference="${reference}"]`),
  };
}

/** Whether two boxes agree to within `tolerance` pixels in position and size. */
function near(actual: Rect, expected: Rect, tolerance: number, label: string): void {
  for (const key of ["x", "y", "width", "height"] as const) {
    assert.ok(
      Math.abs(actual[key] - expected[key]) <= tolerance,
      `${label}: ${key} is ${actual[key]}, expected ${expected[key]} ±${tolerance}`,
    );
  }
}

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Whether a message of the canvas is a preview, which asks for a drawing and writes nothing. */
function isPreview(message: unknown): boolean {
  const m = message as { type?: string; action?: { kind?: string } };
  return m.type === "action" && m.action?.kind === "preview";
}

/** How many actions the canvas has sent: each becomes one edit, one undo step. */
const actions = (h: Harness): number =>
  h.received.filter((m) => (m as { type: string }).type === "action" && !isPreview(m)).length;

/**
 * The page position of a diagram point, from an element drawn centred at `centre` with `width`
 * in diagram units (its drawing no wider than its box).
 */
async function pageAt(
  h: Harness,
  id: string,
  centre: { x: number; y: number },
  width: number,
  point: { x: number; y: number },
): Promise<{ x: number; y: number }> {
  const box = await boxOf(h, id);
  const zoom = box.width / width;
  return {
    x: box.x + box.width / 2 + (point.x - centre.x) * zoom,
    y: box.y + box.height / 2 + (point.y - centre.y) * zoom,
  };
}

/** Presses at `from`, drags to `to` in steps and releases; `during` runs with the button down. */
async function dragTo(
  h: Harness,
  from: { x: number; y: number },
  to: { x: number; y: number },
  during?: () => Promise<void>,
): Promise<void> {
  const page = h.page;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await during?.();
  await page.mouse.up();
  await h.settled();
}

/** Where a point goes turned `degrees` clockwise about `centre`, on the screen. */
function turnedFrom(
  point: { x: number; y: number },
  centre: { x: number; y: number },
  degrees: number,
): { x: number; y: number } {
  const a = (degrees * Math.PI) / 180;
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;
  return {
    x: centre.x + dx * Math.cos(a) - dy * Math.sin(a),
    y: centre.y + dx * Math.sin(a) + dy * Math.cos(a),
  };
}

/** The rotation handle of the one element selected, at its centre on the screen. */
async function rotationHandle(h: Harness): Promise<{ x: number; y: number }> {
  const handle = await h.page.locator(".overlay .handle.rotate").boundingBox();
  assert.ok(handle, "no rotation handle");
  return { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
}

/**
 * The angle the drawing of `id` and its selection outline are turned by, and how far apart their
 * centres are on the screen: one number and nothing apart when they agree.
 */
async function turnAgreement(
  h: Harness,
  id: string,
): Promise<{ drawn: number | null; outline: number | null; apart: number }> {
  // No named functions inside: the page has no `__name` helper for them.
  const seen = await h.page.evaluate((id) => {
    const g = document.querySelector(`.content g[data-id="${id}"][data-role="element"]`)!;
    const outline = document.querySelector(".overlay rect.outline")!;
    const a = g.getBoundingClientRect();
    const b = outline.getBoundingClientRect();
    return {
      drawn: g.getAttribute("transform") ?? "",
      outline: outline.getAttribute("transform") ?? "",
      apart: Math.hypot(
        a.x + a.width / 2 - b.x - b.width / 2,
        a.y + a.height / 2 - b.y - b.height / 2,
      ),
    };
  }, id);
  const angle = (transform: string) => {
    const m = /^rotate\(([-\d.]+)/.exec(transform);
    return m ? Number(m[1]) : null;
  };
  return { drawn: angle(seen.drawn), outline: angle(seen.outline), apart: seen.apart };
}

const tests: {
  name: string;
  run: (h: Harness) => Promise<void>;
  text?: string;
  theme?: string;
  types?: DiagramTypeDefinition[];
  /** The interface language of the page and of the extension host; English when absent. */
  lang?: string;
  /** Starts the canvas read-only: the host's first `settings` message carries `readOnly: true`. */
  readOnly?: boolean;
  /** The document belongs to a project: the canvas may add icons to it. */
  project?: boolean;
}[] = [
  {
    name: "renders the diagram, the toolbar, the inspector and the minimap",
    async run(h) {
      const page = h.page;
      assert.equal(await page.locator(".content svg").count(), 1);
      assert.equal(await page.locator('.content g[data-role="element"]').count(), 3);
      assert.match((await page.locator(".inspector h2").textContent()) ?? "", /Diagram d/);
      assert.equal(await page.locator(".minimap").isVisible(), true);
      for (const button of await page.locator(".toolbar button").all()) {
        assert.ok(await button.getAttribute("aria-label"), "every toolbar button has a label");
      }
      assert.equal(await page.locator(".stage").getAttribute("tabindex"), "0");
      await page.screenshot({ path: join(output, "canvas-light.png") });
    },
  },
  {
    name: "selects with Tab and nudges one grid step with Shift and an arrow",
    async run(h) {
      await h.focusStage();
      await h.page.keyboard.press("Tab");
      await h.page.keyboard.press("Tab");
      await h.settled();
      assert.deepEqual(h.session.selected, ["db"]);
      assert.match((await h.page.locator(".status").textContent()) ?? "", /db/);
      await h.page.keyboard.press("Shift+ArrowRight");
      await h.settled();
      assert.deepEqual(h.place("db"), { x: 434, y: 112 });
    },
  },
  {
    name: "drags a box with grid snapping and one undo-able edit",
    async run(h) {
      const start = await h.centre("api");
      const page = h.page;
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 20, start.y + 4, { steps: 4 });
      await page.mouse.move(start.x + 41, start.y + 6, { steps: 4 });
      await page.mouse.up();
      await h.settled();
      const place = h.place("api");
      assert.equal(place.x % 14, 0, `centre on the grid: ${place.x}`);
      assert.ok(place.x > 126, "moved right");
    },
  },
  {
    name: "zooms with Ctrl and the wheel, and fits with Shift+1",
    async run(h) {
      const page = h.page;
      const zoom = () =>
        page
          .locator('.toolbar select[aria-label="Zoom"]')
          .evaluate((s: HTMLSelectElement) => s.selectedOptions[0]?.textContent ?? "");
      const before = await zoom();
      await page.mouse.move(600, 400);
      await page.keyboard.down("Control");
      await page.mouse.wheel(0, -400);
      await page.keyboard.up("Control");
      await page.waitForTimeout(50);
      assert.notEqual(await zoom(), before);
      await h.focusStage();
      await page.keyboard.press("Shift+Digit1");
      await page.waitForTimeout(50);
      assert.equal(await zoom(), before);
    },
  },
  {
    name: "creates an empty node from the palette and adds its label with a double click",
    async run(h) {
      const page = h.page;
      await page.locator('.toolbar button[data-tool="node"]').click();
      const db = await h.centre("db");
      await page.mouse.click(db.x + 300, db.y + 200);
      await h.settled();
      assert.match(h.text, /node1\[""\]/);
      assert.deepEqual(h.session.selected, ["node1"]);
      // An empty shape: no editor until a double click.
      assert.equal(await page.locator(".inline").count(), 0);
      const node = await h.centre("node1");
      await page.mouse.dblclick(node.x, node.y);
      const inline = page.locator("textarea.inline");
      assert.equal(await inline.isVisible(), true);
      await inline.fill("Queue");
      await inline.press("Enter");
      await h.settled();
      assert.match(h.text, /node1\["Queue"\]/);
      assert.equal(await page.locator(".inline").count(), 0);
    },
  },
  {
    name: "creates an empty box with B, selected and with no editor open",
    text: FREE,
    async run(h) {
      const page = h.page;
      await h.focusStage();
      await page.keyboard.press("b");
      await h.settled();
      assert.match(h.text, /\n {2}box box1 ""\n/);
      assert.match(h.text, /place box1 at \(/);
      assert.deepEqual(h.session.selected, ["box1"]);
      assert.equal(await page.locator(".inline").count(), 0);
      assert.equal(await page.locator(".status").textContent(), "box box1 selected.");
      // T still writes a text with its default text, and opens its editor on it.
      await h.focusStage();
      await page.keyboard.press("t");
      await h.settled();
      assert.match(h.text, /\n {2}text text1 "Text"\n/);
      assert.equal(await page.locator("textarea.inline").inputValue(), "Text");
    },
  },
  {
    name: "adds text to an empty hexagon in place, in the drawing's font size inside the shape",
    text: EMPTY,
    async run(h) {
      const page = h.page;
      const shape = await boxOf(h, "box1");
      const hexagon = await h.centre("box1");
      await page.mouse.dblclick(hexagon.x, hexagon.y);
      const inline = page.locator("textarea.inline");
      assert.equal(await inline.isVisible(), true);
      // A text area without the browser's autocomplete, correction or spelling.
      for (const [name, value] of [
        ["autocomplete", "off"],
        ["autocorrect", "off"],
        ["autocapitalize", "off"],
        ["spellcheck", "false"],
        ["aria-multiline", "true"],
      ]) {
        assert.equal(await inline.getAttribute(name!), value, name);
      }
      assert.equal(await inline.inputValue(), "");
      await page.keyboard.type("Payments");
      const editor = await editorOf(h);
      const zoom = await zoomOf(h);
      assert.ok(Math.abs(editor.fontSize - 13 * zoom) < 0.05, `font ${editor.fontSize} at ${zoom}`);
      assert.equal(editor.background, "rgba(0, 0, 0, 0)");
      assert.equal(editor.border, "0px");
      assert.equal(editor.textAlign, "center");
      // Inside the hexagon's box, on its middle.
      assert.ok(editor.box.x > shape.x && editor.box.x + editor.box.width < shape.x + shape.width);
      assert.ok(
        editor.box.y > shape.y && editor.box.y + editor.box.height < shape.y + shape.height,
      );
      assert.ok(Math.abs(editor.box.y + editor.box.height / 2 - hexagon.y) < 1.5);
      assert.ok(Math.abs(editor.box.x + editor.box.width / 2 - hexagon.x) < 1.5);
      await page.screenshot({ path: join(output, "canvas-inline-hexagon.png") });
      await page.keyboard.press("Enter");
      await h.settled();
      assert.match(h.text, /\n {2}box box1 "Payments"\n/);
      assert.equal(await page.locator(".inline").count(), 0);
      assert.equal(await drawnText(h, "box1"), "Payments");
    },
  },
  {
    name: "breaks a label into two lines with Shift+Enter, and the drawing shows both",
    async run(h) {
      const page = h.page;
      await h.focusStage();
      await page.keyboard.press("n");
      await h.settled();
      assert.match(h.text, /\n {2}node1\[""\]\n/);
      assert.equal(await page.locator(".inline").count(), 0);
      // Enter adds the text of the selected empty shape.
      await page.keyboard.press("Enter");
      const inline = page.locator("textarea.inline");
      assert.equal(await inline.isVisible(), true);
      await page.keyboard.type("Planner");
      const one = await editorOf(h);
      await page.keyboard.press("Shift+Enter");
      await page.keyboard.type("agent");
      const two = await editorOf(h);
      assert.equal(await inline.inputValue(), "Planner\nagent");
      // The editor grew by one line, 16 units at the zoom, and stays centred where it was.
      const zoom = await zoomOf(h);
      assert.ok(Math.abs(two.box.height - one.box.height - 16 * zoom) < 1, "one line taller");
      assert.ok(
        Math.abs(two.box.y + two.box.height / 2 - (one.box.y + one.box.height / 2)) < 1,
        "centred",
      );
      await page.keyboard.press("Enter");
      await h.settled();
      assert.match(h.text, /\n {2}node1\["Planner\\nagent"\]\n/);
      assert.deepEqual(await drawnLines(h, "node1"), ["Planner", "agent"]);
    },
  },
  {
    name: "cancels with Escape and draws the label again, hidden while the editor was open",
    async run(h) {
      const page = h.page;
      const api = await h.centre("api");
      await page.mouse.dblclick(api.x, api.y);
      assert.equal(await page.locator("textarea.inline").inputValue(), "API");
      const label = page.locator('.content g[data-id="api"][data-role="element"] text').first();
      assert.equal(await label.evaluate((t) => getComputedStyle(t).visibility), "hidden");
      // The editor lies where the drawn label was, in its font size.
      const editor = await editorOf(h);
      assert.ok(Math.abs(editor.box.y + editor.box.height / 2 - api.y) < 1.5);
      await page.keyboard.type("x");
      await page.keyboard.press("Escape");
      await h.settled();
      assert.equal(h.text, SHEET);
      assert.equal(await page.locator(".inline").count(), 0);
      assert.equal(await label.evaluate((t) => getComputedStyle(t).visibility), "visible");
      assert.deepEqual(h.writes(), []);
    },
  },
  {
    name: "edits a relation's label on its pill with a double click and commits with Tab",
    async run(h) {
      const page = h.page;
      const pill = await page
        .locator('.content g[data-id="save"][data-role="relation"] [data-role="label"]')
        .first()
        .boundingBox();
      assert.ok(pill);
      await page.mouse.dblclick(pill.x + pill.width / 2, pill.y + pill.height / 2);
      const inline = page.locator("textarea.inline");
      assert.equal(await inline.inputValue(), "save");
      assert.equal(await inline.getAttribute("aria-multiline"), "false");
      const editor = await editorOf(h);
      // On the pill, filled as the pill is, so the line does not cross the text.
      assert.ok(Math.abs(editor.box.x + editor.box.width / 2 - (pill.x + pill.width / 2)) < 1.5);
      assert.ok(Math.abs(editor.box.y + editor.box.height / 2 - (pill.y + pill.height / 2)) < 1.5);
      assert.notEqual(editor.background, "rgba(0, 0, 0, 0)");
      await inline.fill("store");
      await page.keyboard.press("Tab");
      await h.settled();
      assert.match(h.text, /api -> db: "store" as save/);
      assert.equal(await page.locator(".inline").count(), 0);
      // A click outside commits too.
      const db = await h.centre("db");
      await page.mouse.dblclick(db.x, db.y);
      await page.keyboard.press("Control+a");
      await page.keyboard.type("Store");
      await page.mouse.click(db.x, db.y + 160);
      await h.settled();
      assert.match(h.text, /db\[\("Store"\)\]/);
    },
  },
  {
    name: "renames an id with Shift+F2 in the same editor, on one line",
    async run(h) {
      const page = h.page;
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      await page.keyboard.press("Shift+F2");
      const inline = page.locator("textarea.inline");
      assert.equal(await inline.inputValue(), "api");
      assert.equal(await inline.getAttribute("aria-label"), "New id for api");
      assert.equal(await inline.getAttribute("aria-multiline"), "false");
      assert.match((await editorOf(h)).font, /monospace/);
      await page.keyboard.type("gateway");
      // Shift+Enter breaks no line in an id: it commits as Enter does.
      await page.keyboard.press("Shift+Enter");
      await h.settled();
      assert.match(h.text, /\n {2}gateway\["API"\]\n/);
      assert.match(h.text, /gateway -> db: "save" as save/);
    },
  },
  {
    name: "creates an agent from F and `agen`, empty, and shows its picture on the node button",
    async run(h) {
      const page = h.page;
      await h.focusStage();
      await page.keyboard.press("f");
      const grid = page.getByRole("dialog", { name: "Shapes" });
      assert.equal(await grid.getByRole("radio").count(), 24);
      await page.keyboard.type("agen");
      assert.deepEqual(
        await grid
          .getByRole("radio")
          .evaluateAll((chips) => chips.map((c) => c.getAttribute("aria-label"))),
        ["agent"],
      );
      await page.keyboard.press("Enter");
      await h.settled();
      assert.match(h.text, /\n {2}node1\[""\]\n {2}style node1 \{ shape agent \}\n/);
      assert.equal(await page.locator(".inline").count(), 0);
      assert.equal(
        await page.locator('.toolbar button[data-tool="node"]').getAttribute("data-shape"),
        "agent",
      );
      // A double click on its body adds the text there, below the head.
      const body = await boxOf(h, "node1");
      await page.mouse.dblclick(body.x + body.width / 2, body.y + body.height * 0.7);
      const editor = await editorOf(h);
      assert.ok(editor.box.y > body.y + body.height / 3, "in the body");
      await page.keyboard.type("Planner");
      await page.keyboard.press("Enter");
      await h.settled();
      assert.match(h.text, /\n {2}node1\["Planner"\]\n/);
    },
  },
  {
    name: "opens the editor on a new note, which keeps its default text",
    async run(h) {
      const page = h.page;
      await h.focusStage();
      await page.keyboard.press("o");
      await h.settled();
      assert.match(h.text, /note note1 "Note"/);
      assert.equal(await page.locator("textarea.inline").inputValue(), "Note");
      await page.keyboard.press("Escape");
      assert.equal(await page.locator(".inline").count(), 0);
    },
  },
  {
    name: "edits a sequence note on two lines in the same editor",
    text: SEQUENCE,
    async run(h) {
      const page = h.page;
      const arrow = await page
        .locator('.content g[data-id="pay"][data-role="relation"] polyline')
        .first()
        .boundingBox();
      assert.ok(arrow);
      await page.mouse.click(arrow.x + arrow.width / 2, arrow.y + arrow.height / 2);
      await h.settled();
      await page.keyboard.press("o");
      await h.settled();
      assert.match(h.text, /note note1 over customer, api "Note"/);
      assert.deepEqual(h.session.selected, ["note1"]);
      await h.focusStage();
      await page.keyboard.press("Enter");
      const inline = page.locator("textarea.inline");
      assert.equal(await inline.inputValue(), "Note");
      assert.equal(await inline.getAttribute("aria-multiline"), "true");
      await page.keyboard.type("First");
      await page.keyboard.press("Shift+Enter");
      await page.keyboard.type("second");
      await page.keyboard.press("Enter");
      await h.settled();
      assert.match(h.text, /note note1 over customer, api "First\\nsecond"/);
    },
  },
  {
    name: "offers a declared type's kinds in the palette and creates them",
    text: 'diagram schema: erd {\n  layout manual\n  entity orders "Orders" { owner "Sales" }\n  placement {\n    place orders at (140, 84)\n  }\n}\n',
    types: [ERD],
    async run(h) {
      const page = h.page;
      const tools = await page
        .locator(".toolbar button[data-declared]")
        .evaluateAll((buttons) => buttons.map((b) => b.getAttribute("data-tool")));
      assert.deepEqual(tools, ["entity", "view"]);
      await page.locator('.toolbar button[data-tool="view"]').click();
      const orders = await h.centre("orders");
      await page.mouse.click(orders.x + 280, orders.y + 140);
      await h.settled();
      assert.match(h.text, /view view1 "View"/);
    },
  },
  {
    name: "writes a property from the inspector",
    async run(h) {
      const api = await h.centre("api");
      await h.page.mouse.click(api.x, api.y);
      await h.settled();
      const label = h.page.locator("#mdg-field-label");
      await label.fill("Orders API");
      await label.press("Enter");
      await h.settled();
      assert.match(h.text, /api\["Orders API"\]/);
      await h.page.locator('[data-field="style.fill"] [data-token="accent"]').click();
      await h.settled();
      assert.match(h.text, /style api \{ fill accent \}/);
      await h.page.screenshot({ path: join(output, "canvas-selected.png") });
    },
  },
  {
    name: "pans from the minimap",
    async run(h) {
      const page = h.page;
      const transform = () =>
        page.locator(".content").evaluate((e: HTMLElement) => e.style.transform);
      const before = await transform();
      const map = await page.locator(".minimap").boundingBox();
      assert.ok(map);
      await page.mouse.click(map.x + 5, map.y + 5);
      assert.notEqual(await transform(), before);
    },
  },
  {
    name: "keeps the last render, dimmed, while the text has errors",
    async run(h) {
      await h.type(h.text.replace('api["API"]', 'api["API'));
      assert.equal(await h.page.locator(".banner").isVisible(), true);
      assert.match((await h.page.locator(".banner").textContent()) ?? "", /Out of date/);
      assert.equal(
        await h.page.locator(".content").evaluate((e) => e.classList.contains("stale")),
        true,
      );
      assert.equal(await h.page.locator('.content g[data-role="element"]').count(), 3);
    },
  },
  {
    name: "asks before deleting what depends on a box",
    async run(h) {
      const db = await h.centre("db");
      await h.page.mouse.click(db.x, db.y);
      await h.settled();
      await h.page.keyboard.press("Delete");
      await h.settled();
      const dialog = h.page.locator(".dialog");
      assert.equal(await dialog.isVisible(), true);
      assert.equal(await dialog.locator("li").count(), 2);
      await h.page.keyboard.press("Enter");
      await h.settled();
      assert.doesNotMatch(h.text, /\bdb\b/);
    },
  },
  {
    name: "connects with C and a filtered list",
    async run(h) {
      const api = await h.centre("api");
      await h.page.mouse.click(api.x, api.y);
      await h.settled();
      await h.page.keyboard.press("c");
      const picker = h.page.locator(".picker input");
      assert.equal(await picker.isVisible(), true);
      await picker.fill("cac");
      await picker.press("Enter");
      await h.settled();
      assert.match(h.text, /api -> cache/);
    },
  },
  {
    name: "styles from the strip: a swatch, a colour of one's own, the theme again, the keyboard",
    async run(h) {
      const page = h.page;
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      const strip = page.getByRole("region", { name: "Style" });
      assert.equal(await strip.isVisible(), true);
      const fill = page.getByRole("radiogroup", { name: "Fill" });
      assert.equal(await fill.getByRole("radio").count(), 17);
      await fill.getByRole("radio", { name: /^accent / }).click();
      await h.settled();
      assert.match(h.text, /style api \{ fill accent \}/);
      assert.equal(
        await page
          .getByRole("radiogroup", { name: "Fill" })
          .getByRole("radio", { name: /^accent / })
          .getAttribute("aria-checked"),
        "true",
      );
      await page.getByLabel("Stroke: a colour of one's own").fill("#e8a33d");
      await h.settled();
      assert.match(h.text, /style api \{ fill accent; stroke "#E8A33D" \}/);
      await page
        .getByRole("radiogroup", { name: "Fill" })
        .getByRole("radio", { name: "Theme: inherit" })
        .click();
      await h.settled();
      assert.match(h.text, /style api \{ stroke "#E8A33D" \}/);
      // Arrows move between the chips; Space chooses.
      const text = page.getByRole("radiogroup", { name: "Text colour" });
      await text.getByRole("radio", { name: "Theme: inherit" }).focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Space");
      await h.settled();
      assert.match(h.text, /style api \{ stroke "#E8A33D"; color surface \}/);
      await page.screenshot({ path: join(output, "canvas-strip.png") });
    },
  },
  {
    name: "turns an effect on from the strip and shows its speed",
    async run(h) {
      const page = h.page;
      await h.focusStage();
      // Select the relation through its label.
      const label = await page
        .locator('.content g[data-id="save"][data-role="relation"] [data-role="label"]')
        .first()
        .boundingBox();
      assert.ok(label);
      await page.mouse.click(label.x + label.width / 2, label.y + label.height / 2);
      await h.settled();
      assert.deepEqual(h.session.selected, ["save"]);
      // The Effects row is headed like the route kind's and says what is on.
      const row = page.locator('.strip [data-field="effects"]');
      assert.equal(await row.locator(".row-label > span").first().textContent(), "Effects");
      assert.equal(await row.locator(".value").textContent(), "off");
      assert.equal(
        await page.getByRole("group", { name: "Effects" }).getByRole("button").count(),
        4,
      );
      // The toggle by its exact name: the card's button is "Moving dash: settings".
      const dash = page.getByRole("button", { name: "Moving dash", exact: true });
      assert.equal(await dash.getAttribute("aria-pressed"), "false");
      await dash.click();
      await h.settled();
      assert.match(h.text, /animate save \{ effect dash \}/);
      assert.equal(await dash.getAttribute("aria-pressed"), "true");
      assert.equal(await row.locator(".value").textContent(), "Moving dash");
      await page.locator(".strip").screenshot({ path: join(output, "inspector-effects-row.png") });
      assert.equal(
        await page.locator("#mdg-field-effect-dash-duration").getAttribute("placeholder"),
        "1000",
      );
      // The effect just turned on has one open card under the row: its name and speed in the
      // header, repeat, delay and direction inside; nothing of it anywhere else.
      const dashCard = page.locator('.strip .effect-card[data-effect="effect.dash"]');
      assert.equal(await dashCard.getAttribute("data-open"), "true");
      const dashHead = dashCard.getByRole("button", { name: "Moving dash: settings" });
      assert.equal(await dashHead.getAttribute("aria-expanded"), "true");
      assert.equal(await dashHead.getAttribute("aria-controls"), "mdg-card-effect-dash");
      assert.equal(await dashHead.locator(".card-name").textContent(), "Moving dash");
      assert.equal(
        await dashCard.locator(".card-header #mdg-field-effect-dash-duration").count(),
        1,
        "the speed in the header",
      );
      for (const setting of ["repeat", "delay", "direction"]) {
        const field = dashCard.locator(
          `#mdg-card-effect-dash [data-field="effect.dash.${setting}"]`,
        );
        assert.equal(await field.isVisible(), true, setting);
        // The label without the effect's name, which the header shows once ("delay (ms)").
        const label = (await field.locator("label").textContent()) ?? "";
        assert.ok(label.startsWith(setting) && !label.includes("Moving dash"), label);
      }
      assert.match(
        (await page.locator("#mdg-field-effect-dash-delay").getAttribute("aria-label")) ?? "",
        /^Moving dash: delay/,
      );
      assert.equal(await page.locator(".strip .effect-card").count(), 1);
      assert.equal(
        await page.locator('.inspector > .field label[for^="mdg-field-effect-"]').count(),
        0,
        "no effect field after the strip",
      );
      // A trace combines with the dash; its speed defaults to 1500 ms. Its card opens and the
      // dash's closes, keeping its speed in its header.
      await page.getByRole("button", { name: "Trace", exact: true }).click();
      await h.settled();
      assert.match(h.text, /animate save \{ effect trace \}/);
      assert.equal(
        await page.locator("#mdg-field-effect-trace-duration").getAttribute("placeholder"),
        "1500",
      );
      const traceCard = page.locator('.strip .effect-card[data-effect="effect.trace"]');
      assert.equal(await traceCard.getAttribute("data-open"), "true");
      assert.equal(await dashCard.getAttribute("data-open"), "false");
      assert.equal(await page.locator("#mdg-field-effect-dash-duration").isVisible(), true);
      assert.equal(await page.locator("#mdg-field-effect-dash-delay").isVisible(), false);
      // The trace colour is a row of chips: Theme, the sixteen tokens and the picker, with the
      // accent as what applies.
      const colour = traceCard.locator('[data-field="effect.trace.color"]');
      assert.equal(await colour.getByRole("radio").count(), 17);
      assert.equal(await colour.locator(".row-label > span").first().textContent(), "colour");
      assert.equal(
        await colour.getByRole("radiogroup").getAttribute("aria-label"),
        "Trace: colour",
      );
      assert.equal(await colour.locator(".value").textContent(), "accent (inherited)");
      const accent = await colour
        .locator('[data-token="accent"]')
        .evaluate((chip) => getComputedStyle(chip).getPropertyValue("--chip").trim());
      assert.match(accent, /^#[0-9a-fA-F]{6}$/);
      assert.equal(await colour.locator('input[type="color"]').inputValue(), accent.toLowerCase());
      await colour.locator('[data-token="danger"]').click();
      await h.settled();
      assert.match(h.text, /animate save \{ effect trace; color danger \}/);
      assert.equal(
        await colour.locator('[data-token="danger"]').getAttribute("aria-checked"),
        "true",
      );
      await colour.locator('input[type="color"]').fill("#e8a33d");
      await h.settled();
      assert.match(h.text, /animate save \{ effect trace; color "#E8A33D" \}/);
      await colour.locator('[data-token=""]').click();
      await h.settled();
      assert.match(h.text, /animate save \{ effect trace \}/);
      assert.doesNotMatch(h.text, /color/);
      // A speed below the language's range is refused, the text unchanged.
      const before = h.text;
      await page.locator("#mdg-field-effect-trace-duration").fill("50");
      await page.keyboard.press("Enter");
      await h.settled();
      assert.equal(h.text, before);
      await page.locator(".strip").screenshot({ path: join(output, "inspector-effect-cards.png") });
    },
  },
  {
    name: "effect cards keep their open state for the session, start closed after a reload, and a selection has none",
    text: SHEET.replace(
      "  placement {",
      "  animate save { effect dash }\n  animate save { effect trace }\n  animate api { effect pulse }\n  placement {",
    ),
    async run(h) {
      const page = h.page;
      await h.focusStage();
      const selectSave = async () => {
        const label = await page
          .locator('.content g[data-id="save"][data-role="relation"] [data-role="label"]')
          .first()
          .boundingBox();
        assert.ok(label);
        await page.mouse.click(label.x + label.width / 2, label.y + label.height / 2);
        await h.settled();
        assert.deepEqual(h.session.selected, ["save"]);
      };
      await selectSave();
      // Effects on from the start: their cards start closed.
      const dashCard = page.locator('.strip .effect-card[data-effect="effect.dash"]');
      const traceCard = page.locator('.strip .effect-card[data-effect="effect.trace"]');
      assert.equal(await page.locator(".strip .effect-card").count(), 2);
      assert.equal(await dashCard.getAttribute("data-open"), "false");
      assert.equal(await traceCard.getAttribute("data-open"), "false");
      // The body moves on the canvas's tokens: its height over 160 ms, its opacity over 120 ms.
      const body = dashCard.locator(".card-body");
      const transition = () =>
        body.evaluate((element) => {
          const style = getComputedStyle(element);
          return { property: style.transitionProperty, duration: style.transitionDuration };
        });
      assert.match((await transition()).property, /^grid-template-rows, opacity/);
      assert.match((await transition()).duration, /^0\.16s, 0\.12s/);
      // Opened by its header, the card stays open for the target while the canvas lasts.
      const head = dashCard.getByRole("button", { name: "Moving dash: settings" });
      await head.click();
      assert.equal(await dashCard.getAttribute("data-open"), "true");
      assert.equal(await head.getAttribute("aria-expanded"), "true");
      await page.waitForTimeout(250);
      assert.equal(await page.locator("#mdg-field-effect-dash-delay").isVisible(), true);
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      assert.deepEqual(h.session.selected, ["api"]);
      assert.equal(await page.locator(".strip .effect-card").count(), 1, "the pulse's card");
      await selectSave();
      assert.equal(await dashCard.getAttribute("data-open"), "true");
      assert.equal(await traceCard.getAttribute("data-open"), "false");
      // Several targets: the toggles only, mixed where they differ, and no card.
      await h.focusStage();
      await page.keyboard.press("Control+a");
      await h.settled();
      assert.ok(h.session.selected.length >= 3, h.session.selected.join());
      assert.equal(await page.locator(".strip .effect-card").count(), 0);
      assert.equal(
        await page.locator('.strip [data-field="effects"] .value').textContent(),
        "mixed",
      );
      // After a reload every card starts closed.
      await h.reload();
      await h.focusStage();
      await selectSave();
      assert.equal(await dashCard.getAttribute("data-open"), "false");
      // Under reduced motion nothing moves.
      await page.emulateMedia({ reducedMotion: "reduce" });
      assert.match((await transition()).duration, /^0s, 0s/);
    },
  },
  {
    name: "an imported relation named by a dotted line or a moved label stays selected",
    text: IMPORTED_FLOWCHART,
    async run(h) {
      const page = h.page;
      await h.focusStage();
      const labelOf = async (id: string) => {
        const box = await page
          .locator(`.content g[data-id="${id}"][data-role="relation"] [data-role="label"]`)
          .first()
          .boundingBox();
        assert.ok(box, `no label for ${id}`);
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      };
      const yes = await labelOf("pay->orders#1");
      await page.mouse.click(yes.x, yes.y);
      await h.settled();
      assert.deepEqual(h.session.selected, ["pay->orders#1"]);
      await page
        .getByRole("radiogroup", { name: "Line" })
        .getByRole("radio", { name: "dotted" })
        .click();
      await h.settled();
      assert.match(h.text, /pay -> orders: "yes" as pay_orders/);
      assert.match(h.text, /style pay_orders \{ line dotted \}/);
      assert.deepEqual(h.session.selected, ["pay_orders"], "the dotted line keeps it selected");
      assert.match((await page.locator(".inspector h2").textContent()) ?? "", /pay_orders/);
      // Another anonymous relation, named by moving its label.
      const no = await labelOf("pay->retry#1");
      await page.mouse.click(no.x, no.y);
      await h.settled();
      await dragTo(h, no, { x: no.x + 30, y: no.y - 24 });
      assert.match(h.text, /pay -> retry: "no" as pay_retry/);
      assert.deepEqual(h.session.selected, ["pay_retry"], "the moved label keeps it selected");
      assert.match((await page.locator(".inspector h2").textContent()) ?? "", /pay_retry/);
    },
  },
  {
    name: "draws line, route, corners and heads as pictures and writes them",
    async run(h) {
      const page = h.page;
      const label = await page
        .locator('.content g[data-id="save"][data-role="relation"] [data-role="label"]')
        .first()
        .boundingBox();
      assert.ok(label);
      await page.mouse.click(label.x + label.width / 2, label.y + label.height / 2);
      await h.settled();
      // The line row: solid is the arrow, dotted a style.
      const line = page.getByRole("radiogroup", { name: "Line" });
      assert.deepEqual(
        await line
          .getByRole("radio")
          .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label"))),
        ["solid", "dashed", "dotted"],
      );
      await line.getByRole("radio", { name: "dotted" }).click();
      await h.settled();
      assert.match(h.text, /style save \{ line dotted \}/);
      await page
        .getByRole("radiogroup", { name: "Line" })
        .getByRole("radio", { name: "dashed" })
        .click();
      await h.settled();
      assert.match(h.text, /api --> db: "save" as save/);
      assert.doesNotMatch(h.text, /line dotted/);
      // Route and corners, by the keyboard.
      const route = page.getByRole("radiogroup", { name: "Route kind" });
      await route.getByRole("radio", { name: "elbow" }).click();
      await h.settled();
      assert.match(h.text, /style save \{ routing orthogonal \}/);
      const corners = page.getByRole("radiogroup", { name: "Corners" });
      await corners.getByRole("radio", { name: /^Default/ }).focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      await h.settled();
      assert.match(h.text, /style save \{ routing orthogonal; corners rounded \}/);
      // The start head: a button that opens a grid of every head.
      const start = page.locator("#mdg-field-style-arrowtail");
      assert.equal(await start.getAttribute("aria-label"), "none");
      await start.click();
      const grid = page.getByRole("radiogroup", { name: "Start arrowhead" });
      assert.equal(await grid.isVisible(), true);
      assert.equal(await grid.getByRole("radio").count(), 16);
      await page.screenshot({ path: join(output, "canvas-heads.png") });
      await grid.getByRole("radio", { name: "diamond", exact: true }).click();
      await h.settled();
      assert.match(h.text, /arrowtail diamond/);
      assert.equal(
        await page.locator("#mdg-field-style-arrowtail").getAttribute("aria-label"),
        "diamond",
      );
      // Escape closes the grid and keeps the head.
      await page.locator("#mdg-field-style-arrowhead").click();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Escape");
      assert.equal(await closed(page.getByRole("radiogroup", { name: "End arrowhead" })), true);
      assert.doesNotMatch(h.text, /arrowhead /);
      await page.screenshot({ path: join(output, "canvas-pictures.png") });
    },
  },
  {
    name: "connects with the relation tool, dashed with Shift, and cancels with Escape",
    async run(h) {
      const page = h.page;
      const tool = page.getByRole("button", {
        name: "Relation: click the source, then the target",
      });
      await tool.click();
      assert.equal(await tool.getAttribute("aria-pressed"), "true");
      const api = await h.centre("api");
      const cache = await h.centre("cache");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      assert.equal(await page.locator(".overlay .highlight.source").count(), 1);
      await page.keyboard.down("Shift");
      await page.mouse.click(cache.x, cache.y);
      await page.keyboard.up("Shift");
      await h.settled();
      assert.match(h.text, /api --> cache/);
      assert.deepEqual(h.session.selected, ["api->cache#1"]);
      assert.equal(await tool.getAttribute("aria-pressed"), "false");
      // R arms it again; Escape after the first click creates nothing.
      await h.focusStage();
      await page.keyboard.press("r");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      await page.keyboard.press("Escape");
      await page.mouse.click(cache.x, cache.y);
      await h.settled();
      assert.equal(h.text.match(/api -->? cache/g)?.length, 1);
      assert.deepEqual(h.session.selected, ["cache"]);
    },
  },
  {
    name: "chooses an icon for a node from the Icon field's picker, and removes it",
    async run(h) {
      const page = h.page;
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      const field = page.locator('[data-field="style.icon"]');
      assert.equal(await field.locator(".icon-name").textContent(), "No icon");
      assert.equal(await field.getByRole("button", { name: "Remove" }).isDisabled(), true);
      const choose = field.getByRole("button", { name: "Choose…" });
      await choose.click();
      const { picker, search, option } = iconPicker(page);
      await picker.waitFor();
      assert.equal(await choose.getAttribute("aria-expanded"), "true");
      assert.equal(await picker.locator(".icon-picker-head").textContent(), "Icon of api");
      // At the button that opened it (under it, or over it near the bottom), without the
      // placement control: it sets the icon.
      const button = (await choose.boundingBox())!;
      const box = (await picker.boundingBox())!;
      assert.ok(
        box.y >= button.y + button.height - 1 || box.y + box.height <= button.y + 1,
        "beside the button",
      );
      assert.equal(await picker.getByRole("radiogroup", { name: "Insert as" }).isVisible(), false);
      assert.equal(await search.evaluate((e) => e === document.activeElement), true);
      await page.keyboard.type("server");
      await option("tabler:server").waitFor();
      assert.equal(
        await picker
          .locator('[role="option"][aria-selected="true"]')
          .getAttribute("data-reference"),
        "tabler:server",
      );
      await page.keyboard.press("Enter");
      await h.settled();
      assert.equal(await closed(picker), true);
      assert.match(h.text, /style api \{ icon "tabler:server" \}/);
      // The field shows the icon's picture and name; Remove takes it away.
      assert.equal(await field.locator(".icon-name").textContent(), "server");
      assert.equal(await field.locator(".icon-thumb svg").count(), 1);
      await field.getByRole("button", { name: "Remove" }).click();
      await h.settled();
      assert.doesNotMatch(h.text, /icon "tabler:server"/);
    },
  },
  {
    name: "creates a theme in the file from the diagram's and edits it in the theme panel",
    async run(h) {
      const page = h.page;
      await page.getByRole("button", { name: "Dark" }).click();
      await h.settled();
      assert.match(h.text, /theme "technical.dark"/);
      await page.getByRole("button", { name: "New theme from this one…" }).click();
      const dialog = page.getByRole("dialog", { name: "New theme from this one" });
      assert.equal(await dialog.isVisible(), true);
      // Outside a project the theme can only live in the file.
      assert.equal(await dialog.getByLabel(/The project/).isDisabled(), true);
      await dialog.getByRole("textbox", { name: "Id" }).fill("2bad");
      await dialog.getByRole("button", { name: "Create" }).click();
      assert.match((await dialog.textContent()) ?? "", /starts with a letter/);
      await dialog.getByRole("textbox", { name: "Id" }).fill("brand");
      await page.keyboard.press("Enter");
      await h.settled();
      assert.match(h.text, /theme brand \{\n {2}extends "technical.dark"\n\}/);
      assert.match(h.text, /theme "brand"/);
      // The new theme's panel opens at once; Done closes it and "Edit theme…" opens it again.
      const panel = page.getByRole("complementary", { name: "Theme" });
      assert.equal(await panel.isVisible(), true);
      await panel.getByRole("button", { name: "Done" }).click();
      await h.settled();
      assert.equal(await panel.isVisible(), false);
      await page.getByRole("button", { name: "Edit theme…" }).click();
      await h.settled();
      assert.equal(await panel.isVisible(), true);
      assert.equal(
        await page.getByRole("complementary", { name: "Properties" }).isVisible(),
        false,
      );
      assert.match((await panel.locator("h2").textContent()) ?? "", /Theme brand/);
      const accent = page.locator("#mdg-field-theme-accent");
      await accent.fill("#6A4FD0");
      await accent.press("Enter");
      await h.settled();
      assert.match(h.text, /extends "technical.dark"\n {2}accent "#6A4FD0"\n/);
      // The panel shows the written value and offers to inherit again.
      const inherit = panel.locator('[data-key="mdg-field-theme-accent:inherit"]');
      assert.equal(await inherit.isDisabled(), false);
      await inherit.click();
      await h.settled();
      assert.doesNotMatch(h.text, /accent "#6A4FD0"/);
      await page.locator("#mdg-field-theme-radius").fill("12");
      await page.locator("#mdg-field-theme-radius").press("Enter");
      await h.settled();
      assert.match(h.text, /\n {2}radius 12\n/);
      await page.screenshot({ path: join(output, "canvas-theme-panel.png") });
      await panel.getByRole("button", { name: "Done" }).click();
      await h.settled();
      assert.equal(await panel.isVisible(), false);
      assert.equal(await page.getByRole("complementary", { name: "Properties" }).isVisible(), true);
    },
  },
  {
    name: "opens the context menu from the keyboard and leaves the canvas with Tab",
    async run(h) {
      await h.focusStage();
      await h.page.keyboard.press("Tab");
      await h.page.keyboard.press("Shift+F10");
      const menu = h.page.locator(".menu");
      assert.equal(await menu.isVisible(), true);
      assert.equal(
        await h.page.evaluate(() => document.activeElement?.getAttribute("role")),
        "menuitem",
      );
      await h.page.keyboard.press("Escape");
      assert.equal(await closed(menu), true);
      // Tab past the last element leaves the canvas.
      await h.page.keyboard.press("Tab");
      await h.page.keyboard.press("Tab");
      await h.page.keyboard.press("Tab");
      await h.settled();
      assert.notEqual(await h.page.evaluate(() => document.activeElement?.className), "stage");
    },
  },
  {
    name: "copies and pastes with fresh ids",
    async run(h) {
      const cache = await h.centre("cache");
      await h.page.mouse.click(cache.x, cache.y);
      await h.settled();
      await h.page.keyboard.press("Control+c");
      await h.settled();
      await h.page.keyboard.press("Control+v");
      await h.settled();
      assert.match(h.text, /cache_2\["Cache"\]/);
    },
  },
  {
    name: "shows the free palette, creates text with T and an icon from the palette",
    text: FREE,
    async run(h) {
      const page = h.page;
      assert.equal(await page.locator('.toolbar button[data-tool="node"]').isVisible(), false);
      assert.equal(await page.locator('.toolbar button[data-tool="box"]').isVisible(), true);
      assert.equal(await page.locator('.toolbar button[data-tool="image"]').isVisible(), true);
      await h.focusStage();
      await page.keyboard.press("t");
      await h.settled();
      assert.match(h.text, /text text1 "Text"/);
      await page.keyboard.press("Escape");
      await h.focusStage();
      await page.keyboard.press("Escape");
      await h.settled();
      // The icon tool opens the picker, with the icon alone among the placements of a free diagram.
      const tool = page.locator('.toolbar button[data-tool="icon"]');
      await tool.click();
      const { picker, search, option } = iconPicker(page);
      await picker.waitFor();
      assert.equal(await tool.getAttribute("aria-expanded"), "true");
      const placement = picker.getByRole("radiogroup", { name: "Insert as" });
      assert.deepEqual(await placement.getByRole("radio").allTextContents(), [
        "Icon",
        "In a box",
        "Only the icon",
      ]);
      await placement.getByRole("radio", { name: "Only the icon" }).click();
      await search.fill("server");
      await option("tabler:server").click();
      assert.equal(await closed(picker), true);
      assert.equal(await tool.getAttribute("aria-pressed"), "true");
      const client = await h.centre("client");
      await page.mouse.click(client.x + 280, client.y + 40);
      await h.settled();
      // In the group under the point.
      assert.match(h.text, /\n {4}icon icon1 "tabler:server"\n/);
      await page.screenshot({ path: join(output, "canvas-free.png") });
    },
  },
  {
    name: "moves a child inside its group and orders with Ctrl+Shift+]",
    text: FREE,
    async run(h) {
      const page = h.page;
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      await page.keyboard.press("Shift+ArrowRight");
      await h.settled();
      assert.deepEqual(h.place("api"), { x: 112, y: 56 });
      assert.deepEqual(h.place("g"), { x: 420, y: 220 });
      await page.keyboard.press("Control+Shift+BracketRight");
      await h.settled();
      assert.match(h.text, /box db "DB"\n {4}box api "API"/);
    },
  },
  {
    name: "converts a flow diagram from the Arrange menu and shows the copy",
    async run(h) {
      const page = h.page;
      await page.locator('.toolbar button[aria-label="Arrange"]').click();
      await page.locator(".menu").getByText("Convert to free composition").click();
      await h.settled();
      assert.match(h.text, /diagram d_free: free \{/);
      assert.equal(h.session.current, "d_free");
      assert.equal(await page.locator('.toolbar button[data-tool="box"]').isVisible(), true);
    },
  },
  {
    name: "shows the sequence palette and reorders a participant by dragging its head",
    text: SEQUENCE,
    async run(h) {
      const page = h.page;
      assert.equal(await page.locator('.toolbar button[data-tool="node"]').isVisible(), false);
      assert.equal(
        await page.locator('.toolbar button[data-tool="participant"]').isVisible(),
        true,
      );
      assert.equal(await page.locator('.toolbar button[aria-label="Arrange"]').isVisible(), false);
      assert.equal(await page.locator('.toolbar select[aria-label="Scenario"]').isVisible(), true);
      const bank = await h.centre("bank");
      const customer = await h.centre("customer");
      await page.mouse.move(bank.x, bank.y);
      await page.mouse.down();
      await page.mouse.move((bank.x + customer.x) / 2, bank.y + 30, { steps: 4 });
      const api = await h.centre("api");
      await page.mouse.move((customer.x + api.x) / 2, bank.y + 30, { steps: 4 });
      await page.mouse.up();
      await h.settled();
      assert.match(
        h.text,
        /actor customer "Customer"\n {2}participant bank "Bank"\n {2}participant api/,
      );
      assert.match(h.text, /customer -> api: "Pay" as pay/);
      await page.screenshot({ path: join(output, "canvas-sequence.png") });
    },
  },
  {
    name: "draws a message with the Message tool, a reply with Shift",
    text: SEQUENCE,
    async run(h) {
      const page = h.page;
      const tool = page.getByRole("button", {
        name: "Message: click the sender, then the receiver",
      });
      assert.equal(await tool.isVisible(), true);
      await tool.click();
      // A head, or anywhere on a lifeline, fragments included, picks the participant.
      const head = async (id: string) => {
        const box = await page
          .locator(`.content g[data-id="${id}"][data-role="element"]`)
          .first()
          .boundingBox();
        assert.ok(box, `no box for ${id}`);
        return { x: box.x + box.width / 2, y: box.y + 12 };
      };
      const customer = await head("customer");
      const bank = await head("bank");
      const fragment = await page.locator('.content g[data-id="result"]').first().boundingBox();
      assert.ok(fragment, "the alt fragment is drawn");
      await page.mouse.click(customer.x, customer.y);
      await h.settled();
      await page.mouse.click(bank.x, bank.y);
      await h.settled();
      assert.match(h.text, /\n {2}customer -> bank\n/);
      await h.focusStage();
      await page.keyboard.press("r");
      await page.mouse.click(bank.x, fragment.y + fragment.height / 2);
      await h.settled();
      await page.keyboard.down("Shift");
      await page.mouse.click(customer.x, customer.y);
      await page.keyboard.up("Shift");
      await h.settled();
      assert.match(h.text, /\n {2}bank --> customer\n/);
    },
  },
  {
    name: "spaces a message by dragging it down and moves it with Alt+Up",
    text: SEQUENCE,
    async run(h) {
      const page = h.page;
      const arrow = await page
        .locator('.content g[data-id="authorize"][data-role="relation"] polyline')
        .first()
        .boundingBox();
      assert.ok(arrow);
      const x = arrow.x + arrow.width / 2;
      const y = arrow.y + arrow.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + 20, { steps: 4 });
      await page.mouse.move(x + 40, y + 28, { steps: 4 });
      await page.mouse.up();
      await h.settled();
      assert.match(h.text, /space authorize 28/);
      assert.deepEqual(h.session.selected, ["authorize"]);
      await h.focusStage();
      await page.keyboard.press("Alt+ArrowUp");
      await h.settled();
      assert.match(h.text, /as pay\n {2}api -> bank: "Authorize" as authorize\n {2}activate api/);
      await page.keyboard.press("Alt+a");
      await h.settled();
      assert.match(h.text, /as authorize\n {2}activate bank\n/);
    },
  },
  {
    name: "adds a note with O, wraps in a fragment with F and previews a scenario",
    text: SEQUENCE,
    async run(h) {
      const page = h.page;
      const arrow = await page
        .locator('.content g[data-id="pay"][data-role="relation"] polyline')
        .first()
        .boundingBox();
      assert.ok(arrow);
      await page.mouse.click(arrow.x + arrow.width / 2, arrow.y + arrow.height / 2);
      await h.settled();
      await page.keyboard.press("o");
      await h.settled();
      assert.match(h.text, /note note1 over customer, api "Note"/);
      await page.keyboard.press("Escape");
      await h.settled();
      await page.mouse.click(arrow.x + arrow.width / 2, arrow.y + arrow.height / 2);
      await h.settled();
      await page.keyboard.press("f");
      await page.locator(".menu").getByText("loop: repeated").click();
      await h.settled();
      assert.match(h.text, /loop loop1 "Condition" \{\n {4}customer -> api: "Pay" as pay/);
      await page.locator('.toolbar select[aria-label="Scenario"]').selectOption("happy");
      await h.settled();
      assert.equal(h.session.previewed, "happy");
      assert.match((await page.locator(".badge").textContent()) ?? "", /scenario preview/);
      assert.equal(await page.locator('.content g[data-id="declined"]').count(), 0);
      await page.screenshot({ path: join(output, "canvas-scenario.png") });
      await page.locator('.toolbar select[aria-label="Scenario"]').selectOption("");
      await h.settled();
      assert.equal(h.session.previewed, undefined);
    },
  },
  {
    name: "adds an entity from the model, labels it locally and removes it from the view",
    text: C4,
    async run(h) {
      const page = h.page;
      assert.equal(await page.locator('.toolbar button[data-tool="group"]').isVisible(), false);
      assert.equal(
        await page.locator('.toolbar button[aria-label="Add from the model…"]').isVisible(),
        true,
      );
      await h.focusStage();
      await page.keyboard.press("a");
      await page.keyboard.type("Bank");
      await page.keyboard.press("Enter");
      await h.settled();
      assert.match(h.text, /include customer, shop\.web, shop\.api, shop\.db, bank/);
      const web = await h.centre("shop.web");
      await page.mouse.dblclick(web.x, web.y);
      await page.keyboard.press("Control+a");
      await page.keyboard.type("Storefront");
      await page.keyboard.press("Enter");
      await h.settled();
      assert.match(h.text, /label shop\.web "Storefront"/);
      assert.match(h.text, /container web "Web"/);
      // Fit the diagram so that the new entity is on the canvas.
      await h.focusStage();
      await page.keyboard.press("Shift+Digit1");
      const bank = await h.centre("bank");
      await page.mouse.click(bank.x, bank.y);
      await h.settled();
      await page.keyboard.press("Delete");
      await h.settled();
      assert.match(h.text, /include customer, shop\.web, shop\.api, shop\.db\n/);
      await page.screenshot({ path: join(output, "canvas-c4.png") });
    },
  },
  {
    name: "C4: an anonymous relation takes an effect, an end moves in the model, Delete asks for the other view",
    text:
      C4.replace(" as persist", "") +
      "\ndiagram context: c4 using commerce {\n  level context\n}\n",
    async run(h) {
      const page = h.page;
      const box = async (selector: string) => {
        const found = await page.locator(selector).first().boundingBox();
        assert.ok(found, `no ${selector}`);
        return found;
      };
      const centre = (b: Rect) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
      // `shop.api -> shop.db` has no id in the model: selected by its label, its Effects show,
      // and Flow particles names it there.
      const key = "shop.api->shop.db#1";
      const label = centre(
        await box(`.content g[data-id="${key}"][data-role="relation"] [data-role="label"]`),
      );
      await page.mouse.click(label.x, label.y);
      await h.settled();
      assert.deepEqual(h.session.selected, [key]);
      const flow = page.getByRole("button", { name: "Flow particles" });
      assert.equal(await flow.getAttribute("aria-pressed"), "false");
      await flow.click();
      await h.settled();
      assert.match(h.text, /shop\.api -> shop\.db: "SQL" as shop_api_shop_db\n/);
      assert.match(h.text, /animate shop_api_shop_db \{ effect flow \}/);
      assert.deepEqual(h.session.selected, ["shop_api_shop_db"]);
      // Dropping the end at shop.db inside shop.web moves the model relation's end there.
      const end = centre(await box('.overlay [data-handle="end:to"]'));
      const web = await h.centre("shop.web");
      await page.mouse.move(end.x, end.y);
      await page.mouse.down();
      await page.mouse.move(web.x, web.y, { steps: 8 });
      await page.mouse.up();
      await h.settled();
      assert.match(h.text, /shop\.api -> shop\.web: "SQL" as shop_api_shop_db\n/);
      // Delete on `visit`, which the context view draws too: the dialog says so, Enter confirms.
      const visit = centre(
        await box('.content g[data-id="visit"][data-role="relation"] [data-role="label"]'),
      );
      await page.mouse.click(visit.x, visit.y);
      await h.settled();
      await page.keyboard.press("Delete");
      await h.settled();
      const dialog = page.locator(".dialog");
      assert.equal(await dialog.isVisible(), true);
      assert.match(await dialog.locator("li").first().innerText(), /drawn in the view `context`/);
      await page.keyboard.press("Enter");
      await h.settled();
      assert.doesNotMatch(h.text, /as visit/);
      await page.screenshot({ path: join(output, "canvas-c4-relations.png") });
    },
  },
  {
    name: "C4: a container from the palette is declared in the model, drawn and labelled",
    text: C4,
    async run(h) {
      const page = h.page;
      // The palette offers the kinds a container view draws, with their pictures.
      const kinds = await page
        .locator(".toolbar button[data-declared]")
        .evaluateAll((buttons) => buttons.map((b) => b.getAttribute("data-tool")));
      assert.deepEqual(kinds, ["container", "datastore", "person", "system"]);
      await page.locator('.toolbar button[data-tool="container"]').click();
      // An empty corner of the stage, clear of the minimap.
      const stage = await page.locator(".stage").boundingBox();
      assert.ok(stage, "no stage");
      await page.mouse.click(stage.x + 80, stage.y + stage.height - 80);
      await h.settled();
      assert.match(
        h.text,
        /datastore db "Orders" \{ technology "PostgreSQL" \}\n {4}container container1 ""\n/,
      );
      assert.match(h.text, /include customer, shop\.web, shop\.api, shop\.db, shop\.container1\n/);
      assert.equal(
        await page.locator('.content g[data-id="shop.container1"][data-role="element"]').count(),
        1,
        "the new container is drawn",
      );
      assert.deepEqual(h.session.selected, ["shop.container1"]);
      // Its label is typed where it is drawn, and written in the model.
      const inline = page.locator("textarea.inline");
      await inline.waitFor({ state: "visible" });
      await page.keyboard.type("Worker");
      await page.keyboard.press("Enter");
      await h.settled();
      assert.match(h.text, / {4}container container1 "Worker"\n/);
      assert.doesNotMatch(h.text, /label shop\.container1/);
      await page.screenshot({ path: join(output, "canvas-c4-palette.png") });
    },
  },
  {
    name: "C4: an arrow with a route is reconnected twice and its route follows",
    text: C4.replace(
      "  include customer, shop.web, shop.api, shop.db\n",
      "  include customer, shop.web, shop.api, shop.db\n  layout manual\n  placement {\n    place customer at (120, 80)\n    place shop.web at (120, 300)\n    place shop.api at (420, 300)\n    place shop.db at (720, 300)\n    route visit from customer.south to shop.web.north via [(120, 190)]\n  }\n",
    ),
    async run(h) {
      const page = h.page;
      const box = async (selector: string) => {
        const found = await page.locator(selector).first().boundingBox();
        assert.ok(found, `no ${selector}`);
        return found;
      };
      const centre = (b: Rect) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
      const dragEndTo = async (to: { x: number; y: number }) => {
        const label = centre(
          await box('.content g[data-id="visit"][data-role="relation"] [data-role="label"]'),
        );
        await page.mouse.click(label.x, label.y);
        await h.settled();
        const end = centre(await box('.overlay [data-handle="end:to"]'));
        await page.mouse.move(end.x, end.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 8 });
        await page.mouse.up();
        await h.settled();
      };
      const status = () => page.locator(".status").textContent();
      // Onto the middle of the API: the route ends there, its compass side carried over.
      await dragEndTo(await h.centre("shop.api"));
      assert.match(h.text, /customer -> shop\.api: "Buys" as visit\n/);
      assert.match(
        h.text,
        /route visit from customer\.south to shop\.api\.north via \[\(120, 190\)\]/,
      );
      assert.doesNotMatch((await status()) ?? "", /invalid/);
      // Again, onto the database: what answered "The `route` statement for … is invalid".
      await dragEndTo(await h.centre("shop.db"));
      assert.match(h.text, /customer -> shop\.db: "Buys" as visit\n/);
      assert.match(
        h.text,
        /route visit from customer\.south to shop\.db\.north via \[\(120, 190\)\]/,
      );
      assert.doesNotMatch((await status()) ?? "", /invalid|Fix the problems/);
      assert.equal(await page.locator(".banner").isVisible(), false, "nothing stale");
      await page.screenshot({ path: join(output, "canvas-c4-reconnect.png") });
    },
  },
  {
    name: "plays the effects of a diagram from the start, and remembers a pause over a reload",
    text: SHEET.replace(
      "  placement {",
      "  animate save { effect flow; particles 2 }\n  animate db { effect pulse }\n  placement {",
    ),
    async run(h) {
      const animated = () =>
        h.page.evaluate(
          () =>
            document.querySelector(".content svg style")?.textContent?.includes("@keyframes") ??
            false,
        );
      // Animated from the start, with Pause offered.
      const pause = h.page.getByRole("button", { name: "Pause effects" });
      await pause.waitFor({ state: "visible" });
      assert.equal(await animated(), true, "animated on opening");
      assert.equal(await pause.getAttribute("aria-pressed"), "true");
      const running = await h.page.evaluate(
        () =>
          [...document.querySelectorAll(".content svg .mdg-m")].filter(
            (e) => e.getAnimations().length > 0,
          ).length,
      );
      assert.equal(running, 3, "two particles and a halo run");
      await h.page.screenshot({ path: join(output, "canvas-effects.png") });
      // Paused: the static drawing and Play offered.
      await pause.click();
      await h.settled();
      await h.page.waitForFunction(() => !document.querySelector(".content svg style"));
      const play = h.page.getByRole("button", { name: "Play effects" });
      assert.equal(await play.getAttribute("aria-pressed"), "false");
      // The pause holds over a reload with a new session, which would play.
      await h.reload();
      await play.waitFor({ state: "visible" });
      assert.equal(await animated(), false, "still paused after the reload");
      await play.click();
      await h.settled();
      await h.page.waitForFunction(() =>
        document.querySelector(".content svg style")?.textContent?.includes("@keyframes"),
      );
      assert.equal(await pause.getAttribute("aria-pressed"), "true");
      // Turning an effect on while paused says why nothing moves.
      await pause.click();
      await h.settled();
      const api = await h.centre("api");
      await h.page.mouse.click(api.x, api.y);
      await h.settled();
      await h.page.getByRole("button", { name: "Pulse" }).click();
      await h.settled();
      assert.match(h.text, /animate api \{ effect pulse \}/);
      assert.match((await h.page.locator(".status").textContent()) ?? "", /Effects paused/);
      assert.equal(await animated(), false);
    },
  },
  {
    name: "a diagram without effects has the toggle disabled; reduced motion starts paused",
    async run(h) {
      const toggle = h.page.locator(
        '.toolbar button[aria-label="Pause effects"], .toolbar button[aria-label="Play effects"]',
      );
      await toggle.waitFor({ state: "visible" });
      assert.equal(await toggle.isDisabled(), true, "nothing to play");
      await toggle.click({ force: true });
      await h.settled();
      assert.equal(
        h.received.some((m) => (m as { type: string }).type === "playEffects"),
        false,
        "a press changes nothing",
      );
      // A diagram with effects shown under reduced motion, never paused or played here.
      await h.page.emulateMedia({ reducedMotion: "reduce" });
      h.text = SHEET.replace("  placement {", "  animate db { effect pulse }\n  placement {");
      h.revision++;
      await h.reload();
      const play = h.page.getByRole("button", { name: "Play effects" });
      await play.waitFor({ state: "visible" });
      assert.equal(await play.isDisabled(), false);
      assert.equal(await h.page.locator(".content svg style").count(), 0, "static");
    },
  },
  {
    name: "plays a story, scrubs it, retimes an action and adds one from the selection",
    text: STORY,
    async run(h) {
      const page = h.page;
      const picker = page.getByRole("combobox", { name: "Story" });
      await picker.waitFor({ state: "visible" });
      await picker.selectOption("purchase");
      await h.settled();
      const timeline = page.getByRole("region", { name: "Story timeline" });
      await timeline.waitFor({ state: "visible" });
      // Read-only: the palette and the inspector are gone.
      assert.equal(await page.locator(".toolbar [data-tool]").first().isVisible(), false);
      assert.equal(await page.locator(".inspector").isVisible(), false);
      // Revealed boxes start hidden.
      const opacity = () =>
        page.locator('.content g[data-id="db"][data-role="element"]').getAttribute("opacity");
      assert.equal(await opacity(), "0");
      assert.match((await page.locator(".timeline .clock").textContent()) ?? "", /^0 s \/ 6\.2 s$/);
      // Scrubbing to the middle of the reveal.
      const ruler = (await page.locator(".timeline .ruler").boundingBox())!;
      await page.mouse.click(ruler.x + (ruler.width * 400) / 6200, ruler.y + ruler.height / 2);
      assert.equal(await opacity(), "0.5");
      // Playing moves the clock on and pauses at the end or on demand.
      await page.getByRole("button", { name: "Play the story" }).click();
      await page.waitForTimeout(400);
      await page.getByRole("button", { name: "Pause the story" }).click();
      const clock = (await page.locator(".timeline .clock").textContent()) ?? "";
      assert.ok(!clock.startsWith("400 ms"), clock);
      await page.screenshot({ path: join(output, "canvas-story.png") });
      // Dragging the end of the reveal to 1.2 s writes the time.
      const bar = page.locator('.timeline .bar[data-path="0.0"]');
      const grip = (await bar.locator(".grip").boundingBox())!;
      const lanes = (await page.locator(".timeline .lanes").first().boundingBox())!;
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down();
      await page.mouse.move(lanes.x + (lanes.width * 1200) / 6200, grip.y + grip.height / 2, {
        steps: 5,
      });
      await page.mouse.up();
      await h.settled();
      assert.match(h.text, /reveal client, api, db over 1200ms\n/);
      // The timeline follows the text.
      assert.match((await page.locator(".timeline .clock").textContent()) ?? "", /\/ 6\.6 s$/);
      // Select `api` on the frame at the end of the reveal and highlight it in the scene.
      await page.mouse.click(ruler.x + (ruler.width * 1400) / 6600, ruler.y + ruler.height / 2);
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await page.getByRole("combobox", { name: "Action to add" }).selectOption("highlight");
      await page.getByRole("button", { name: "Add to scene" }).click();
      await h.settled();
      assert.ok(h.text.includes("    hold 1s\n    highlight api\n  }"), h.text);
      // A bar can be removed from the timeline.
      await page.locator('.timeline .bar[data-path="0.2"]').click();
      await page.getByRole("button", { name: "Remove the selected action" }).click();
      await h.settled();
      assert.doesNotMatch(h.text, /highlight api/);
      // The story can be exported as an HTML player.
      await page.getByRole("button", { name: "Export the story as an HTML player" }).click();
      await h.settled();
      assert.deepEqual(h.received.at(-1), { type: "exportPlayer", story: "purchase" });
      // Back to editing.
      await picker.selectOption("");
      await h.settled();
      assert.equal(await timeline.isVisible(), false);
      assert.equal(await opacity(), null);
      assert.equal(await page.locator(".inspector").isVisible(), true);
    },
  },
  {
    name: "pins a connector's end to the middle of a side, connects to a point and frees an end",
    async run(h) {
      const page = h.page;
      const box = async (selector: string) => {
        const found = await page.locator(selector).first().boundingBox();
        assert.ok(found, `no ${selector}`);
        return found;
      };
      const centre = (b: { x: number; y: number; width: number; height: number }) => ({
        x: b.x + b.width / 2,
        y: b.y + b.height / 2,
      });
      const select = async () => {
        const label = centre(
          await box('.content g[data-id="save"][data-role="relation"] [data-role="label"]'),
        );
        await page.mouse.click(label.x, label.y);
        await h.settled();
      };
      await select();
      // Drag the end at db near the middle of db's west side: the points show, the middle is taken.
      const end = centre(await box('.overlay [data-handle="end:to"]'));
      const db = await box('.content g[data-id="db"][data-role="element"]');
      await page.mouse.move(end.x, end.y);
      await page.mouse.down();
      await page.mouse.move(db.x + 3, db.y + db.height / 2 + 2, { steps: 6 });
      // db is drawn as a cylinder: the middles of its sides are its magnets, and no corner.
      assert.equal(await page.locator(".overlay .anchor:not(.active)").count(), 4);
      assert.equal(await page.locator('.overlay path.highlight[data-target="db"]').count(), 1);
      assert.equal(await page.locator(".overlay .anchor.active").count(), 1);
      await page.mouse.up();
      await h.settled();
      assert.match(h.text, /route save from api\.auto to db\.west 50%/);
      // A double click on the end hands it back to the layout: nothing is left in the route.
      await select();
      const pinned = centre(await box('.overlay [data-handle="end:to"]'));
      await page.mouse.dblclick(pinned.x, pinned.y);
      await h.settled();
      assert.doesNotMatch(h.text, /route save/);
      // A bend added from the middle of the line goes away with a double click too.
      await select();
      const middle = centre(await box('.overlay [data-handle="segment:0"]'));
      await page.mouse.move(middle.x, middle.y);
      await page.mouse.down();
      await page.mouse.move(middle.x, middle.y + 60, { steps: 6 });
      await page.mouse.up();
      await h.settled();
      assert.match(h.text, /route save from api\.auto to db\.auto via \[\(\d+, \d+\)\]/);
      await select();
      const bend = centre(await box('.overlay [data-handle="bend:0"]'));
      await page.mouse.dblclick(bend.x, bend.y);
      await h.settled();
      // With no bend and both ends the layout's, nothing is left of the route.
      assert.doesNotMatch(h.text, /route save/);
      // From cache's north handle to the middle of db's south side: both ends are pinned.
      const cache = centre(await box('.content g[data-id="cache"][data-role="element"]'));
      await page.mouse.click(cache.x, cache.y);
      await h.settled();
      const handle = centre(await box('.overlay [data-handle="connect:north"]'));
      const target = await box('.content g[data-id="db"][data-role="element"]');
      await page.mouse.move(handle.x, handle.y);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2 + 2, target.y + target.height - 3, {
        steps: 6,
      });
      await page.mouse.up();
      await h.settled();
      assert.match(h.text, /cache -> db as cache_db/);
      assert.match(h.text, /route cache_db from cache\.north 50% to db\.south 50%/);
    },
  },
  {
    name: "pins an end to any point of the border, connects from a border and arranges anew",
    async run(h) {
      const page = h.page;
      const box = async (selector: string) => {
        const found = await page.locator(selector).first().boundingBox();
        assert.ok(found, `no ${selector}`);
        return found;
      };
      const element = (id: string) => box(`.content g[data-id="${id}"][data-role="element"]`);
      const label = await box(
        '.content g[data-id="save"][data-role="relation"] [data-role="label"]',
      );
      await page.mouse.click(label.x + label.width / 2, label.y + label.height / 2);
      await h.settled();
      // The end at db goes to db's north border, about 37 % from its left, away from every magnet.
      const end = await box('.overlay [data-handle="end:to"]');
      const db = await element("db");
      await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2);
      await page.mouse.down();
      await page.mouse.move(db.x + db.width * 0.375, db.y + 2, { steps: 6 });
      assert.equal(await page.locator(".overlay .anchor.active").count(), 1);
      await page.screenshot({ path: join(output, "canvas-border-point.png") });
      await page.mouse.up();
      await h.settled();
      assert.match(h.text, /route save from api\.auto to db\.north 3[6-8]%/);
      // Just outside cache's north border, 30 % from its left, a connection can start.
      await page.mouse.click(5, 5);
      await h.settled();
      const cache = await element("cache");
      const start = { x: cache.x + cache.width * 0.3, y: cache.y - 3 };
      await page.mouse.move(start.x, start.y - 20);
      await page.mouse.move(start.x, start.y, { steps: 4 });
      assert.equal(await page.locator(".stage.connecting").count(), 1);
      await page.screenshot({ path: join(output, "canvas-border-start.png") });
      assert.equal(await page.locator(".overlay .anchor.active").count(), 1);
      await page.mouse.down();
      const target = await element("db");
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
        steps: 6,
      });
      await page.mouse.up();
      await h.settled();
      assert.match(h.text, /cache -> db as cache_db/);
      assert.match(h.text, /route cache_db from cache\.north (29|30|31)% to db\.auto/);
      // Recomputing the layout hands every connection point back to the engine, and keeps the
      // bends it draws as waypoints.
      await page.locator('.toolbar button[aria-label="Arrange"]').click();
      await page.locator(".menu").getByText("Recompute layout").click();
      await h.settled();
      assert.doesNotMatch(h.text, /\.(north|south|east|west)/);
      assert.match(h.text, /route save from api to db via \[\(-?\d+, -?\d+\)/);
      assert.match(h.text, /route cache_db from cache to db via \[\(-?\d+, -?\d+\)/);
      assert.match(h.text, /cache -> db as cache_db/);
    },
  },
  {
    name: "puts the midpoint handle on the drawn line and colours the overlay from the theme",
    text: SHEET.replace(
      "    place cache at (420, 266)\n",
      "    place cache at (420, 266)\n    route save from api.north 31% to db.east 50%\n",
    ),
    async run(h) {
      const page = h.page;
      const label = await page
        .locator('.content g[data-id="save"][data-role="relation"] [data-role="label"]')
        .boundingBox();
      assert.ok(label);
      await page.mouse.click(label.x + label.width / 2, label.y + label.height / 2);
      await h.settled();
      // The line goes up, across and back into db's east side; the handle lies on it.
      const offLine = await page.evaluate(() => {
        const line = document.querySelector<SVGPolylineElement>(
          '.content g[data-id="save"][data-role="relation"] polyline',
        )!;
        const ctm = line.getScreenCTM()!;
        const points = Array.from(line.points).map((p) =>
          new DOMPoint(p.x, p.y).matrixTransform(ctm),
        );
        const r = document
          .querySelector('.overlay [data-handle="segment:0"]')!
          .getBoundingClientRect();
        const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        let best = Infinity;
        for (let i = 1; i < points.length; i++) {
          const [a, b] = [points[i - 1]!, points[i]!];
          const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const t = Math.max(
            0,
            Math.min(1, ((c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y)) / length ** 2),
          );
          best = Math.min(
            best,
            Math.hypot(a.x + (b.x - a.x) * t - c.x, a.y + (b.y - a.y) * t - c.y),
          );
        }
        return best;
      });
      assert.ok(offLine < 1.5, `the handle is ${offLine} px off the line`);
      // technical.light's accent colours the selection and the guides.
      const colours = await page.evaluate(() => {
        const style = getComputedStyle(document.querySelector(".stage")!);
        return [style.getPropertyValue("--mdg-select"), style.getPropertyValue("--mdg-guide")];
      });
      assert.deepEqual(
        colours.map((c) => c.trim().toUpperCase()),
        ["#1D4ED8", "#1D4ED8"],
      );
      const end = await page.locator('.overlay [data-handle="end:to"]').boundingBox();
      const cache = await page
        .locator('.content g[data-id="cache"][data-role="element"]')
        .boundingBox();
      assert.ok(end && cache);
      await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2);
      await page.mouse.down();
      await page.mouse.move(cache.x + cache.width / 2, cache.y + 3, { steps: 5 });
      const outline = await page.evaluate(
        () => getComputedStyle(document.querySelector(".overlay .highlight")!).stroke,
      );
      assert.equal(outline, "rgb(29, 78, 216)");
      await page.mouse.up();
      await h.settled();
    },
  },
  {
    name: "outlines a curved connector along its curve and selects arrows with the rectangle",
    text: SHEET.replace("  layout manual\n", "  layout manual\n  routing bezier\n"),
    async run(h) {
      const page = h.page;
      const label = await page
        .locator('.content g[data-id="save"][data-role="relation"] [data-role="label"]')
        .boundingBox();
      assert.ok(label);
      await page.mouse.click(label.x + label.width / 2, label.y + label.height / 2);
      await h.settled();
      // The outline has the curve's many points, not the two anchors.
      const outlinePoints = await page.evaluate(
        () =>
          document.querySelector<SVGPolylineElement>(".overlay polyline.outline")!.points.length,
      );
      assert.ok(outlinePoints > 8, `the outline has ${outlinePoints} points`);
      await page.mouse.click(5, 5);
      await h.settled();
      // A rectangle around the connector alone, between api and db, selects it.
      const api = await page
        .locator('.content g[data-id="api"][data-role="element"]')
        .boundingBox();
      const db = await page.locator('.content g[data-id="db"][data-role="element"]').boundingBox();
      assert.ok(api && db);
      const top = Math.min(api.y, db.y) - 40;
      await page.mouse.move(api.x + api.width - 8, top);
      await page.mouse.down();
      await page.mouse.move(db.x + 8, Math.max(api.y + api.height, db.y + db.height) + 40, {
        steps: 5,
      });
      await page.mouse.up();
      await h.settled();
      assert.deepEqual(h.received.at(-1), { type: "select", ids: ["save"] });
    },
  },
  {
    name: "manages layers from the panel and hides one on the canvas",
    async run(h) {
      const page = h.page;
      await page.locator('.toolbar button[aria-label^="Show the layers"]').click();
      const panel = page.locator(".panel.layers");
      assert.equal(await panel.isVisible(), true);
      assert.deepEqual(await panel.locator(".layer .name").allTextContents(), ["main"]);
      // Add a layer and rename it by double-clicking its name.
      await panel.getByRole("button", { name: "Add a layer" }).click();
      await h.settled();
      assert.match(h.text, /\n {2}layers layer1, main\n/);
      await panel.locator('.layer[data-layer="layer1"] .name').dblclick();
      await panel.locator('.layer[data-layer="layer1"] input').fill("back");
      await page.keyboard.press("Enter");
      await h.settled();
      assert.match(h.text, /\n {2}layers back, main\n/);
      // Select api and move it to back; the panel counts it.
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      await panel.getByRole("combobox", { name: "Move the selection to…" }).selectOption("back");
      await h.settled();
      assert.match(h.text, /api\["API"\] \{ layer back \}/);
      assert.equal(await panel.locator('.layer[data-layer="back"] .count').textContent(), "1");
      assert.equal(
        await page.locator('.content g[data-id="api"]').getAttribute("data-layer"),
        "back",
      );
      // Hide back: api disappears from the canvas and from the selection.
      await panel.locator('.layer[data-layer="back"] .eye').click();
      assert.equal(
        await page.locator('.content g[data-id="api"]').evaluate((g) => g.style.visibility),
        "hidden",
      );
      assert.deepEqual(h.received.at(-1), { type: "select", ids: [] });
      await panel.locator('.layer[data-layer="back"] .eye').click();
      // Remove back: api returns to main and the statement goes.
      await panel.getByRole("button", { name: "Remove the layer back" }).click();
      await h.settled();
      assert.doesNotMatch(h.text, /layer back/);
      assert.doesNotMatch(h.text, /layers /);
      // L closes the panel.
      await page.locator(".stage").focus();
      await page.keyboard.press("l");
      assert.equal(await panel.isVisible(), false);
    },
  },
  {
    name: "creates icon shapes from the libraries panel, in a box when chosen, and drops one on a node",
    async run(h) {
      const page = h.page;
      const toggle = page.locator('.toolbar button[aria-label="Libraries"]');
      assert.equal(await toggle.getAttribute("title"), "Libraries (U)");
      await toggle.click();
      const panel = page.locator(".panel.library");
      assert.equal(await panel.isVisible(), true);
      // The placement control: the icon as the shape by default; flow diagrams have no icon alone.
      const placement = panel.getByRole("radiogroup", { name: "Insert as" });
      assert.deepEqual(await placement.getByRole("radio").allTextContents(), ["Icon", "In a box"]);
      assert.equal(
        await placement.getByRole("radio", { name: "Icon" }).getAttribute("aria-checked"),
        "true",
      );
      await panel.locator(".library-section h3", { hasText: "AWS Architecture Icons" }).waitFor();
      await panel.locator(".library-section .category", { hasText: "Compute" }).first().click();
      const lambda = panel.locator('.library-item[data-icon="aws:lambda"]');
      await lambda.waitFor();
      assert.equal(await lambda.locator(".thumb svg").count(), 1, "the thumbnail is drawn");
      await lambda.click();
      await h.settled();
      assert.match(
        h.text,
        /\n {2}lambda1\["AWS Lambda"\]\n {2}style lambda1 \{ icon "aws:lambda"; shape icon \}\n/,
      );
      assert.equal(
        await page.locator('.content g[data-id="lambda1"] g[data-role="icon"]').count(),
        1,
      );
      await page.screenshot({ path: join(output, "icons-library-panel.png") });
      // In a box: the next one holds the icon beside its label.
      await placement.getByRole("radio", { name: "In a box" }).click();
      await lambda.click();
      await h.settled();
      assert.match(
        h.text,
        /\n {2}lambda2\["AWS Lambda"\]\n {2}style lambda2 \{ icon "aws:lambda" \}\n/,
      );
      // Dragged onto a node, it gives the node its icon and creates nothing.
      const api = await h.centre("api");
      await dragTo(h, await middleOf(lambda), api, async () => {
        assert.equal(
          await page.locator('.overlay .highlight.drop[data-target="api"]').count(),
          1,
          "api is outlined as the target",
        );
      });
      assert.match(h.text, /style api \{ icon "aws:lambda" \}/);
      assert.doesNotMatch(h.text, /lambda3/);
      await panel.locator('input[type="search"]').fill("postgres");
      await panel.locator('.library-item[data-icon="logos:postgresql"]').waitFor();
      // U closes the panel.
      await page.locator(".stage").focus();
      await page.keyboard.press("u");
      assert.equal(await panel.isVisible(), false);
    },
  },
  {
    name: "icon picker: I gives the selected elements the icon chosen, in one undo step",
    async run(h) {
      const page = h.page;
      const api = await h.centre("api");
      const db = await h.centre("db");
      await page.mouse.click(api.x, api.y);
      await page.keyboard.down("Shift");
      await page.mouse.click(db.x, db.y);
      await page.keyboard.up("Shift");
      await h.settled();
      assert.deepEqual(h.session.selected, ["api", "db"]);
      await h.focusStage();
      await page.keyboard.press("i");
      const { picker, search, option } = iconPicker(page);
      await picker.waitFor();
      assert.equal(await picker.locator(".icon-picker-head").textContent(), "Icon of 2 elements");
      assert.equal(await picker.getByRole("radiogroup", { name: "Insert as" }).isVisible(), false);
      assert.equal(await search.evaluate((e) => e === document.activeElement), true);
      assert.equal(await search.getAttribute("aria-label"), "Search icons");
      // Before anything is typed: the Technology library's first category.
      await picker.locator(".icon-group-title", { hasText: "Technology" }).waitFor();
      await page.keyboard.type("server");
      await option("tabler:server").waitFor();
      assert.equal(await option("tabler:server").locator(".thumb svg").count(), 1);
      assert.equal(await option("tabler:server").locator(".name").textContent(), "server");
      await page.screenshot({ path: join(output, "icons-picker.png") });
      // The arrows move the active result while the search keeps the focus.
      const active = () =>
        picker.locator('[role="option"][aria-selected="true"]').getAttribute("data-reference");
      const first = await active();
      await page.keyboard.press("ArrowRight");
      assert.notEqual(await active(), first);
      await page.keyboard.press("ArrowLeft");
      assert.equal(await active(), first);
      assert.equal(await search.evaluate((e) => e === document.activeElement), true);
      const before = actions(h);
      await option("tabler:server").click();
      await h.settled();
      assert.equal(actions(h), before + 1, "one edit, one undo step");
      assert.match(h.text, /style api \{ icon "tabler:server" \}/);
      assert.match(h.text, /style db \{ icon "tabler:server" \}/);
      assert.equal(await closed(picker), true);
      assert.equal(
        await page.locator(".status").textContent(),
        "server is the icon of 2 elements.",
      );
      // The icon chosen comes first the next time, among the recent ones.
      await h.focusStage();
      await page.keyboard.press("i");
      await picker.waitFor();
      assert.equal(
        await picker
          .locator(".icon-group")
          .first()
          .locator(".icon-group-title span")
          .first()
          .textContent(),
        "Recent",
      );
      assert.equal(
        await picker
          .locator(".icon-group")
          .first()
          .locator('[role="option"]')
          .first()
          .getAttribute("data-reference"),
        "tabler:server",
      );
      // Escape closes it and gives the keyboard back to the canvas; the I button toggles it.
      await page.keyboard.press("Escape");
      assert.equal(await closed(picker), true);
      assert.equal(
        await page.evaluate(() => document.activeElement?.classList.contains("stage")),
        true,
        await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120) ?? ""),
      );
      const tool = page.locator('.toolbar button[data-tool="icon"]');
      assert.equal(await tool.isVisible(), true, "the I tool is on flow diagrams too");
      await tool.click();
      await picker.waitFor();
      await tool.click();
      assert.equal(await closed(picker), true);
    },
  },
  {
    name: "add icon: the dialog checks the files, leaves the unsafe and raster ones out, and places the new icon",
    project: true,
    async run(h) {
      const page = h.page;
      await h.focusStage();
      await page.keyboard.press("i");
      const { picker, option } = iconPicker(page);
      await picker.waitFor();
      const add = picker.getByRole("button", { name: "Add icon…" });
      await add.waitFor();
      const chooser = page.waitForEvent("filechooser");
      await add.click();
      await (
        await chooser
      ).setFiles([
        { name: "pin.svg", mimeType: "image/svg+xml", buffer: Buffer.from(PIN_SVG) },
        { name: "bad.svg", mimeType: "image/svg+xml", buffer: Buffer.from(SCRIPT_SVG) },
        { name: "photo.png", mimeType: "image/png", buffer: Buffer.from([137, 80, 78, 71]) },
      ]);
      const dialog = page.getByRole("dialog", { name: "Add icons to the project" });
      await dialog.waitFor();
      assert.equal(await closed(picker), true, "the picker gives way to the dialog");
      const confirm = dialog.getByRole("button", { name: "Add 1 icon" });
      await confirm.waitFor();
      await page.waitForFunction(
        () =>
          !(
            document.querySelector<HTMLButtonElement>(".add-icons button.primary")?.disabled ?? true
          ),
      );
      assert.equal(
        await dialog.getByRole("textbox", { name: "Name of pin.svg" }).inputValue(),
        "pin",
      );
      const rows = dialog.locator(".icon-row");
      assert.equal(await rows.count(), 3);
      assert.match(
        (await rows.nth(1).locator(".problem").textContent()) ?? "",
        /^Left out: .*script/,
      );
      assert.match((await rows.nth(2).locator(".problem").textContent()) ?? "", /added as images/);
      assert.equal(await rows.nth(0).locator(".thumb svg").count(), 1, "the icon is previewed");
      // A new pack: the licence is asked, own work first.
      const licence = dialog.getByRole("combobox", { name: "Licence of the new pack" });
      assert.equal(await licence.inputValue(), "LicenseRef-Project");
      await page.screenshot({ path: join(output, "add-icons-dialog.png") });
      // A prefix that is a built-in pack is refused inline, and nothing can be added.
      const prefix = dialog.getByRole("textbox", { name: "Pack" });
      await prefix.fill("tabler");
      await page.waitForFunction(() =>
        document
          .querySelector(".add-icons #mdg-add-icons-prefix-hint")
          ?.textContent?.includes("built-in"),
      );
      assert.equal(await dialog.locator("button.primary").isDisabled(), true);
      await prefix.fill("project");
      await page.waitForFunction(
        () =>
          !(
            document.querySelector<HTMLButtonElement>(".add-icons button.primary")?.disabled ?? true
          ),
      );
      await confirm.click();
      await h.settled();
      const sent = h.received.filter((m) => (m as { type: string }).type === "addIcons") as {
        prefix: string;
        licence?: string;
        files: { file: string; name: string }[];
        targets: string[];
      }[];
      assert.equal(sent.length, 1);
      assert.deepEqual(
        {
          prefix: sent[0]!.prefix,
          licence: sent[0]!.licence,
          files: sent[0]!.files.map((f) => [f.file, f.name]),
          targets: sent[0]!.targets,
        },
        {
          prefix: "project",
          licence: "LicenseRef-Project",
          files: [["pin.svg", "pin"]],
          targets: [],
        },
      );
      assert.equal(await closed(dialog), true);
      assert.match((await page.locator(".status").textContent()) ?? "", /project:pin/);
      // The tool is armed with the new icon: a click on the stage places it.
      const tool = page.locator('.toolbar button[data-tool="icon"]');
      assert.equal(await tool.getAttribute("aria-pressed"), "true");
      const at = await pageAt(h, "api", { x: 126, y: 112 }, 160, { x: 700, y: 260 });
      await page.mouse.click(at.x, at.y);
      await h.settled();
      assert.match(h.text, /style node1 \{ icon "project:pin"; shape icon \}/);
      // The picker lists it among the recent icons.
      await h.focusStage();
      await page.keyboard.press("Escape");
      await page.keyboard.press("i");
      await picker.waitFor();
      await option("project:pin").waitFor();
      await page.screenshot({ path: join(output, "add-icons-recent.png") });
    },
  },
  {
    name: "add icon: the icon added goes to the selected node in the same step; none outside a project",
    project: true,
    async run(h) {
      const page = h.page;
      const centre = await h.centre("api");
      await page.mouse.click(centre.x, centre.y);
      await h.settled();
      await page.keyboard.press("i");
      const { picker } = iconPicker(page);
      await picker.waitFor();
      const chooser = page.waitForEvent("filechooser");
      await picker.getByRole("button", { name: "Add icon…" }).click();
      await (
        await chooser
      ).setFiles([
        { name: "My Logo (1).svg", mimeType: "image/svg+xml", buffer: Buffer.from(PIN_SVG) },
      ]);
      const dialog = page.getByRole("dialog", { name: "Add icons to the project" });
      await dialog.waitFor();
      const name = dialog.getByRole("textbox", { name: "Name of My Logo (1).svg" });
      await page.waitForFunction(
        () =>
          !(
            document.querySelector<HTMLButtonElement>(".add-icons button.primary")?.disabled ?? true
          ),
      );
      assert.equal(await name.inputValue(), "My-Logo-1");
      // A name a reference cannot write is refused as it is typed.
      await name.fill("my logo");
      await page.waitForFunction(() =>
        document
          .querySelector(".add-icons .icon-row .problem")
          ?.textContent?.includes("cannot be written"),
      );
      assert.equal(await dialog.locator("button.primary").isDisabled(), true);
      await name.fill("logo");
      await page.waitForFunction(
        () =>
          !(
            document.querySelector<HTMLButtonElement>(".add-icons button.primary")?.disabled ?? true
          ),
      );
      await dialog.getByRole("button", { name: "Add 1 icon" }).click();
      await h.settled();
      assert.match(h.text, /style api \{ icon "project:logo" \}/);
      assert.deepEqual(h.session.selected, ["api"]);
      // Outside a project the picker offers no Add icon….
      h.session = new CanvasSession({ grid: 14 });
      await h.reload();
      await h.focusStage();
      await page.keyboard.press("i");
      await picker.waitFor();
      assert.equal(await picker.getByRole("button", { name: "Add icon…" }).count(), 0);
    },
  },
  {
    name: "icon picker: places AWS Lambda as the shape with the tool, then in a box by a drag",
    async run(h) {
      const page = h.page;
      await h.focusStage();
      await page.keyboard.press("i");
      const { picker, search, option } = iconPicker(page);
      await picker.waitFor();
      const placement = picker.getByRole("radiogroup", { name: "Insert as" });
      assert.deepEqual(
        await placement
          .getByRole("radio")
          .evaluateAll((els) => els.map((e) => [e.textContent, e.getAttribute("aria-checked")])),
        [
          ["Icon", "true"],
          ["In a box", "false"],
        ],
      );
      await page.keyboard.type("lambda");
      const lambda = option("aws:lambda");
      await lambda.waitFor();
      assert.equal(await lambda.locator(".name").textContent(), "AWS Lambda");
      await lambda.click();
      assert.equal(await closed(picker), true);
      const tool = page.locator('.toolbar button[data-tool="icon"]');
      assert.equal(await tool.getAttribute("aria-pressed"), "true");
      // The ghost is the icon in its square; a click places it, in one edit.
      const at = await pageAt(h, "api", { x: 126, y: 112 }, 160, { x: 700, y: 260 });
      await page.mouse.move(at.x, at.y);
      await page.mouse.move(at.x + 1, at.y);
      await page.mouse.move(at.x, at.y);
      assert.equal(
        await page.locator('.overlay .ghost-icon[data-placement="icon"] svg').count(),
        1,
        "the ghost shows the icon",
      );
      await page.screenshot({ path: join(output, "icons-tool-ghost.png") });
      const before = actions(h);
      await page.mouse.click(at.x, at.y);
      await h.settled();
      assert.equal(actions(h), before + 1);
      assert.match(
        h.text,
        /\n {2}node1\[""\]\n {2}style node1 \{ icon "aws:lambda"; shape icon \}\n/,
      );
      assert.deepEqual(h.place("node1"), { x: 700, y: 266 });
      assert.equal(await tool.getAttribute("aria-pressed"), "false");
      assert.equal(await page.locator(".inline").count(), 0, "no editor opens on it");
      // In a box, chosen in the control and kept: a result dragged onto the empty stage.
      await h.focusStage();
      await page.keyboard.press("Escape");
      await h.settled();
      await page.keyboard.press("i");
      await picker.waitFor();
      await placement.getByRole("radio", { name: "In a box" }).click();
      await search.fill("lambda");
      await lambda.waitFor();
      const to = await pageAt(h, "api", { x: 126, y: 112 }, 160, { x: 700, y: 420 });
      await dragTo(h, await middleOf(lambda), to, async () => {
        assert.equal(await page.locator('.overlay .ghost-icon[data-placement="box"]').count(), 1);
        assert.equal(await page.locator(".icon-drag").count(), 1);
      });
      assert.match(h.text, /\n {2}node2\[""\]\n {2}style node2 \{ icon "aws:lambda" \}\n/);
      assert.equal(await closed(picker), true, "the drop closes the picker");
      assert.equal(await page.locator(".icon-drag").count(), 0);
      // The libraries panel shows the same choice.
      await page.locator('.toolbar button[aria-label="Libraries"]').click();
      assert.equal(
        await page
          .locator(".panel.library")
          .getByRole("radio", { name: "In a box" })
          .getAttribute("aria-checked"),
        "true",
      );
    },
  },
  {
    name: "icon picker: the armed tool clicked on a box gives it the icon, outlined under the pointer",
    async run(h) {
      const page = h.page;
      await h.focusStage();
      await page.keyboard.press("i");
      const { picker, option } = iconPicker(page);
      await picker.waitFor();
      await page.keyboard.type("bolt");
      await option("tabler:bolt").click();
      assert.equal(await closed(picker), true);
      const cache = await h.centre("cache");
      await page.mouse.move(cache.x, cache.y);
      await page.mouse.move(cache.x + 1, cache.y);
      assert.equal(
        await page.locator('.overlay .highlight.drop[data-target="cache"]').count(),
        1,
        "the box is outlined, with no ghost",
      );
      assert.equal(await page.locator(".overlay .ghost-icon").count(), 0);
      await page.mouse.click(cache.x, cache.y);
      await h.settled();
      assert.equal(
        h.text.replace(/\n {2}style cache \{ icon "tabler:bolt" \}/, ""),
        SHEET,
        "the icon only",
      );
      assert.match(h.text, /style cache \{ icon "tabler:bolt" \}/);
    },
  },
  {
    name: "icon picker: the context menu opens at the pointer beside the Libraries panel",
    async run(h) {
      const page = h.page;
      await page.locator('.toolbar button[aria-label="Libraries"]').click();
      await page.locator(".panel.library").waitFor();
      await h.settled();
      const cache = await h.centre("cache");
      await page.mouse.click(cache.x, cache.y, { button: "right" });
      const menu = page.getByRole("menu", { name: "Canvas actions" });
      await menu.waitFor();
      const box = (await menu.boundingBox())!;
      assert.ok(Math.abs(box.x - cache.x) <= 2, `the menu is at the pointer: ${box.x}, ${cache.x}`);
      await menu.getByRole("menuitem", { name: "Icon…" }).click();
      const { picker } = iconPicker(page);
      await picker.waitFor();
      const opened = (await picker.boundingBox())!;
      assert.ok(
        opened.x <= cache.x + 2 && opened.x + opened.width >= cache.x,
        "the picker opens where the menu was, kept inside the window",
      );
    },
  },
  {
    name: "icon picker: a result dropped onto a box gives it the icon, the box outlined meanwhile",
    async run(h) {
      const page = h.page;
      await h.focusStage();
      await page.keyboard.press("i");
      const { picker, option } = iconPicker(page);
      await picker.waitFor();
      await page.keyboard.type("database");
      await option("tabler:database").waitFor();
      const db = await h.centre("db");
      await dragTo(h, await middleOf(option("tabler:database")), db, async () => {
        assert.equal(await page.locator('.overlay .highlight.drop[data-target="db"]').count(), 1);
        assert.equal(await page.locator(".icon-drag.onto").count(), 1);
        await page.screenshot({ path: join(output, "icons-drop-onto-box.png") });
      });
      assert.equal(
        h.text.replace(/\n {2}style db \{ icon "tabler:database" \}/, ""),
        SHEET,
        "only the icon is written",
      );
      assert.match(h.text, /style db \{ icon "tabler:database" \}/);
      // Escape during a drag drops nothing.
      await h.focusStage();
      await page.keyboard.press("i");
      await picker.waitFor();
      await page.keyboard.type("database");
      await option("tabler:database").waitFor();
      const before = h.text;
      const from = await middleOf(option("tabler:database"));
      const api = await h.centre("api");
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(api.x, api.y, { steps: 6 });
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await h.settled();
      assert.equal(h.text, before);
      assert.equal(await page.locator(".icon-drag").count(), 0);
    },
  },
  {
    name: "icon picker: Icon… and Remove icon in the context menu",
    text: ICONED,
    async run(h) {
      const page = h.page;
      const db = await h.centre("db");
      await page.mouse.click(db.x, db.y, { button: "right" });
      const menu = page.getByRole("menu", { name: "Canvas actions" });
      await menu.waitFor();
      assert.equal(await menu.getByRole("menuitem", { name: "Icon…" }).count(), 1);
      await page.screenshot({ path: join(output, "icons-context-menu.png") });
      await menu.getByRole("menuitem", { name: "Remove icon" }).click();
      await h.settled();
      assert.match(h.text, /style db \{ fill "#eef" \}/);
      assert.doesNotMatch(h.text, /tabler:database/);
      assert.equal(await page.locator(".status").textContent(), "Removed the icon of db.");
      // An element without an icon is offered Icon… only, which opens the picker on it.
      const cache = await h.centre("cache");
      await page.mouse.click(cache.x, cache.y, { button: "right" });
      await menu.waitFor();
      assert.equal(await menu.getByRole("menuitem", { name: "Remove icon" }).count(), 0);
      await menu.getByRole("menuitem", { name: "Icon…" }).click();
      const { picker, option } = iconPicker(page);
      await picker.waitFor();
      assert.equal(await picker.locator(".icon-picker-head").textContent(), "Icon of cache");
      await page.keyboard.type("bolt");
      await option("tabler:bolt").click();
      await h.settled();
      assert.match(h.text, /style cache \{ icon "tabler:bolt" \}/);
    },
  },
  {
    name: "icon picker: Icon position and Label position by their pictures, Icon size auto and Clear",
    text: ICONED,
    async run(h) {
      const page = h.page;
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      const field = page.locator('[data-field="style.icon"]');
      assert.equal(await field.locator(".icon-name").textContent(), "server");
      assert.equal(await field.locator(".icon-reference").textContent(), "tabler:server");
      const position = page.getByRole("radiogroup", { name: "Icon position" });
      assert.deepEqual(
        await position
          .getByRole("radio")
          .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label"))),
        ["Default: left", "left", "right", "top", "bottom", "centre"],
      );
      assert.equal(
        await position.locator('svg[data-glyph="iconPosition:center"]').count(),
        1,
        "drawn as pictures",
      );
      // Label position is offered only when the icon is the centre piece.
      assert.equal(await page.getByRole("radiogroup", { name: "Label position" }).count(), 0);
      await page
        .locator('[data-field="style.iconPosition"]')
        .screenshot({ path: join(output, "icons-field-iconPosition.png") });
      await position.getByRole("radio", { name: "right" }).click();
      await h.settled();
      assert.match(h.text, /style api \{ icon "tabler:server"; iconPosition right \}/);
      await page
        .getByRole("radiogroup", { name: "Icon position" })
        .getByRole("radio", { name: "centre" })
        .click();
      await h.settled();
      assert.match(h.text, /iconPosition center/);
      const label = page.getByRole("radiogroup", { name: "Label position" });
      assert.equal(await label.isVisible(), true);
      assert.equal(
        await page.locator('[data-field="style.labelPosition"] .value').textContent(),
        "bottom (default)",
      );
      await label.getByRole("radio", { name: "top" }).click();
      await h.settled();
      assert.match(h.text, /labelPosition top/);
      // Icon size: a number with a slider, auto one click away, Clear takes it away.
      const size = page.locator("#mdg-field-style-iconSize");
      assert.notEqual(await size.getAttribute("placeholder"), "", "the drawn size, greyed");
      await size.fill("48");
      await size.press("Enter");
      await h.settled();
      assert.match(h.text, /iconSize 48/);
      const sizeField = page.locator('[data-field="style.iconSize"]');
      await page.screenshot({ path: join(output, "icons-inspector.png") });
      for (const name of ["style.icon", "style.labelPosition", "style.iconSize"]) {
        await page
          .locator(`[data-field="${name}"]`)
          .screenshot({ path: join(output, `icons-field-${name.slice(6)}.png`) });
      }
      await sizeField.getByRole("button", { name: "Auto" }).click();
      await h.settled();
      assert.match(h.text, /iconSize auto/);
      assert.equal(await page.locator("#mdg-field-style-iconSize").inputValue(), "auto");
      assert.equal(
        await page
          .locator('[data-field="style.iconSize"]')
          .getByRole("button", { name: "Auto" })
          .getAttribute("aria-pressed"),
        "true",
      );
      await page
        .locator('[data-field="style.iconSize"]')
        .getByRole("button", { name: "Clear" })
        .click();
      await h.settled();
      assert.doesNotMatch(h.text, /iconSize/);
    },
  },
  {
    name: "icon picker: free compositions place the icon alone with Enter, at the centre",
    text: FREE,
    async run(h) {
      const page = h.page;
      await h.focusStage();
      await page.keyboard.press("i");
      const { picker, search, option } = iconPicker(page);
      await picker.waitFor();
      await picker.getByRole("radio", { name: "Only the icon" }).click();
      await search.fill("server");
      await option("tabler:server").waitFor();
      await search.press("Enter");
      await h.settled();
      assert.match(h.text, /\n {2}icon icon1 "tabler:server"\n/);
      assert.match(h.text, /place icon1 at \(/);
      assert.equal(await closed(picker), true);
    },
  },
  {
    name: "icon shapes: selected and connected on their square, the label under it a part of them",
    text: ICON_SHAPE,
    async run(h) {
      const page = h.page;
      const drawn = await boxOf(h, "fn");
      // The label lies under the square: a press on it selects fn.
      const label = { x: drawn.x + drawn.width / 2, y: drawn.y + drawn.height - 4 };
      await page.mouse.click(label.x, label.y);
      await h.settled();
      assert.deepEqual(h.session.selected, ["fn"]);
      const outline = (await page.locator(".overlay rect.outline.primary").boundingBox())!;
      assert.ok(Math.abs(outline.width - outline.height) < 1, "the outline is the icon's square");
      assert.ok(outline.y + outline.height < label.y, "the square is above the label");
      const labelled = (await page.locator(".overlay rect.label-outline").boundingBox())!;
      assert.equal(await page.locator('.overlay [data-handle^="resize:"]').count(), 8);
      // The handle on the label's side lies past the label, not on its text.
      const south = await middleOf(page.locator('.overlay [data-handle="connect:south"]'));
      assert.ok(south.y > labelled.y + labelled.height, "the south handle is under the label");
      await page.screenshot({ path: join(output, "icons-shape-selected.png") });
      // A line dragged from api's east handle onto fn's label connects to fn.
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      const east = await middleOf(page.locator('.overlay [data-handle="connect:east"]'));
      await dragTo(h, east, label, async () => {
        assert.equal(
          await page.locator('.overlay .highlight[data-target="fn"]').count(),
          1,
          "fn is the target",
        );
      });
      assert.match(h.text, /\n {2}api -> fn\n/);
      assert.doesNotMatch(h.text, /route/);
      await page.screenshot({ path: join(output, "icons-shape-connected.png") });
    },
  },
  {
    name: "icon shapes: the acceptance sheet with labels on every side, in the dark",
    text: ICON_SHEET,
    async run(h) {
      const page = h.page;
      await h.focusStage();
      await page.keyboard.press("Shift+Digit1");
      await h.settled();
      await page.screenshot({ path: join(output, "icons-sheet.png") });
      const checkout = await h.centre("checkout");
      await page.mouse.click(checkout.x, checkout.y);
      await h.settled();
      assert.deepEqual(h.session.selected, ["checkout"]);
      await page.screenshot({ path: join(output, "icons-sheet-selected.png") });
    },
  },
  {
    name: "icon picker: the dark theme, the picker on a selection and the inspector's icon fields",
    text: ICONED,
    theme: DARK,
    async run(h) {
      const page = h.page;
      const db = await h.centre("db");
      await page.mouse.click(db.x, db.y);
      await h.settled();
      await page
        .locator('[data-field="style.icon"]')
        .getByRole("button", { name: "Choose…" })
        .click();
      const { picker, option } = iconPicker(page);
      await picker.waitFor();
      await page.keyboard.type("data");
      await option("tabler:database").waitFor();
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(output, "icons-picker-dark.png") });
      await page.keyboard.press("Escape");
      assert.equal(await closed(picker), true);
      await page.screenshot({ path: join(output, "icons-inspector-dark.png") });
      // Without a selection: the placement control.
      await h.focusStage();
      await page.keyboard.press("Escape");
      await h.settled();
      await page.keyboard.press("i");
      await picker.waitFor();
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(output, "icons-picker-placement-dark.png") });
    },
  },
  {
    name: "icon picker: speaks Spanish",
    text: FREE,
    lang: "es",
    async run(h) {
      const page = h.page;
      await h.focusStage();
      await page.keyboard.press("i");
      const { picker, search } = iconPicker(page, "Iconos");
      await picker.waitFor();
      assert.equal(await search.getAttribute("aria-label"), "Buscar iconos");
      assert.deepEqual(
        await picker
          .getByRole("radiogroup", { name: "Insertar como" })
          .getByRole("radio")
          .allTextContents(),
        ["Icono", "En una caja", "Solo el icono"],
      );
      assert.match(
        (await picker.locator(".icon-picker-foot").textContent()) ?? "",
        /Entrar lo pone en el centro/,
      );
      await page.screenshot({ path: join(output, "icons-picker-es.png") });
      await page.keyboard.press("Escape");
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y, { button: "right" });
      const menu = page.getByRole("menu", { name: "Acciones del lienzo" });
      await menu.waitFor();
      assert.equal(await menu.getByRole("menuitem", { name: "Icono…" }).count(), 1);
    },
  },
  {
    name: "icon picker: a pointer resting over the results leaves Enter to the first result",
    async run(h) {
      const page = h.page;
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      await h.focusStage();
      await page.keyboard.press("i");
      const { picker, option } = iconPicker(page);
      await picker.waitFor();
      await picker.locator(".icon-group-title", { hasText: "Technology" }).waitFor();
      const active = () =>
        picker.locator('[role="option"][aria-selected="true"]').getAttribute("data-reference");
      const first = () => picker.locator('[role="option"]').first().getAttribute("data-reference");
      // The pointer moves onto the results: the result under it becomes the active one.
      const results = (await picker.locator(".icon-results").boundingBox())!;
      const rest = { x: results.x + results.width * 0.7, y: results.y + 96 };
      await page.mouse.move(rest.x - 6, rest.y);
      await page.mouse.move(rest.x, rest.y);
      const hovered = await active();
      assert.notEqual(hovered, await first(), "a real move makes the result under it active");
      // It rests there while a query is typed: the new results start from their first one.
      await page.keyboard.type("server");
      await option("tabler:server").waitFor();
      await h.settled();
      assert.equal(await first(), "tabler:server");
      assert.equal(await active(), "tabler:server", "the results drawn under it do not take it");
      await page.keyboard.press("Enter");
      await h.settled();
      assert.match(h.text, /style api \{ icon "tabler:server" \}/);
      assert.equal(await closed(picker), true);
    },
  },
  {
    name: "icon picker: Enter places the icon at the centre and the canvas keeps the keyboard",
    async run(h) {
      const page = h.page;
      await h.focusStage();
      await page.keyboard.press("i");
      const { picker, search, option } = iconPicker(page);
      await picker.waitFor();
      // I in the search field is a letter of the query: the picker stays open.
      await page.keyboard.press("i");
      assert.equal(await search.inputValue(), "i");
      assert.equal(await picker.isVisible(), true);
      await search.fill("server");
      await option("tabler:server").waitFor();
      await page.keyboard.press("Enter");
      await h.settled();
      assert.match(
        h.text,
        /\n {2}node1\[""\]\n {2}style node1 \{ icon "tabler:server"; shape icon \}/,
      );
      assert.equal(await closed(picker), true);
      assert.equal(
        await page.evaluate(() => document.activeElement?.classList.contains("stage")),
        true,
        "the stage has the keyboard",
      );
      // The keys act on the new element at once: an arrow moves it.
      assert.deepEqual(h.session.selected, ["node1"]);
      const placed = h.place("node1");
      await page.keyboard.press("ArrowRight");
      await h.settled();
      assert.ok(h.place("node1").x > placed.x, "the arrow moved node1");
    },
  },
  {
    name: "icon picker: a press on its head, a group title or its foot keeps the keyboard; Escape always closes it",
    async run(h) {
      const page = h.page;
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      await h.focusStage();
      await page.keyboard.press("i");
      const { picker, search } = iconPicker(page);
      await picker.waitFor();
      await picker.locator(".icon-group-title", { hasText: "Technology" }).waitFor();
      const focused = () => search.evaluate((e) => e === document.activeElement);
      for (const part of [".icon-picker-head", ".icon-group-title", ".icon-picker-foot"]) {
        await picker.locator(part).first().click();
        assert.equal(await focused(), true, `the search keeps the focus after a press on ${part}`);
        assert.equal(await picker.isVisible(), true);
      }
      await page.keyboard.type("db");
      assert.equal(await search.inputValue(), "db");
      await page.keyboard.press("Escape");
      assert.equal(await closed(picker), true);
      // With the focus lost to the page all the same, Escape still closes it.
      await h.focusStage();
      await page.keyboard.press("i");
      await picker.waitFor();
      await search.evaluate((e) => e.blur());
      assert.equal(await picker.isVisible(), true);
      await page.keyboard.press("Escape");
      assert.equal(await closed(picker), true);
    },
  },
  {
    name: "icon picker: Choose… toggles it and gets the focus back after renders while it is open",
    async run(h) {
      const page = h.page;
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      const choose = page.locator('[data-key="style.icon:choose"]');
      const { picker, option } = iconPicker(page);
      // A render while the picker is open, as a pack arriving or another person's edit makes: the
      // inspector is drawn again, its Choose… a new button.
      let edits = 0;
      const render = async () => {
        await choose.evaluate((e) => e.setAttribute("data-old", ""));
        edits++;
        await h.type(h.text.replace(/cache\["Cache[^"]*"\]/, `cache["Cache ${edits}"]`));
        assert.equal(await page.locator("[data-old]").count(), 0, "the inspector was drawn again");
      };
      await choose.click();
      await picker.waitFor();
      await render();
      assert.equal(await choose.getAttribute("aria-expanded"), "true");
      await choose.click();
      assert.equal(await closed(picker), true, "the new Choose… closes it");
      assert.equal(await choose.getAttribute("aria-expanded"), "false");
      await choose.click();
      await picker.waitFor();
      await render();
      await page.keyboard.press("Escape");
      assert.equal(await closed(picker), true);
      assert.equal(
        await page.evaluate(() => document.activeElement?.getAttribute("data-key")),
        "style.icon:choose",
        "Escape gives the focus to Choose…",
      );
      await choose.click();
      await picker.waitFor();
      await render();
      await page.keyboard.type("bolt");
      await option("tabler:bolt").click();
      await h.settled();
      assert.match(h.text, /style api \{ icon "tabler:bolt" \}/);
      assert.equal(
        await page.evaluate(() => document.activeElement?.getAttribute("data-key")),
        "style.icon:choose",
        "the field keeps the keyboard after a choice",
      );
    },
  },
  {
    name: "icon picker: names break between words, a long one cut with an ellipsis, the whole name in its title",
    async run(h) {
      const page = h.page;
      await h.focusStage();
      await page.keyboard.press("i");
      const { picker, option } = iconPicker(page);
      await picker.waitFor();
      await picker.locator(".icon-group-title", { hasText: "Technology" }).waitFor();
      await page.waitForTimeout(400);
      await picker.screenshot({ path: join(output, "icons-picker-names.png") });
      // Narrower, as a wider font or a narrow window makes it: words longer than a result.
      await picker.evaluate((e) => (e.style.width = "300px"));
      await page.waitForTimeout(100);
      await picker.screenshot({ path: join(output, "icons-picker-names-narrow.png") });
      // No word is split over two lines: each one lies on a single line box.
      const split = await picker.locator(".icon-option .name").evaluateAll((names) =>
        names.flatMap((name) => {
          const text = name.textContent ?? "";
          const words: string[] = [];
          const walker = document.createTreeWalker(name, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            for (const match of (node.textContent ?? "").matchAll(/\S+/g)) {
              const range = document.createRange();
              range.setStart(node, match.index ?? 0);
              range.setEnd(node, (match.index ?? 0) + match[0].length);
              const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
              if (tops.size > 1) words.push(`${match[0]} in ${text}`);
            }
          }
          return words;
        }),
      );
      assert.deepEqual(split, [], "words broken over two lines");
      // A name cut short is whole in the result's title.
      const titled = await picker
        .locator(".icon-option")
        .evaluateAll((options) =>
          options.every((o) =>
            (o.getAttribute("title") ?? "").startsWith(
              o.querySelector(".name")?.textContent ?? "-",
            ),
          ),
        );
      assert.equal(titled, true);
      await page.keyboard.type("server");
      await option("tabler:server").waitFor();
    },
  },
  {
    name: "icon shapes: an outline icon is selected and dragged anywhere on its square, in the canvas only",
    text: OUTLINE_ICON,
    async run(h) {
      const page = h.page;
      const drawn = (await page
        .locator('.content g[data-id="fn"] g[data-role="icon"]')
        .boundingBox())!;
      // Inside the server's upper bar, between its strokes: nothing of the icon is painted there.
      const inside = { x: drawn.x + drawn.width / 2, y: drawn.y + drawn.height / 4 };
      assert.equal(
        await page.evaluate(
          ({ x, y }) => document.elementFromPoint(x, y)?.closest("path") === null,
          inside,
        ),
        true,
        "the point lies between the strokes",
      );
      await page.mouse.click(inside.x, inside.y);
      await h.settled();
      assert.deepEqual(h.session.selected, ["fn"]);
      await page.screenshot({ path: join(output, "icons-shape-outline-selected.png") });
      // A press there and a drag move fn, not a rubber band.
      const before = h.place("fn");
      await dragTo(h, inside, { x: inside.x + 84, y: inside.y + 42 });
      const after = h.place("fn");
      assert.ok(
        after.x - before.x >= 56 && after.y - before.y >= 28,
        `fn moved: ${after.x}, ${after.y}`,
      );
      assert.deepEqual(h.session.selected, ["fn"]);
      // The hit area is the canvas's own: the drawing the session sends has none.
      assert.equal(await page.locator(".content .mdg-hit").count(), 1);
      assert.equal(await page.locator(".minimap .mdg-hit").count(), 0);
      assert.doesNotMatch(await page.locator(".minimap").evaluate((e) => e.innerHTML), /mdg-hit/);
    },
  },
  {
    name: "icon objects: an outline icon of a free composition is selected and dragged on its square",
    text: OUTLINE_OBJECT,
    async run(h) {
      const page = h.page;
      const drawn = (await page
        .locator('.content g[data-id="srv"] g[data-role="icon"], .content g[data-id="srv"] svg')
        .first()
        .boundingBox())!;
      const inside = { x: drawn.x + drawn.width / 2, y: drawn.y + drawn.height / 4 };
      await page.mouse.click(inside.x, inside.y);
      await h.settled();
      assert.deepEqual(h.session.selected, ["srv"]);
      const before = h.place("srv");
      await dragTo(h, inside, { x: inside.x - 70, y: inside.y + 56 });
      const after = h.place("srv");
      assert.ok(
        before.x - after.x >= 42 && after.y - before.y >= 28,
        `srv moved: ${after.x}, ${after.y}`,
      );
    },
  },
  {
    name: "libraries: dragging an element selects no text on the way",
    async run(h) {
      const page = h.page;
      await page.locator('.toolbar button[aria-label="Libraries"]').click();
      const panel = page.locator(".panel.library");
      await panel.locator('input[type="search"]').fill("lambda");
      const lambda = panel.locator('.library-item[data-icon="aws:lambda"]').first();
      await lambda.waitFor();
      const selected = () => page.evaluate(() => document.getSelection()?.toString() ?? "");
      const api = await h.centre("api");
      await dragTo(h, await middleOf(lambda), api, async () => {
        assert.equal(await selected(), "", "no text is selected while dragging");
        await page.screenshot({ path: join(output, "icons-library-drag.png") });
      });
      assert.equal(await selected(), "");
      assert.match(h.text, /style api \{ icon "aws:lambda" \}/);
      // The keyboard still reaches the elements: Enter on one creates it.
      await lambda.focus();
      await page.keyboard.press("Enter");
      await h.settled();
      assert.match(h.text, /lambda1\["AWS Lambda"\]/);
    },
  },
  {
    name: "inspector: Enter then Tab writes a number once, with no conflict said (icon size, corner radius)",
    text: ICONED,
    async run(h) {
      const page = h.page;
      const writes = (field: string) =>
        h.received.filter((m) => {
          const action = (m as { type: string; action?: { kind: string; field?: string } }).action;
          return action?.kind === "setField" && action.field === field;
        }).length;
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      const size = page.locator("#mdg-field-style-iconSize");
      await size.fill("48");
      await size.press("Enter");
      await page.keyboard.press("Tab");
      await h.settled();
      assert.match(h.text, /iconSize 48/);
      assert.equal(writes("style.iconSize"), 1, "one write");
      assert.equal(await page.locator(".status.error").count(), 0, "no error is said");
      // Corner radius, a number field of its own, does the same.
      const cache = await h.centre("cache");
      await page.mouse.click(cache.x, cache.y);
      await h.settled();
      const radius = page.locator("#mdg-field-style-radius");
      await radius.fill("6");
      await radius.press("Enter");
      await page.keyboard.press("Tab");
      await h.settled();
      assert.match(h.text, /style cache \{ radius 6 \}/);
      assert.equal(writes("style.radius"), 1, "one write");
      assert.equal(await page.locator(".status.error").count(), 0, "no error is said");
      // Enter alone, the render then drawing the field again, writes once too.
      await radius.fill("8");
      await radius.press("Enter");
      await h.settled();
      await page.locator(".stage").focus();
      await h.settled();
      assert.equal(writes("style.radius"), 2);
      assert.equal(await page.locator(".status.error").count(), 0);
    },
  },
  {
    name: "inspector: an icon no pack has says so instead of loading forever",
    text: CENTRED_ICON,
    async run(h) {
      const page = h.page;
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      // The icon's name is mistyped: the drawing waits for the text to be fixed, the field tells.
      await h.type(h.text.replace("tabler:server", "tabler:no-such-icon"));
      const field = page.locator('[data-field="style.icon"]');
      const thumb = field.locator(".icon-thumb");
      await page.waitForTimeout(300);
      assert.equal(await thumb.evaluate((e) => e.classList.contains("loading")), false);
      assert.equal(await thumb.evaluate((e) => e.classList.contains("missing")), true);
      assert.equal(await thumb.evaluate((e) => e.getAnimations().length), 0, "no shimmer");
      assert.match((await field.textContent()) ?? "", /not found/i);
      await field.screenshot({ path: join(output, "icons-field-missing.png") });
    },
  },
  {
    name: "inspector: Icon position and Label position fit their rows in Spanish",
    text: CENTRED_ICON,
    lang: "es",
    async run(h) {
      const page = h.page;
      const db = await h.centre("db");
      await page.mouse.click(db.x, db.y);
      await h.settled();
      for (const name of ["style.iconPosition", "style.labelPosition"]) {
        const field = page.locator(`[data-field="${name}"]`);
        await field.screenshot({ path: join(output, `icons-field-es-${name.slice(6)}.png`) });
        const tops = await field
          .getByRole("radio")
          .evaluateAll((chips) => chips.map((c) => Math.round(c.getBoundingClientRect().top)));
        assert.equal(new Set(tops).size, 1, `${name}: every picture on one row: ${tops.join()}`);
        const value = field.locator(".row-label .value");
        assert.equal(
          await value.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
          true,
          `${name}: the value is not cut: ${await value.textContent()}`,
        );
      }
      assert.equal(
        await page.locator('[data-field="style.labelPosition"] .row-label .value').textContent(),
        "abajo (predeterminado)",
      );
      await page.locator(".inspector").screenshot({ path: join(output, "icons-inspector-es.png") });
      // Two elements with icons in different places: the default chip still fits the row.
      const api = await h.centre("api");
      await page.keyboard.down("Shift");
      await page.mouse.click(api.x, api.y);
      await page.keyboard.up("Shift");
      await h.settled();
      const mixed = page.locator('[data-field="style.iconPosition"]');
      await mixed.screenshot({ path: join(output, "icons-field-es-iconPosition-mixed.png") });
      const tops = await mixed
        .getByRole("radio")
        .evaluateAll((chips) => chips.map((c) => Math.round(c.getBoundingClientRect().top)));
      assert.equal(new Set(tops).size, 1, `mixed: every picture on one row: ${tops.join()}`);
    },
  },
  {
    name: "icon picker: on a short canvas it fits the room it has, the foot in view",
    async run(h) {
      const page = h.page;
      await page.setViewportSize({ width: 900, height: 280 });
      await h.settled();
      await h.focusStage();
      await page.keyboard.press("i");
      const { picker } = iconPicker(page);
      await picker.waitFor();
      await picker.locator(".icon-group-title").first().waitFor();
      await page.waitForTimeout(300);
      const main = (await page.locator(".main").boundingBox())!;
      const box = (await picker.boundingBox())!;
      assert.ok(box.y >= main.y - 1, `the top in the main area: ${box.y}`);
      assert.ok(
        box.y + box.height <= main.y + main.height + 1,
        `the bottom in the main area: ${box.y + box.height} > ${main.y + main.height}`,
      );
      const foot = (await picker.locator(".icon-picker-foot").boundingBox())!;
      assert.ok(foot.y + foot.height <= 280, "the foot is in view");
      await page.screenshot({ path: join(output, "icons-picker-short.png") });
    },
  },
  {
    name: "context menu: on a short canvas it scrolls inside the window and the keys reach every item (dark)",
    text: ICONED,
    theme: DARK,
    async run(h) {
      const page = h.page;
      await page.setViewportSize({ width: 1100, height: 520 });
      await h.settled();
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y, { button: "right" });
      const menu = page.getByRole("menu", { name: "Canvas actions" });
      await menu.waitFor();
      await page.waitForTimeout(250);
      const main = (await page.locator(".main").boundingBox())!;
      const box = (await menu.boundingBox())!;
      assert.ok(box.y >= main.y - 1, `the top in the main area: ${box.y}`);
      assert.ok(
        box.y + box.height <= main.y + main.height + 1,
        `the bottom in the main area: ${box.y + box.height} > ${main.y + main.height}`,
      );
      assert.equal(
        await menu.evaluate((e) => e.scrollHeight > e.clientHeight),
        true,
        "the menu scrolls",
      );
      await page.screenshot({ path: join(output, "context-menu-short.png") });
      // Up from the first item goes to the last one, scrolled into view.
      await page.keyboard.press("ArrowUp");
      const last = menu.locator('[role="menuitem"]:focus');
      assert.equal(
        await last.textContent(),
        await menu.locator('[role="menuitem"]:not([aria-disabled="true"])').last().textContent(),
      );
      const item = (await last.boundingBox())!;
      const shown = (await menu.boundingBox())!;
      assert.ok(
        item.y >= shown.y - 1 && item.y + item.height <= shown.y + shown.height + 1,
        "the last item is in view",
      );
      await page.screenshot({ path: join(output, "context-menu-short-last.png") });
      await page.keyboard.press("Escape");
      assert.equal(await closed(menu), true);
    },
  },
  {
    name: "motion: menus and the shapes grid open with a transition, interactive at once, and none under reduced motion",
    text: FREE,
    async run(h) {
      const page = h.page;
      const arrow = page.locator('.toolbar .split-arrow[data-shapes="box"]');
      const grid = page.getByRole("dialog", { name: "Shapes" });
      const timing = (locator: Locator) =>
        locator.evaluate((e) => {
          const style = getComputedStyle(e);
          return {
            property: style.transitionProperty,
            duration: style.transitionDuration,
            running: e.getAnimations().length,
            opacity: style.opacity,
          };
        });
      await arrow.click();
      const open = await timing(grid);
      assert.match(open.property, /opacity/);
      assert.match(open.property, /transform/);
      assert.match(open.duration, /^0\.16s/);
      assert.ok(open.running > 0, "the grid is fading in");
      await page.locator(".main").screenshot({ path: join(output, "motion-grid-opening.png") });
      // Interactive at once: typing finds a shape while it fades in.
      await page.keyboard.type("hex");
      assert.equal(await grid.getByRole("radio").count(), 1);
      await page.keyboard.press("Escape");
      assert.equal(await closed(grid), true);
      // The arrow menu and the context menu move the same way.
      await page.locator(".toolbar .split-arrow[data-arrow-kinds]").click();
      const menu = page.locator(".menu");
      assert.match((await timing(menu)).duration, /^0\.16s/);
      await page.keyboard.press("Escape");
      assert.equal(await closed(menu), true);
      // A tooltip shows after the pointer rests, the button keeping its title.
      const zoomIn = page.locator('.toolbar button[aria-label="Zoom in"]');
      await zoomIn.hover();
      const tip = page.locator(".tooltip");
      assert.equal(await tip.isVisible(), false, "not at once");
      await tip.waitFor({ state: "visible", timeout: 2000 });
      assert.equal(await tip.textContent(), "Zoom in (+)");
      await page.waitForTimeout(200);
      await page.screenshot({
        path: join(output, "motion-tooltip.png"),
        clip: { x: 300, y: 0, width: 400, height: 90 },
      });
      await page.mouse.move(5, 400);
      assert.equal(await zoomIn.getAttribute("title"), "Zoom in (+)");
      // Reduced motion: no transition, no transform.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await arrow.click();
      const reduced = await timing(grid);
      assert.ok(
        reduced.duration.split(",").every((d) => parseFloat(d) === 0),
        `no transition: ${reduced.duration}`,
      );
      assert.equal(reduced.running, 0);
      assert.equal(reduced.opacity, "1");
      await page.keyboard.press("Escape");
      assert.equal(await grid.isVisible(), false, "gone at once");
    },
  },
  {
    name: "read-only: I opens no icon picker, and the context menu offers no icon",
    text: ICONED,
    readOnly: true,
    async run(h) {
      const page = h.page;
      assert.equal(await page.locator('.toolbar button[data-tool="icon"]').isVisible(), false);
      await h.focusStage();
      await page.keyboard.press("i");
      await h.settled();
      assert.equal(await page.locator(".icon-picker").isVisible(), false);
      assert.equal(
        h.received.some((m) => (m as { type: string }).type === "searchIcons"),
        false,
      );
      const db = await h.centre("db");
      await page.mouse.click(db.x, db.y, { button: "right" });
      const menu = page.getByRole("menu");
      await menu.waitFor();
      assert.equal(await menu.getByRole("menuitem", { name: "Remove icon" }).count(), 0);
      assert.equal(await menu.getByRole("menuitem", { name: "Icon…" }).count(), 0);
      assert.deepEqual(h.writes(), []);
    },
  },
  {
    name: "draws in a dark theme",
    theme: DARK,
    async run(h) {
      const api = await h.centre("api");
      await h.page.mouse.click(api.x, api.y);
      await h.settled();
      await h.page.screenshot({ path: join(output, "canvas-dark.png") });
      const background = await h.page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      );
      assert.equal(background, "rgb(30, 30, 30)");
    },
  },
  {
    name: "drags a box into a group and out again, outlining the group it lands in",
    text: NESTED,
    async run(h) {
      const page = h.page;
      const c = await h.centre("c");
      // c's centre to (420, 252): inside g, right of a.
      const into = await pageAt(h, "c", { x: 700, y: 200 }, 160, { x: 420, y: 252 });
      const before = actions(h);
      await dragTo(h, c, into, async () => {
        // While it is dragged, g is outlined as the group it would land in.
        assert.equal(
          await page.locator('.overlay path.highlight.drop[data-target="g"]').count(),
          1,
        );
      });
      assert.equal(actions(h), before + 1, "one action, one undo step");
      assert.match(h.text, /group g "Backend" \{\n {4}box a "A"\n {4}box c "C"\n {2}\}/);
      // Placed in g's interior, which starts at (116, 120), where it was dropped.
      const inside = h.place("c");
      assert.ok(
        Math.abs(inside.x + 116 - 420) <= 7 && Math.abs(inside.y + 120 - 252) <= 7,
        JSON.stringify(inside),
      );
      assert.equal(await page.locator(".status").textContent(), "Moved c into g.");
      assert.equal(await page.locator(".overlay .highlight").count(), 0);
      // Out again, beyond every group: at the top level, placed in diagram coordinates.
      const out = await pageAt(h, "c", { x: inside.x + 116, y: inside.y + 120 }, 160, {
        x: 700,
        y: 196,
      });
      await dragTo(h, await h.centre("c"), out, async () => {
        assert.equal(await page.locator(".overlay .highlight.drop").count(), 0);
      });
      assert.match(h.text, /group g "Backend" \{\n {4}box a "A"\n {2}\}\n {2}box c "C"\n/);
      const top = h.place("c");
      assert.ok(Math.abs(top.x - 700) <= 7 && Math.abs(top.y - 196) <= 7, JSON.stringify(top));
      assert.equal(await page.locator(".status").textContent(), "Moved c to the top level.");
      // Dragged within its group, a child keeps its parent: only its place changes.
      const a = await h.centre("a");
      await dragTo(h, a, { x: a.x, y: a.y + 40 });
      assert.match(h.text, /group g "Backend" \{\n {4}box a "A"\n {2}\}/);
      assert.notDeepEqual(h.place("a"), { x: 84, y: 60 });
    },
  },
  {
    name: "keeps the parent when Alt is held over a group",
    text: NESTED,
    async run(h) {
      const page = h.page;
      const into = await pageAt(h, "c", { x: 700, y: 200 }, 160, { x: 420, y: 250 });
      await page.keyboard.down("Alt");
      await dragTo(h, await h.centre("c"), into, async () => {
        assert.equal(await page.locator(".overlay .highlight.drop").count(), 0);
      });
      await page.keyboard.up("Alt");
      // Only the place changes, unsnapped; c stays at the top level, selected.
      assert.match(h.text, /group g "Backend" \{\n {4}box a "A"\n {2}\}\n {2}box c "C"\n/);
      const place = h.place("c");
      assert.ok(
        Math.abs(place.x - 420) <= 2 && Math.abs(place.y - 250) <= 2,
        JSON.stringify(place),
      );
      assert.deepEqual(h.session.selected, ["c"]);
    },
  },
  {
    name: "nests a group dropped from the palette inside a group, and moves a box in from the Inside field",
    text: NESTED,
    async run(h) {
      const page = h.page;
      const tool = await page.locator('.toolbar button[data-tool="group"]').boundingBox();
      assert.ok(tool);
      const inside = await pageAt(h, "c", { x: 700, y: 200 }, 160, { x: 406, y: 238 });
      await dragTo(h, { x: tool.x + tool.width / 2, y: tool.y + tool.height / 2 }, inside);
      assert.match(
        h.text,
        /group g "Backend" \{\n {4}box a "A"\n {4}group group1 "Group" \{ \}\n {2}\}/,
      );
      // Placed in g's interior coordinates: (406, 238) less (116, 120).
      assert.deepEqual(h.place("group1"), { x: 290, y: 118 });
      // The drop leaves no tool armed; Escape leaves the label editor.
      assert.equal(
        await page.locator('.toolbar button[data-tool="group"]').getAttribute("aria-pressed"),
        "false",
      );
      await page.keyboard.press("Escape");
      // The Inside field: c into g where it is drawn, then back to the top level.
      const c = await h.centre("c");
      await page.mouse.click(c.x, c.y);
      await h.settled();
      const field = page.locator("#mdg-field-inside");
      assert.equal(await field.inputValue(), "");
      assert.deepEqual(
        await field
          .locator("option")
          .evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value)),
        ["", "g", "group1"],
      );
      await field.selectOption("g");
      await h.settled();
      assert.match(h.text, /group g "Backend" \{\n(.*\n)* {4}box c "C"\n/);
      assert.deepEqual(h.place("c"), { x: 584, y: 80 });
      await page.locator("#mdg-field-inside").selectOption("");
      await h.settled();
      assert.match(h.text, /\n {2}box c "C"\n/);
      assert.deepEqual(h.place("c"), { x: 700, y: 200 });
    },
  },
  {
    name: "moves a group without place with its only child dragged out of its box, and keeps it drawn when the Inside field empties it",
    text: DERIVED,
    async run(h) {
      const page = h.page;
      const before = await boxOf(h, "g");
      // api's centre to (400, 220), below g's box: g is drawn around api, so it follows.
      const below = await pageAt(h, "api", { x: 400, y: 100 }, 160, { x: 400, y: 220 });
      await dragTo(h, await h.centre("api"), below, async () => {
        assert.equal(await page.locator(".overlay .highlight.drop").count(), 0);
      });
      assert.match(h.text, /group g "Backend" \{\n {4}api\["API"\]\n {2}\}/);
      assert.ok(h.place("api").y > 200, JSON.stringify(h.place("api")));
      assert.equal(await page.locator(".banner").isHidden(), true, "the diagram still draws");
      assert.equal(await page.locator(".status").textContent(), "Moved api.");
      const after = await boxOf(h, "g");
      assert.ok(after.y > before.y + 50, `g follows api: ${before.y} to ${after.y}`);
      // The Inside field takes api out: g keeps the place and size it is drawn with.
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      await page.locator("#mdg-field-inside").selectOption("");
      await h.settled();
      assert.match(h.text, /group g "Backend" \{\n {2}\}\n {2}api\["API"\]\n/);
      assert.match(h.text, /\n {4}size g \(192, 112\)\n/);
      assert.equal(await page.locator(".banner").isHidden(), true, "the empty group still draws");
      near(await boxOf(h, "g"), after, 1, "g where it was drawn");
    },
  },
  {
    name: "drops a box into a placed group without size, where it was dropped, and the group's children stay",
    text: UNSIZED,
    async run(h) {
      const a = await boxOf(h, "a");
      const b = await boxOf(h, "b");
      // c's centre to (446, 237): inside g, near its lower right corner.
      const into = await pageAt(h, "c", { x: 700, y: 400 }, 160, { x: 446, y: 237 });
      await dragTo(h, await h.centre("c"), into);
      assert.match(h.text, /group g "G" \{\n {4}box a "A"\n {4}box b "B"\n {4}box c "C"\n {2}\}/);
      assert.match(h.text, /\n {4}size g \(372, 114\)\n/);
      near(await boxOf(h, "a"), a, 1, "a stays");
      near(await boxOf(h, "b"), b, 1, "b stays");
      // Within the grid's snap (7 units) of the drop.
      const c = await h.centre("c");
      const reach = (8 * a.width) / 160;
      assert.ok(
        Math.abs(c.x - into.x) <= reach && Math.abs(c.y - into.y) <= reach,
        `c lands where it was dropped: ${JSON.stringify(c)} for ${JSON.stringify(into)}`,
      );
    },
  },
  {
    name: "keeps a child in its group on a hidden layer while it is dragged within the group's box",
    text: BACK_GROUP,
    async run(h) {
      const page = h.page;
      await page.locator('.toolbar button[aria-label^="Show the layers"]').click();
      await page.locator('.panel.layers .layer[data-layer="back"] .eye').click();
      assert.equal(
        await page.locator('.content g[data-id="g"]').evaluate((g) => g.style.visibility),
        "hidden",
      );
      // a is drawn centred at (196, 150); 28 to the right is still inside g's box.
      const nudged = await pageAt(h, "a", { x: 196, y: 150 }, 160, { x: 224, y: 150 });
      await dragTo(h, await h.centre("a"), nudged, async () => {
        // A hidden group is not outlined.
        assert.equal(await page.locator(".overlay .highlight.drop").count(), 0);
      });
      assert.match(h.text, /group g "G" \{\n {4}layer back\n {4}box a "A"\n {2}\}/);
      assert.ok(h.place("a").x > 90, JSON.stringify(h.place("a")));
      assert.equal(await page.locator(".status").textContent(), "Moved a.");
      // Out of g's box (which ends at x 500) it leaves the group, hidden or not.
      const now = await boxOf(h, "a");
      const from = { x: now.x + now.width / 2, y: now.y + now.height / 2 };
      await dragTo(h, from, { x: from.x + (476 * now.width) / 160, y: from.y });
      assert.match(h.text, /group g "G" \{\n {4}layer back\n {2}\}\n {2}box a "A"\n/);
      assert.equal(await page.locator(".status").textContent(), "Moved a to the top level.");
    },
  },
  {
    name: "steps the corner radius with held keys, writing the last step without stale edits",
    text: FREE,
    async run(h) {
      const page = h.page;
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      const slider = page.locator('input[type="range"][data-slider="style.radius"]');
      assert.equal(await slider.inputValue(), "8");
      await slider.focus();
      const before = actions(h);
      for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
      await h.settled();
      assert.match(h.text, /style api \{ radius 14 \}/);
      assert.equal(await page.locator(".status.error").count(), 0, "no edit was refused");
      assert.ok(actions(h) - before <= 6, `${actions(h) - before} edits`);
      assert.equal(
        await page.locator('input[type="range"][data-slider="style.radius"]').inputValue(),
        "14",
      );
      assert.equal(await page.locator("#mdg-field-style-radius").inputValue(), "14");
    },
  },
  {
    name: "creates nothing on a later release after a palette press was cancelled or released by another pointer",
    text: FREE,
    async run(h) {
      const page = h.page;
      const before = actions(h);
      const client = await h.centre("client");
      // A touch the browser takes over ends in pointercancel: no release reaches the document.
      await page.evaluate(() => {
        const box = document.querySelector('.toolbar button[data-tool="box"]')!;
        box.dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 7 }),
        );
        document.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 7 }));
      });
      await page.mouse.click(client.x, client.y);
      await h.settled();
      assert.equal(actions(h), before, "the tap selects and creates nothing");
      assert.deepEqual(h.session.selected, ["client"]);
      // A press whose release is another pointer's: that release creates nothing either.
      await page.evaluate(() => {
        const box = document.querySelector('.toolbar button[data-tool="box"]')!;
        box.dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 9 }),
        );
      });
      await page.mouse.click(client.x, client.y);
      await h.settled();
      assert.equal(actions(h), before, "another pointer's release creates nothing");
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      assert.doesNotMatch(h.text, /box1/);
    },
  },
  {
    name: "selects the shape below with Alt+click and the menu, and nothing in a diamond's empty corner",
    text: STACK,
    async run(h) {
      const page = h.page;
      const centre = await h.centre("inner");
      const altClick = async () => {
        await page.keyboard.down("Alt");
        await page.mouse.click(centre.x, centre.y);
        await page.keyboard.up("Alt");
        await h.settled();
      };
      // The click takes the topmost; Alt+click goes down the stack and round again.
      await page.mouse.click(centre.x, centre.y);
      await h.settled();
      assert.deepEqual(h.session.selected, ["inner"]);
      await altClick();
      assert.deepEqual(h.session.selected, ["middle"]);
      assert.equal(
        await page.locator(".status").textContent(),
        "box middle, Middle, selected: 2 of 3 under the pointer.",
      );
      await altClick();
      assert.deepEqual(h.session.selected, ["outer"]);
      await altClick();
      assert.deepEqual(h.session.selected, ["inner"]);
      assert.equal(h.text, STACK);
      // The context menu offers it where shapes are stacked.
      await page.mouse.click(centre.x, centre.y, { button: "right" });
      const below = page
        .locator(".menu")
        .getByRole("menuitem", { name: /^Select the shape below/ });
      assert.equal(await below.textContent(), "Select the shape belowAlt+click");
      await below.click();
      await h.settled();
      assert.deepEqual(h.session.selected, ["middle"]);
      // A diamond is hit inside its outline only: its box's corner selects nothing.
      const kite = await boxOf(h, "kite");
      await page.mouse.click(kite.x + kite.width / 2, kite.y + kite.height / 2);
      await h.settled();
      assert.deepEqual(h.session.selected, ["kite"]);
      // Clear of the resize handle at the corner, and far from the outline.
      const corner = { x: kite.x + 14, y: kite.y + 14 };
      await page.mouse.move(corner.x, corner.y);
      assert.equal(await page.locator(".stage.connecting").count(), 0);
      await page.mouse.click(corner.x, corner.y);
      await h.settled();
      assert.deepEqual(h.session.selected, []);
      // A single shape has nothing below it: the menu does not offer it.
      await page.mouse.click(kite.x + kite.width / 2, kite.y + kite.height / 2, {
        button: "right",
      });
      assert.equal(
        await page
          .locator(".menu")
          .getByRole("menuitem", { name: /^Select the shape below/ })
          .count(),
        0,
      );
      await page.keyboard.press("Escape");
    },
  },
  {
    name: "draws a diamond's outline and magnets under a dragged connection, and pins the end to a side's middle",
    text: STACK,
    async run(h) {
      const page = h.page;
      const j = await h.centre("j");
      await page.mouse.click(j.x, j.y);
      await h.settled();
      const handle = await page.locator('.overlay [data-handle="connect:north"]').boundingBox();
      assert.ok(handle);
      // The middle of the diamond's upper-right side: 40 right of and 20 above its centre.
      const side = await pageAt(h, "kite", { x: 700, y: 220 }, 160, { x: 740, y: 200 });
      await dragTo(
        h,
        { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
        side,
        async () => {
          // Its four points and the middles of its four sides, none at the box's corners.
          assert.equal(await page.locator(".overlay .anchor:not(.active)").count(), 8);
          assert.equal(await page.locator(".overlay .anchor.active").count(), 1);
          const outline = page.locator('.overlay path.highlight[data-target="kite"]');
          assert.equal(((await outline.getAttribute("d")) ?? "").match(/L/g)?.length, 3);
        },
      );
      assert.match(h.text, /j -> kite as j_kite/);
      assert.match(h.text, /route j_kite from j\.north 50% to kite\.north 75%/);
    },
  },
  {
    name: "creates a hexagon from the box button's grid, and B repeats it",
    text: FREE,
    async run(h) {
      const page = h.page;
      const arrow = page.locator('.toolbar .split-arrow[data-shapes="box"]');
      assert.equal(await arrow.isVisible(), true);
      assert.equal(await arrow.getAttribute("aria-label"), "More shapes (F)");
      await arrow.click();
      const grid = page.getByRole("dialog", { name: "Shapes" });
      assert.equal(await grid.isVisible(), true);
      assert.equal(await grid.getByRole("radio").count(), 24);
      assert.equal(await arrow.getAttribute("aria-expanded"), "true");
      await grid.getByRole("radio", { name: "hexagon" }).click();
      assert.equal(await closed(grid), true);
      const box = page.locator('.toolbar button[data-tool="box"]');
      assert.equal(await box.getAttribute("aria-pressed"), "true");
      assert.equal(await box.getAttribute("data-shape"), "hexagon");
      assert.equal(
        await box.getAttribute("aria-label"),
        "Box, hexagon: click on the canvas, or press B",
      );
      // The ghost has the hexagon's size and outline; a click places one, in one edit.
      const at = await pageAt(h, "client", { x: 98, y: 224 }, 160, { x: 98, y: 126 });
      await page.mouse.move(at.x, at.y);
      assert.equal(await page.locator('.overlay path.ghost[data-shape="hexagon"]').count(), 1);
      const before = actions(h);
      await page.mouse.click(at.x, at.y);
      await h.settled();
      assert.equal(actions(h), before + 1);
      assert.match(h.text, /\n {2}box box1 ""\n {2}style box1 \{ shape hexagon \}\n/);
      assert.equal(await page.locator(".inline").count(), 0);
      // B places the current shape near the centre, empty too.
      await h.focusStage();
      await page.keyboard.press("b");
      await h.settled();
      assert.match(h.text, /\n {2}box box2 ""\n {2}style box2 \{ shape hexagon \}\n/);
      assert.equal(await page.locator(".inline").count(), 0);
      assert.equal(await box.getAttribute("data-shape"), "hexagon");
    },
  },
  {
    name: "creates a star with F, typing and Enter, and N repeats it",
    async run(h) {
      const page = h.page;
      await h.focusStage();
      await page.keyboard.press("f");
      const grid = page.getByRole("dialog", { name: "Shapes" });
      assert.equal(await grid.isVisible(), true);
      await page.keyboard.type("sta");
      assert.equal(await page.locator("#mdg-shapes-filter").textContent(), "Find: sta");
      assert.equal(await grid.getByRole("radio").count(), 1);
      await page.keyboard.press("Enter");
      await h.settled();
      assert.equal(await closed(grid), true);
      assert.match(h.text, /\n {2}node1\[""\]\n {2}style node1 \{ shape star \}\n/);
      assert.match(h.text, /place node1 at \(/);
      // The new node is empty and selected, with no editor open; N places another star.
      assert.equal(await page.locator(".inline").count(), 0);
      assert.deepEqual(h.session.selected, ["node1"]);
      await page.keyboard.press("n");
      await h.settled();
      assert.match(h.text, /\n {2}node2\[""\]\n {2}style node2 \{ shape star \}\n/);
      assert.equal(
        await page.locator('.toolbar button[data-tool="node"]').getAttribute("data-shape"),
        "star",
      );
    },
  },
  {
    name: "cycles the kind of arrow with R and chooses one from the arrow button's menu",
    async run(h) {
      const page = h.page;
      await h.focusStage();
      await page.keyboard.press("r");
      await page.keyboard.press("r");
      assert.equal(
        await page.locator(".status").textContent(),
        "Dashed arrow (-->). Click the element the relation starts from. Escape cancels.",
      );
      const api = await h.centre("api");
      const cache = await h.centre("cache");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      await page.mouse.click(cache.x, cache.y);
      await h.settled();
      assert.match(h.text, /\n {2}api --> cache\n/);
      // The menu lists the six kinds with pictures, the current one checked.
      await page.locator(".toolbar .split-arrow[data-arrow-kinds]").click();
      const kinds = page.locator(".menu [role=menuitemradio]");
      assert.deepEqual(
        await kinds.evaluateAll((items) => items.map((i) => i.getAttribute("data-kind"))),
        ["->", "-->", "--", "---", "<->", "<-->"],
      );
      assert.equal(await kinds.nth(1).getAttribute("aria-checked"), "true");
      assert.equal(await page.locator('.menu svg[data-glyph="arrow:<->"]').count(), 1);
      assert.equal(await page.locator('.menu svg[data-glyph="arrow:--"]').count(), 1);
      assert.equal(await page.locator('.menu svg[data-glyph="arrow:---"]').count(), 1);
      // The lines are drawn without heads: one stroke, nothing filled.
      assert.equal(await page.locator('.menu svg[data-glyph="arrow:--"] path').count(), 1);
      await page.locator(".menu").screenshot({ path: join(output, "canvas-arrow-kinds.png") });
      await page.locator('.menu [data-kind="<->"]').click();
      await page.mouse.click(cache.x, cache.y);
      await h.settled();
      await page.mouse.click(api.x, api.y);
      await h.settled();
      assert.match(h.text, /\n {2}cache <-> api\n/);
      // The line: a click on each end writes `--`, and Shift on the second click `---`.
      await page.locator(".toolbar .split-arrow[data-arrow-kinds]").click();
      await page.locator('.menu [data-kind="--"]').click();
      await page.mouse.click(api.x, api.y);
      await h.settled();
      await page.mouse.click(cache.x, cache.y);
      await h.settled();
      assert.match(h.text, /\n {2}api -- cache\n/);
      // R arms the tool with the current kind, then six more presses go round the six kinds.
      for (let i = 0; i < 7; i++) await page.keyboard.press("r");
      assert.equal(
        await page.locator(".status").textContent(),
        "Line (--). Click the element the relation starts from. Escape cancels.",
      );
      await page.mouse.click(cache.x, cache.y);
      await h.settled();
      await page.keyboard.down("Shift");
      await page.mouse.click(api.x, api.y);
      await page.keyboard.up("Shift");
      await h.settled();
      assert.match(h.text, /\n {2}cache --- api\n/);
    },
  },
  {
    name: "free lines: drawn with the arrow tool, reshaped by their handles and moved by their stroke",
    text: LINES,
    async run(h) {
      const page = h.page;
      const at = (point: { x: number; y: number }) =>
        pageAt(h, "a", { x: 126, y: 112 }, 160, point);
      await h.focusStage();
      // R arms the tool with `->`; a drag on empty canvas draws the ghost, then the line.
      await page.keyboard.press("r");
      const ghost = page.locator(".overlay .line-ghost:not(.fading)");
      await dragTo(h, await at({ x: 98, y: 280 }), await at({ x: 294, y: 280 }), async () => {
        assert.equal(await ghost.count(), 1);
        assert.equal(await ghost.locator(".line-ghost-head").count(), 1);
      });
      assert.match(h.text, /\n {2}line line1 from \(98, 280\) to \(294, 280\)\n/);
      assert.match(h.text, /\n {2}style line1 \{ arrowhead triangle \}\n/);
      assert.deepEqual(h.session.selected, ["line1"]);
      assert.equal(
        await page.locator(".status").textContent(),
        "Drew a line from (98, 280) to (294, 280).",
      );
      // Selected: an outline along it, its two ends and its middle; no frame or connection handle.
      assert.equal(await page.locator(".overlay polyline.outline").count(), 1);
      assert.equal(await page.locator('.overlay [data-handle^="linePoint:"]').count(), 2);
      assert.equal(await page.locator('.overlay [data-handle^="lineSegment:"]').count(), 1);
      assert.equal(await page.locator('.overlay [data-handle^="resize:"]').count(), 0);
      assert.equal(await page.locator('.overlay [data-handle^="connect:"]').count(), 0);
      assert.equal(await page.locator('.overlay [data-handle^="rotate:"]').count(), 0);
      // The middle dragged 56 down inserts a bend.
      await dragTo(h, await at({ x: 196, y: 280 }), await at({ x: 196, y: 336 }));
      assert.match(
        h.text,
        /\n {2}line line1 from \(98, 280\) to \(294, 280\) via \[\(196, 336\)\]\n/,
      );
      await page.locator(".main").screenshot({ path: join(output, "canvas-line-selected.png") });
      // The end dragged, snapped to the grid.
      await dragTo(h, await at({ x: 294, y: 280 }), await at({ x: 352, y: 296 }));
      assert.match(
        h.text,
        /\n {2}line line1 from \(98, 280\) to \(350, 294\) via \[\(196, 336\)\]\n/,
      );
      // A double click on the bend removes it, in its own edit.
      const bend = await at({ x: 196, y: 336 });
      await page.mouse.dblclick(bend.x, bend.y);
      await h.settled();
      assert.match(h.text, /\n {2}line line1 from \(98, 280\) to \(350, 294\)\n/);
      // A press on empty canvas clears the selection; a press near the stroke selects the line,
      // and a drag of it moves every point by the same amount.
      const empty = await at({ x: 400, y: 420 });
      await page.mouse.click(empty.x, empty.y);
      await h.settled();
      assert.deepEqual(h.session.selected, []);
      const stroke = await at({ x: 161, y: 286 });
      await page.mouse.click(stroke.x, stroke.y);
      await h.settled();
      assert.deepEqual(h.session.selected, ["line1"]);
      await dragTo(h, stroke, await at({ x: 189, y: 300 }));
      assert.match(h.text, /\n {2}line line1 from \(126, 294\) to \(378, 308\)\n/);
      // Escape while drawing: the ghost goes and nothing is written.
      const before = actions(h);
      await page.keyboard.press("r");
      await dragTo(h, await at({ x: 98, y: 392 }), await at({ x: 294, y: 392 }), async () => {
        assert.equal(await ghost.count(), 1);
        await page.keyboard.press("Escape");
        assert.equal(await ghost.count(), 0);
      });
      assert.equal(actions(h), before);
      assert.equal(await page.locator(".status").textContent(), "No line drawn.");
      assert.doesNotMatch(h.text, /line2/);
      // A press on a box still starts a relation, even dragged: no line, `a` is the source.
      await dragTo(h, await h.centre("a"), await at({ x: 126, y: 152 }));
      assert.doesNotMatch(h.text, /line2/);
      const b = await h.centre("b");
      await page.mouse.click(b.x, b.y);
      await h.settled();
      assert.match(h.text, /\n {2}a -> b\n/);
    },
  },
  {
    name: "alignment picker: a cell writes both alignments in one edit and moves the label to the top band",
    text: LINES,
    async run(h) {
      const page = h.page;
      const a = await h.centre("a");
      await page.mouse.click(a.x, a.y);
      await h.settled();
      const picker = page.locator('.strip [data-field="style.textAlign"]');
      const cells = picker.locator('[role="radio"]');
      assert.equal(await cells.count(), 9);
      // Nothing written: the centre greyed as the default, nothing pressed.
      assert.equal(
        await picker.locator(".align-cell.inherit").getAttribute("aria-label"),
        "centre, middle",
      );
      assert.equal(await picker.locator('[aria-checked="true"]').count(), 0);
      const label = () =>
        page.evaluate(() => {
          const g = document.querySelector('.content g[data-id="a"][data-role="element"]')!;
          const text = g.querySelector("text")!.getBoundingClientRect();
          const box = g.getBoundingClientRect();
          return { top: text.top - box.top, bottom: box.bottom - text.bottom, height: box.height };
        });
      const before = await label();
      const edits = actions(h);
      await picker.locator('[data-across="left"][data-down="top"]').click();
      await h.settled();
      assert.equal(actions(h), edits + 1, "one edit");
      assert.match(h.text, /\n {2}style a \{ textAlign left; verticalAlign top \}\n/);
      const top = await label();
      assert.ok(top.top < before.top - 4, `the label went up: ${top.top} < ${before.top}`);
      assert.equal(
        await picker.locator('[aria-checked="true"]').getAttribute("aria-label"),
        "left, top",
      );
      await page
        .locator(".strip")
        .screenshot({ path: join(output, "canvas-alignment-picker.png") });
      // The keyboard: Down from the pressed cell and Enter writes the middle, the default.
      await picker.locator('[aria-checked="true"]').focus();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await h.settled();
      assert.match(h.text, /\n {2}style a \{ textAlign left \}\n/);
      // The chip takes the alignment away.
      await picker.getByRole("button", { name: /Inherit the alignment/ }).click();
      await h.settled();
      assert.doesNotMatch(h.text, /textAlign/);
    },
  },
  {
    name: "sketch theme: a switch paints two passes, keeps the clean selection outline and goes dark",
    text: LINES,
    async run(h) {
      const page = h.page;
      const outline = async () => {
        const a = await h.centre("a");
        await page.mouse.click(a.x, a.y);
        await h.settled();
        const box = await page.locator(".overlay rect.outline").first().boundingBox();
        assert.ok(box, "no outline");
        await page.keyboard.press("Escape");
        await h.settled();
        return box;
      };
      const passes = () =>
        page.locator('.content g[data-id="a"][data-role="element"] > path[fill="none"]').count();
      const clean = await outline();
      assert.equal(await passes(), 0);
      await page.getByRole("combobox", { name: "Theme" }).selectOption("sketch.light");
      await h.settled();
      assert.match(h.text, /\n {2}theme "sketch.light"\n/);
      assert.equal(await passes(), 2);
      assert.equal(
        await page
          .locator('.content g[data-id="a"][data-role="element"] > rect:not([stroke="none"])')
          .count(),
        0,
      );
      // The overlay is drawn from the clean geometry.
      near(await outline(), clean, 0.5, "selection outline");
      await page.locator(".main").screenshot({ path: join(output, "canvas-sketch.png") });
      // The light and dark switch works on the family.
      await page.getByRole("button", { name: "Dark" }).click();
      await h.settled();
      assert.match(h.text, /\n {2}theme "sketch.dark"\n/);
      assert.equal(await passes(), 2);
    },
  },
  {
    name: "creates a container from the group button's menu and with G",
    async run(h) {
      const page = h.page;
      const arrow = page.locator(".toolbar .split-arrow[data-group-kinds]");
      assert.equal(await arrow.getAttribute("aria-label"), "Group or container (G)");
      await arrow.click();
      const kinds = page.locator(".menu [role=menuitemradio]");
      assert.deepEqual(
        await kinds.evaluateAll((items) => items.map((i) => i.getAttribute("data-group-kind"))),
        ["group", "container"],
      );
      assert.equal(await kinds.nth(0).getAttribute("aria-checked"), "true");
      await page.screenshot({ path: join(output, "canvas-group-kinds.png") });
      await page.locator('.menu [data-group-kind="container"]').click();
      const group = page.locator('.toolbar button[data-tool="group"]');
      assert.equal(await group.getAttribute("data-group-kind"), "container");
      assert.equal(
        await group.getAttribute("aria-label"),
        "Container: click on the canvas, or press G",
      );
      // Right of the cache, where nothing is drawn.
      const width = analyzeDocument({ text: h.text }).diagrams[0]!.layout!.boxes!.get(
        "cache",
      )!.width;
      const spot = await pageAt(h, "cache", { x: 420, y: 266 }, width, { x: 700, y: 266 });
      await page.mouse.click(spot.x, spot.y);
      await h.settled();
      assert.match(h.text, /\n {2}group group1 "" \{/);
      assert.match(h.text, /place group1 at \(\d+, \d+\)/);
      assert.match(h.text, /size group1 \(\d+, \d+\)/);
      // A container has no title to type: it is selected, with no editor open.
      assert.equal(await page.locator(".inline").count(), 0);
      assert.deepEqual(h.session.selected, ["group1"]);
      await h.focusStage();
      await page.keyboard.press("g");
      await h.settled();
      assert.match(h.text, /\n {2}group group2 "" \{/);
      assert.equal(await page.locator(".inline").count(), 0);
    },
  },
  {
    name: "converts a square with a database on it into its container from the context menu",
    text: STACKED_SQUARE,
    async run(h) {
      const page = h.page;
      // Clear of the database, inside the square.
      const corner = await pageAt(h, "node3", { x: 480, y: 160 }, 238, { x: 380, y: 80 });
      await page.mouse.click(corner.x, corner.y);
      await h.settled();
      assert.deepEqual(h.session.selected, ["node3"]);
      await page.mouse.click(corner.x, corner.y, { button: "right" });
      await page.screenshot({ path: join(output, "canvas-convert-menu.png") });
      await page.locator(".menu").getByRole("menuitem", { name: "Convert to container" }).click();
      await h.settled();
      await page.screenshot({ path: join(output, "canvas-converted-container.png") });
      assert.match(h.text, /\n {2}group node3 "" \{\n {4}db\[\("Database"\)\]\n {2}\}\n/);
      assert.match(h.text, /style node3 \{ fill "#DBBDBD"; radius 0 \}/);
      assert.equal(
        await page.locator(".status").textContent(),
        "`node3` is now a container holding `db`.",
      );
      // The container carries the database when it moves.
      await page.mouse.click(corner.x, corner.y);
      await h.settled();
      await h.focusStage();
      await page.keyboard.press("ArrowRight");
      await h.settled();
      assert.deepEqual(h.place("node3"), { x: 481, y: 160 });
      assert.deepEqual(h.place("db"), { x: 481, y: 160 });
    },
  },
  {
    name: "says that a box dropped on a box is stacked on it, not inside it",
    text: STACKED_SQUARE.replace("place db at (480, 160)", "place db at (480, 420)"),
    async run(h) {
      const page = h.page;
      const db = await h.centre("db");
      const onto = await pageAt(h, "node3", { x: 480, y: 160 }, 238, { x: 480, y: 160 });
      await dragTo(h, db, onto);
      await h.settled();
      assert.doesNotMatch(h.text, /group node3/);
      assert.equal(
        await page.locator(".status").textContent(),
        "`db` is stacked on `node3`; convert `node3` to a container to move them together.",
      );
    },
  },
  {
    name: "says why the layout cannot be recomputed",
    text: `diagram d: flow {
  layout assisted
  group outer "Outer" {
    a["A"]
    group band ""
  }
  placement {
    place outer at (300, 200)
    size outer (400, 300)
    place a at (200, 200)
    place band at (350, 250)
    size band (100, 80)
  }
}
`,
    async run(h) {
      const page = h.page;
      const before = h.text;
      await page.locator('.toolbar button[aria-label="Arrange"]').click();
      await page.locator(".menu").getByText("Recompute layout").click();
      await h.settled();
      assert.equal(h.text, before);
      assert.match(
        (await page.locator(".status").textContent()) ?? "",
        /^Fix the problems of the diagram before arranging it: .*band/,
      );
    },
  },
  {
    name: "rotates a node with its handle in 15° steps, live, in one undo step",
    text: TURNABLE,
    async run(h) {
      const page = h.page;
      const centre = await h.centre("api");
      await page.mouse.click(centre.x, centre.y);
      await h.settled();
      const before = actions(h);
      const from = await rotationHandle(h);
      // A quarter turn of the handle about the centre, wherever the handle sits.
      await dragTo(h, from, turnedFrom(from, centre, 90), async () => {
        assert.equal(
          await page.locator(".status").textContent(),
          "Rotation 90°. Release to keep it; Escape cancels.",
        );
        assert.equal(await page.locator(".overlay .rotation-badge").textContent(), "90°");
        // The drawing and its outline: one angle about one centre, with no easing between them,
        // also once the session's preview has answered.
        await h.settled();
        assert.ok(h.previews().length > 0, "a preview was asked for");
        const agreement = await turnAgreement(h, "api");
        assert.equal(agreement.drawn, 90);
        assert.equal(agreement.outline, 90);
        assert.ok(agreement.apart < 1.5, `centres ${agreement.apart.toFixed(2)} px apart`);
        const easing = await page
          .locator('.content g[data-id="api"][data-role="element"]')
          .evaluate((g) => getComputedStyle(g).transitionDuration);
        assert.ok(
          easing.split(",").every((d) => parseFloat(d) === 0),
          `no easing: ${easing}`,
        );
        await page.screenshot({ path: join(output, "canvas-rotating.png") });
      });
      assert.equal(actions(h), before + 1, "one action, one undo step");
      assert.match(h.text, /style api \{ rotation 90 \}/);
      assert.equal(await page.locator(".status").textContent(), "api turned to 90°.");
      await page.mouse.click(centre.x, centre.y);
      await h.settled();
      await page.screenshot({ path: join(output, "canvas-turned.png") });
      // The selection and its handles are turned with the element.
      assert.equal(await page.locator(".overlay .turned-handles").count(), 1);
    },
  },
  {
    name: "rotates to any angle with Alt, and Escape cancels a rotation",
    text: TURNABLE,
    async run(h) {
      const page = h.page;
      const centre = await h.centre("api");
      await page.mouse.click(centre.x, centre.y);
      await h.settled();
      const from = await rotationHandle(h);
      // Escape while the handle turns the element: nothing written, the drawing as it was.
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      const far = turnedFrom(from, centre, 120);
      await page.mouse.move(far.x, far.y, { steps: 6 });
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await h.settled();
      assert.doesNotMatch(h.text, /rotation/);
      assert.equal(await page.locator(".content g.turning").count(), 0);
      assert.equal(
        await page
          .locator('.content g[data-id="api"][data-role="element"]')
          .getAttribute("transform"),
        null,
      );
      // Alt turns the steps off: 37 degrees of turn from the grab.
      await page.mouse.click(centre.x, centre.y);
      await h.settled();
      const again = await rotationHandle(h);
      await page.keyboard.down("Alt");
      await dragTo(h, again, turnedFrom(again, centre, 37));
      await page.keyboard.up("Alt");
      assert.match(h.text, /style api \{ rotation 37 \}/);
    },
  },
  {
    name: "a press on the rotation handle with a little jitter turns nothing and writes nothing",
    text: TURNABLE,
    async run(h) {
      const page = h.page;
      const centre = await h.centre("api");
      await page.mouse.click(centre.x, centre.y);
      await h.settled();
      const before = actions(h);
      const from = await rotationHandle(h);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + 1, from.y + 1);
      await page.mouse.move(from.x + 2, from.y);
      assert.equal(
        await page
          .locator('.content g[data-id="api"][data-role="element"]')
          .getAttribute("transform"),
        null,
        "still upright while held",
      );
      assert.equal(await page.locator(".overlay .rotation-badge").count(), 0);
      await page.mouse.up();
      await h.settled();
      assert.equal(actions(h), before, "nothing sent");
      assert.doesNotMatch(h.text, /rotation/);
      assert.equal(h.previews().length, 0, "nothing previewed");
    },
  },
  {
    name: "rotates a node of an automatic layout in place, writing the arrangement first",
    text: `diagram d: flow {
  api["API"]
  db[("DB")]
  cache["Cache"]
  api -> db: "save" as save
  api -> cache
}
`,
    async run(h) {
      const page = h.page;
      const centre = await h.centre("api");
      await page.mouse.click(centre.x, centre.y);
      await h.settled();
      const before = actions(h);
      const from = await rotationHandle(h);
      await dragTo(h, from, turnedFrom(from, centre, 30), async () => {
        await h.settled();
        assert.ok(h.previews().length > 0, "a preview was asked for");
        const agreement = await turnAgreement(h, "api");
        assert.equal(agreement.drawn, 30);
        assert.equal(agreement.outline, 30);
        assert.ok(agreement.apart < 1.5, `centres ${agreement.apart.toFixed(2)} px apart`);
        const live = await h.centre("api");
        assert.ok(
          Math.hypot(live.x - centre.x, live.y - centre.y) < 2,
          "api keeps its centre while it turns",
        );
      });
      assert.equal(actions(h), before + 1, "one action, one undo step");
      assert.match(h.text, /style api \{ rotation 30 \}/);
      assert.match(h.text, /place api at/, "the arrangement was written");
      const after = await h.centre("api");
      assert.ok(Math.hypot(after.x - centre.x, after.y - centre.y) < 2, "api keeps its centre");
    },
  },
  {
    name: "keeps a node turned with its outline while previews are refused",
    text: TURNABLE,
    async run(h) {
      const page = h.page;
      h.refusePreviews = true;
      const centre = await h.centre("api");
      await page.mouse.click(centre.x, centre.y);
      await h.settled();
      const from = await rotationHandle(h);
      await dragTo(h, from, turnedFrom(from, centre, 60), async () => {
        await h.settled();
        assert.ok(h.previews().length > 0, "a preview was asked for and refused");
        const agreement = await turnAgreement(h, "api");
        assert.equal(agreement.drawn, 60);
        assert.equal(agreement.outline, 60);
        assert.ok(agreement.apart < 1.5, `centres ${agreement.apart.toFixed(2)} px apart`);
      });
      assert.match(h.text, /style api \{ rotation 60 \}/);
    },
  },
  {
    name: "selects a turned square by its turned outline, and resizes a turned node in its own frame",
    text: TURNABLE.replace(
      "  placement {",
      '  sq[""]\n  style sq { shape square; rotation 45 }\n  style api { rotation 90 }\n  placement {\n    place sq at (520, 360)\n    size sq (120, 120)',
    ).replace("    place api at (200, 140)", "    place api at (200, 140)"),
    async run(h) {
      const page = h.page;
      const zoom = (await boxOf(h, "cache")).width / 160;
      // A corner of the square's unturned box lies outside the turned square.
      const corner = await pageAt(h, "sq", { x: 520, y: 360 }, 120 * Math.SQRT2, {
        x: 466,
        y: 306,
      });
      await page.mouse.click(corner.x, corner.y);
      await h.settled();
      assert.deepEqual(h.session.selected, []);
      const square = await h.centre("sq");
      await page.mouse.click(square.x, square.y);
      await h.settled();
      assert.deepEqual(h.session.selected, ["sq"]);
      // The east handle of `api`, turned a quarter, lies below it: dragging it down widens `api`.
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      const east = (await page
        .locator('.overlay .turned-handles rect[data-handle="resize:e"]')
        .boundingBox())!;
      const from = { x: east.x + east.width / 2, y: east.y + east.height / 2 };
      await dragTo(h, from, { x: from.x, y: from.y + 40 * zoom });
      assert.match(h.text, /size api \(200, 56\)/);
      assert.deepEqual(h.place("api"), { x: 200, y: 160 });
    },
  },
  {
    name: "pins a connection on a turned node's side, written in the node's own frame",
    text: TURNABLE.replace("  placement {", "  style api { rotation 90 }\n  placement {"),
    async run(h) {
      const page = h.page;
      const zoom = (await boxOf(h, "cache")).width / 160;
      const cache = await h.centre("cache");
      await page.mouse.click(cache.x, cache.y);
      await h.settled();
      const handle = (await page
        .locator('.overlay [data-handle="connect:north"][data-id="cache"]')
        .boundingBox())!;
      // The middle of api's own north side, which the quarter turn puts on its east.
      const api = await h.centre("api");
      await dragTo(
        h,
        { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
        { x: api.x + 28 * zoom, y: api.y },
      );
      assert.match(h.text, /cache -> api/);
      assert.match(h.text, /to api\.north 50%/);
    },
  },
  {
    name: "rotates a quarter turn and resets the rotation from the context menu",
    text: TURNABLE.replace("  placement {", "  style api { rotation 300 }\n  placement {"),
    async run(h) {
      const page = h.page;
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      await page.mouse.click(api.x, api.y, { button: "right" });
      await page.locator(".menu").getByRole("menuitem", { name: "Rotate 90°" }).click();
      await h.settled();
      assert.match(h.text, /style api \{ rotation 30 \}/);
      await page.mouse.click(api.x, api.y, { button: "right" });
      await page.locator(".menu").getByRole("menuitem", { name: "Reset rotation" }).click();
      await h.settled();
      assert.doesNotMatch(h.text, /rotation/);
    },
  },
  {
    name: "offers no rotation handle on a group",
    text: FREE,
    async run(h) {
      const page = h.page;
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      assert.equal(await page.locator(".overlay .handle.rotate").count(), 1);
      const empty = await pageAt(h, "api", { x: 324, y: 218 }, 160, { x: 420, y: 304 });
      await page.mouse.click(empty.x, empty.y);
      await h.settled();
      assert.deepEqual(h.session.selected, ["g"]);
      assert.equal(await page.locator(".overlay .handle.rotate").count(), 0);
    },
  },
  {
    name: "read-only: offers no rotation handle",
    text: TURNABLE,
    readOnly: true,
    async run(h) {
      const page = h.page;
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      assert.equal(await page.locator(".overlay .handle.rotate").count(), 0);
    },
  },
  {
    name: "rounds a hexagon with the corner radius slider and turns a node with the rotation slider",
    text: TURNABLE.replace("  placement {", "  style cache { shape hexagon }\n  placement {"),
    async run(h) {
      const page = h.page;
      const cache = await h.centre("cache");
      await page.mouse.click(cache.x, cache.y);
      await h.settled();
      assert.equal(await page.locator("#mdg-field-style-radius").getAttribute("placeholder"), "0");
      await page.locator('input[type="range"][data-slider="style.radius"]').fill("10");
      await h.settled();
      assert.match(h.text, /style cache \{ shape hexagon; radius 10 \}/);
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      assert.equal(
        await page.locator("#mdg-field-style-rotation").getAttribute("placeholder"),
        "0",
      );
      await page.locator('input[type="range"][data-slider="style.rotation"]').fill("30");
      await h.settled();
      assert.match(h.text, /style api \{ rotation 30 \}/);
    },
  },
  {
    name: "chooses a box's shape by its picture and a group's corner radius with the slider",
    text: FREE,
    async run(h) {
      const page = h.page;
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      const trigger = page.locator("#mdg-field-style-shape");
      assert.equal(await trigger.getAttribute("aria-label"), "rounded");
      assert.equal(await page.locator("#mdg-field-style-radius").count(), 1);
      await trigger.click();
      await page.locator('.head-grid.shape-grid button.chip.glyph[data-value="ellipse"]').click();
      await h.settled();
      assert.match(h.text, /style api \{ shape ellipse \}/);
      assert.equal(
        await page.locator("#mdg-field-style-shape").getAttribute("aria-label"),
        "ellipse",
      );
      // An ellipse draws no corners: the radius is not offered, in the strip or below it.
      assert.equal(await page.locator("#mdg-field-style-radius").count(), 0);
      assert.equal(await page.locator('[data-slider="style.radius"]').count(), 0);
      // The group: the theme's group radius shows greyed until the slider writes 0.
      const empty = await pageAt(h, "api", { x: 324, y: 218 }, 160, { x: 420, y: 304 });
      await page.mouse.click(empty.x, empty.y);
      await h.settled();
      assert.deepEqual(h.session.selected, ["g"]);
      assert.equal(await page.locator("#mdg-field-style-shape").count(), 0, "groups take no shape");
      assert.equal(await page.locator("#mdg-field-style-radius").getAttribute("placeholder"), "14");
      const slider = page.locator('input[type="range"][data-slider="style.radius"]');
      assert.equal(await slider.getAttribute("aria-label"), "Corner radius, slider");
      await slider.fill("0");
      await h.settled();
      assert.match(h.text, /style g \{ radius 0 \}/);
      assert.equal(await page.locator("#mdg-field-style-radius").inputValue(), "0");
    },
  },
  {
    name: "names the shapes in Spanish in the grid and finds them as they are typed",
    text: FREE,
    lang: "es",
    async run(h) {
      const page = h.page;
      const arrow = page.locator('.toolbar .split-arrow[data-shapes="box"]');
      assert.equal(await arrow.getAttribute("aria-label"), "Más formas (F)");
      assert.equal(
        await page.locator(".toolbar .split-arrow[data-arrow-kinds]").getAttribute("title"),
        "Tipos de flecha (R cambia)",
      );
      assert.equal(
        await page.locator(".toolbar button.new-diagram").getAttribute("aria-label"),
        "Nuevo diagrama",
      );
      await arrow.click();
      const grid = page.getByRole("dialog", { name: "Formas" });
      assert.equal(await grid.isVisible(), true);
      assert.equal(
        await page.locator("#mdg-shapes-filter").textContent(),
        "Escribe para buscar una forma",
      );
      const names = await grid
        .locator("button[data-shape]")
        .evaluateAll((chips) => chips.map((c) => c.getAttribute("aria-label")));
      assert.equal(names.length, 24);
      assert.deepEqual(names.slice(0, 6), [
        "redondeada",
        "rectángulo",
        "cuadrado",
        "elipse",
        "círculo",
        "rombo",
      ]);
      assert.equal(
        await grid.locator('button[data-shape="framed"] .name').textContent(),
        "con marco",
      );
      await page.keyboard.type("est");
      assert.equal(await page.locator("#mdg-shapes-filter").textContent(), "Buscar: est");
      assert.equal(
        await grid.locator("button[data-shape]").first().getAttribute("data-shape"),
        "star",
      );
      await page.keyboard.press("Enter");
      assert.equal(await closed(grid), true);
      assert.equal(
        await page.locator('.toolbar button[data-tool="box"]').getAttribute("aria-label"),
        "Caja, estrella: haz clic en el lienzo o presiona B",
      );
    },
  },
  {
    name: "read-only: hides the arrows of the split buttons, F opens nothing, and Alt+click still selects below",
    text: FREE,
    readOnly: true,
    async run(h) {
      const page = h.page;
      // The box's, the node's (shown on flow diagrams only), the group's and the relation tool's.
      assert.equal(await page.locator(".toolbar .split-arrow").count(), 4);
      for (const arrow of await page.locator(".toolbar .split-arrow").all()) {
        assert.equal(await arrow.isVisible(), false);
      }
      await h.focusStage();
      const status = await page.locator(".status").textContent();
      await page.keyboard.press("f");
      assert.equal(await page.locator("#mdg-shapes").isVisible(), false);
      assert.equal(await page.locator(".status").textContent(), status);
      // Selecting only looks: api lies in g, so the shape below it is g.
      const api = await h.centre("api");
      await page.keyboard.down("Alt");
      await page.mouse.click(api.x, api.y);
      await page.keyboard.up("Alt");
      await h.settled();
      assert.deepEqual(h.session.selected, ["g"]);
      assert.deepEqual(h.writes(), []);
      assert.equal(h.text, FREE);
    },
  },
  {
    name: "split buttons: a held press or a right-click on the main part opens the menu, a click arms the tool",
    text: FREE,
    async run(h) {
      const page = h.page;
      const box = page.locator('.toolbar button[data-tool="box"]');
      const arrow = page.locator('.toolbar .split-arrow[data-shapes="box"]');
      // The arrow part is a dropdown: as tall as the button, wide enough, a chevron, a title.
      const [main, part] = [await box.boundingBox(), await arrow.boundingBox()];
      assert.ok(main && part);
      assert.ok(part.width >= 16, `the arrow part is ${part.width} wide`);
      assert.ok(Math.abs(part.height - main.height) <= 1, "as tall as the button");
      assert.equal(await arrow.getAttribute("title"), "More shapes (F)");
      assert.equal(await arrow.locator("svg.chevron").count(), 1);
      assert.equal(
        await arrow.evaluate((a) => getComputedStyle(a).color),
        await page.locator(".toolbar").evaluate((t) => getComputedStyle(t).color),
        "the chevron takes the text's colour",
      );
      assert.equal(
        await page.locator(".toolbar .split-arrow[data-arrow-kinds]").getAttribute("title"),
        "Kinds of arrow (R cycles)",
      );
      const grid = page.getByRole("dialog", { name: "Shapes" });
      const hold = async (x: number, y: number) => {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.waitForTimeout(550);
        await page.mouse.up();
      };
      // Held for half a second: the grid opens and the release arms nothing.
      await hold(main.x + main.width / 2, main.y + main.height / 2);
      assert.equal(await grid.isVisible(), true);
      assert.equal(await arrow.getAttribute("aria-expanded"), "true");
      assert.equal(await box.getAttribute("aria-pressed"), "false");
      await page.keyboard.press("Escape");
      assert.equal(await closed(grid), true);
      // A short click arms the tool with the current shape and opens nothing.
      await box.click();
      assert.equal(await box.getAttribute("aria-pressed"), "true");
      assert.equal(await closed(grid), true);
      await box.click();
      assert.equal(await box.getAttribute("aria-pressed"), "false");
      // A right-click opens the grid too.
      await box.click({ button: "right" });
      assert.equal(await grid.isVisible(), true);
      await page.keyboard.press("Escape");
      // The relation tool: held, its kinds of arrow; a click still arms it.
      const relation = page.locator('.toolbar button[data-tool="relation"]');
      const tool = (await relation.boundingBox())!;
      await hold(tool.x + tool.width / 2, tool.y + tool.height / 2);
      assert.equal(await page.locator(".menu [role=menuitemradio]").count(), 6);
      assert.equal(await relation.getAttribute("aria-pressed"), "false");
      await page.keyboard.press("Escape");
      await relation.click();
      assert.equal(await relation.getAttribute("aria-pressed"), "true");
      assert.deepEqual(h.writes(), []);
      await page.locator(".toolbar").screenshot({ path: join(output, "canvas-split-buttons.png") });
    },
  },
  {
    name: "offers to create a diagram in an empty file, and its Flow diagram button writes one and shows it",
    text: "",
    async run(h) {
      const page = h.page;
      const empty = page.locator(".empty");
      assert.equal(await empty.isVisible(), true);
      const buttons = empty.getByRole("group", { name: "Create a diagram" }).getByRole("button");
      assert.deepEqual(await buttons.allTextContents(), [
        "Flow diagram",
        "Free composition",
        "Sequence diagram",
      ]);
      // Nothing to place without a diagram; New diagram is there.
      assert.equal(await page.locator('.toolbar button[data-tool="node"]').isVisible(), false);
      assert.equal(await page.locator(".toolbar button.new-diagram").isVisible(), true);
      await page.screenshot({ path: join(output, "canvas-empty-file.png") });
      await buttons.first().click();
      await h.settled();
      assert.equal(h.text, 'language "0.2"\n\ndiagram diagram1: flow {\n}\n');
      assert.equal(actions(h), 1, "one edit, one undo step");
      assert.equal(await empty.isVisible(), false);
      assert.equal(await page.locator(".content svg").count(), 1);
      assert.equal(await page.locator('.toolbar button[data-tool="node"]').isVisible(), true);
      assert.equal(
        await page.locator('.toolbar select[aria-label="Diagram"]').inputValue(),
        "diagram1",
      );
      assert.equal(await page.locator(".status").textContent(), "Created a flow diagram.");
      assert.match((await page.locator(".inspector h2").textContent()) ?? "", /diagram1/);
    },
  },
  {
    name: "forgets the diagram picker, the properties, the minimap and the badges when the file is emptied",
    text: TWO,
    async run(h) {
      const page = h.page;
      const picker = page.locator('.toolbar select[aria-label="Diagram"]');
      assert.equal(await picker.isVisible(), true);
      assert.equal(await picker.inputValue(), "overview");
      assert.match((await page.locator(".inspector h2").textContent()) ?? "", /overview/);
      assert.equal(await page.locator(".minimap").isVisible(), true);
      assert.equal(await page.locator(".toolbar .badge").textContent(), "layout manual");
      const db = await h.centre("db");
      await page.mouse.click(db.x, db.y);
      await h.settled();
      assert.match((await page.locator(".status").textContent()) ?? "", /db/);
      // Out of date first, then emptied.
      await h.type(h.text.replace('api["API"]', 'api["API'));
      assert.equal(await page.locator(".banner").isVisible(), true);
      await h.type("");
      assert.equal(await picker.isVisible(), false);
      assert.equal(await picker.locator("option").count(), 0);
      assert.equal(await page.locator(".inspector h2").count(), 0);
      assert.equal(await page.locator(".minimap").isVisible(), false);
      assert.equal(await page.locator(".minimap .map").innerHTML(), "");
      assert.equal(await page.locator(".toolbar .badge").isVisible(), false);
      assert.equal(await page.locator(".banner").isVisible(), false);
      assert.equal(await page.locator(".status").textContent(), "");
      assert.equal(await page.locator(".content").innerHTML(), "");
      assert.equal(await page.locator(".overlay").innerHTML(), "");
      assert.equal(await page.locator(".empty button").count(), 3);
      assert.equal(await page.locator('.toolbar button[data-tool="node"]').isVisible(), false);
      assert.ok(!(await page.locator("#app").innerHTML()).includes("overview"), "overview is gone");
    },
  },
  {
    name: "fits the first diagram after an empty file into the stage that the tools and the properties leave",
    text: "",
    async run(h) {
      const page = h.page;
      // A file without diagrams has neither the properties nor the tools of a drawing.
      assert.equal(await page.locator(".inspector").isVisible(), false);
      assert.equal(await page.locator('.toolbar button[data-tool="box"]').isVisible(), false);
      // The diagram arrives (in the cloud, the room's files land after an empty project).
      await h.type(WIDE_SLIDE);
      assert.equal(await page.locator(".inspector").isVisible(), true);
      assert.equal(await page.locator('.toolbar button[data-tool="box"]').isVisible(), true);
      const stage = (await page.locator(".stage").boundingBox())!;
      const sheet = (await page.locator(".content svg").boundingBox())!;
      const inside = (what: string, near: number, far: number, from: number, size: number) =>
        assert.ok(
          near >= from - 0.5 && far <= from + size + 0.5,
          `the sheet's ${what} (${near}..${far}) is in the stage (${from}..${from + size})`,
        );
      inside("width", sheet.x, sheet.x + sheet.width, stage.x, stage.width);
      inside("height", sheet.y, sheet.y + sheet.height, stage.y, stage.height);
      // The box at the right edge is on the canvas, not under the properties: a click selects it.
      const db = await h.centre("db");
      await page.mouse.click(db.x, db.y);
      await h.settled();
      assert.match((await page.locator(".inspector h2").textContent()) ?? "", /db/);
    },
  },
  {
    name: "adds a free composition from New diagram after the diagram of the file, and shows it",
    async run(h) {
      const page = h.page;
      const button = page.locator(".toolbar button.new-diagram");
      assert.equal(await button.getAttribute("aria-label"), "New diagram");
      await button.click();
      assert.equal(await button.getAttribute("aria-expanded"), "true");
      assert.deepEqual(
        await page
          .locator(".menu [role=menuitem]")
          .evaluateAll((items) => items.map((i) => [i.getAttribute("data-create"), i.textContent])),
        [
          ["flow", "Flow diagram"],
          ["free", "Free composition"],
          ["sequence", "Sequence diagram"],
        ],
      );
      await page.locator('.menu [data-create="free"]').click();
      await h.settled();
      assert.equal(h.text, `language "0.2"\n\n${SHEET}\ndiagram diagram1: free {\n}\n`);
      assert.equal(actions(h), 1);
      const picker = page.locator('.toolbar select[aria-label="Diagram"]');
      assert.equal(await picker.isVisible(), true);
      assert.equal(await picker.inputValue(), "diagram1");
      assert.equal(await page.locator('.toolbar button[data-tool="box"]').isVisible(), true);
      assert.equal(await button.getAttribute("aria-expanded"), "false");
    },
  },
  {
    name: "read-only: says why a file without diagrams draws nothing, with no button to create one",
    text: "",
    readOnly: true,
    async run(h) {
      const page = h.page;
      assert.equal(await page.locator(".empty").isVisible(), true);
      assert.ok(((await page.locator(".empty .empty-message").textContent()) ?? "").length > 0);
      assert.equal(await page.locator(".empty button").count(), 3);
      for (const button of await page.locator(".empty button").all()) {
        assert.equal(await button.isVisible(), false);
      }
      assert.equal(await page.locator(".toolbar button.new-diagram").isVisible(), false);
      assert.deepEqual(h.writes(), []);
      assert.equal(h.text, "");
    },
  },
  {
    name: "sizes the drawing from the Canvas field: a slide, a custom width and height, and not 50",
    text: SHEET.replace("  layout manual\n", "  layout manual\n  canvas (800, 600)\n"),
    async run(h) {
      const page = h.page;
      const field = page.locator("#mdg-field-canvas");
      assert.equal(await field.inputValue(), "custom");
      assert.deepEqual(
        await field
          .locator("option")
          .evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).textContent)),
        ["default (fit to content)", "document", "slide", "custom"],
      );
      assert.equal(await page.locator("#mdg-field-canvas-width").inputValue(), "800");
      const before = actions(h);
      await field.selectOption("slide");
      await h.settled();
      assert.match(h.text, /\n {2}preset slide\n/);
      assert.doesNotMatch(h.text, /canvas \(/);
      assert.equal(actions(h), before + 1, "one edit, one undo step");
      await page.locator("#mdg-field-canvas").selectOption("custom");
      await h.settled();
      assert.match(h.text, /\n {2}canvas \(\d+, \d+\)\n/);
      assert.doesNotMatch(h.text, /preset/);
      const width = page.locator("#mdg-field-canvas-width");
      await width.fill("1600");
      await width.press("Enter");
      await h.settled();
      const height = page.locator("#mdg-field-canvas-height");
      await height.fill("900");
      await height.press("Enter");
      await h.settled();
      assert.match(h.text, /\n {2}canvas \(1600, 900\)\n/);
      const written = h.text;
      await page.locator("#mdg-field-canvas-width").fill("50");
      await page.locator("#mdg-field-canvas-width").press("Enter");
      await h.settled();
      assert.equal(h.text, written);
      assert.equal(await page.locator(".status.error").count(), 1);
      assert.match((await page.locator(".status").textContent()) ?? "", /100.*10000/);
    },
  },
  {
    name: "draws a dragged box's connector where the drop will before the release, and Escape brings the drawing back",
    text: LIVE,
    async run(h) {
      const page = h.page;
      const line = await lineOf(h, "call");
      const api = await boxOf(h, "api");
      const start = await h.centre("api");
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 100, start.y, { steps: 4 });
      await page.mouse.move(start.x + 200, start.y, { steps: 4 });
      await h.settled();
      // Before the release: the connector ends at api where it is dragged; nothing is written.
      const during = await lineOf(h, "call");
      const moved = await boxOf(h, "api");
      assert.ok(
        during.width > line.width + 150,
        `the connector grew: ${line.width} to ${during.width}`,
      );
      assert.ok(
        Math.abs(during.x + during.width - moved.x) <= 6,
        `it ends at api: ${during.x + during.width} for ${moved.x}`,
      );
      assert.ok(
        Math.abs(moved.x + moved.width / 2 - (start.x + 200)) <= 10,
        "api under the pointer",
      );
      assert.ok(h.previews().length >= 1, "a preview was asked");
      assert.equal(actions(h), 0);
      assert.equal(h.text, LIVE);
      // The overlay is the selection's, as without a preview.
      assert.equal(await page.locator(".overlay .outline").count(), 1);
      // Escape: the drawing from before the drag, and nothing written.
      await page.keyboard.press("Escape");
      await h.settled();
      near(await lineOf(h, "call"), line, 1, "the connector as it was");
      near(await boxOf(h, "api"), api, 1, "api as it was");
      await page.mouse.up();
      await h.settled();
      assert.equal(h.text, LIVE);
      assert.equal(actions(h), 0);
      // Dropped this time: the edit draws what the preview drew.
      let previewed: Rect | undefined;
      await dragBy(h, "api", 200, 0, async () => {
        await h.settled();
        previewed = await lineOf(h, "call");
      });
      assert.equal(actions(h), 1, "one edit, one undo step");
      assert.notEqual(h.text, LIVE);
      near(await lineOf(h, "call"), previewed!, 1, "the drop draws the preview");
      // Each preview had a token of its own, in order.
      const tokens = h.previews().map((p) => p.token);
      assert.deepEqual(
        tokens,
        [...tokens].sort((a, b) => a - b),
      );
      assert.equal(new Set(tokens).size, tokens.length);
    },
  },
  {
    name: "grows an unsized group as its child is resized, before the release",
    text: UNSIZED,
    async run(h) {
      const page = h.page;
      const group = await boxOf(h, "g");
      const b = await h.centre("b");
      await page.mouse.click(b.x, b.y);
      await h.settled();
      const handle = await page.locator('.overlay [data-handle="resize:e"]').boundingBox();
      assert.ok(handle);
      const from = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
      let during: Rect | undefined;
      await dragTo(h, from, { x: from.x + 120, y: from.y }, async () => {
        await h.settled();
        during = await boxOf(h, "g");
        assert.equal(h.text, UNSIZED, "nothing is written before the release");
      });
      assert.ok(during!.width > group.width + 60, `g grew: ${group.width} to ${during!.width}`);
      assert.match(h.text, /size b \(\d+, \d+\)/);
      near(await boxOf(h, "g"), during!, 1, "the drop draws the preview");
    },
  },
  {
    name: "moves a dragged box alone over the last drawing when its preview is refused",
    text: LIVE,
    async run(h) {
      h.refusePreviews = true;
      const line = await lineOf(h, "call");
      const api = await boxOf(h, "api");
      await dragBy(h, "api", 200, 0, async () => {
        await h.settled();
        assert.ok(h.previews().length >= 1, "a preview was asked");
        near(await lineOf(h, "call"), line, 1, "the connector stays");
        const moved = await boxOf(h, "api");
        assert.ok(moved.x > api.x + 150, "api follows the pointer");
      });
      // The drop is written all the same.
      assert.notEqual(h.text, LIVE);
      assert.equal(actions(h), 1);
    },
  },
  {
    name: "offers the kinds of diagram in Spanish in an empty file and under New diagram",
    text: "",
    lang: "es",
    async run(h) {
      const page = h.page;
      const names = ["Diagrama de flujo", "Composición libre", "Diagrama de secuencia"];
      const group = page.locator(".empty").getByRole("group", { name: "Crear un diagrama" });
      assert.deepEqual(await group.getByRole("button").allTextContents(), names);
      await page.locator(".toolbar button.new-diagram").click();
      assert.deepEqual(await page.locator(".menu [role=menuitem]").allTextContents(), names);
      await page.locator('.menu [data-create="sequence"]').click();
      await h.settled();
      assert.equal(h.text, 'language "0.2"\n\ndiagram diagram1: sequence {\n}\n');
      assert.equal(
        await page.locator(".status").textContent(),
        "Se creó un diagrama de secuencia.",
      );
    },
  },
  {
    name: "asks for no preview while a participant of a sequence diagram is dragged",
    text: SEQUENCE,
    async run(h) {
      await dragBy(h, "api", 180, 0);
      assert.equal(h.previews().length, 0);
    },
  },
  // Spanish: the page's `lang` sets the canvas's words. Only the canvas's own words are checked;
  // field labels and titles come from the extension host.
  {
    name: "speaks Spanish in its toolbar, palette, strip, menus and status, and still draws",
    lang: "es",
    async run(h) {
      const page = h.page;
      const attribute = (selector: string, name: string) =>
        page.locator(selector).first().getAttribute(name);
      assert.equal(await attribute(".toolbar", "aria-label"), "Herramientas del lienzo");
      assert.equal(await attribute(".stage", "aria-roledescription"), "lienzo de diagrama");
      assert.equal(await attribute(".minimap", "aria-label"), "Minimapa");
      const node = page.locator('.toolbar button[data-tool="node"]');
      assert.equal(
        await node.getAttribute("aria-label"),
        "Nodo: haz clic en el lienzo o presiona N",
      );
      assert.equal(
        await node.getAttribute("title"),
        "Nodo: haz clic en el lienzo o presiona N (N)",
      );
      for (const name of ["Alejar", "Acercar", "Mostrar la cuadrícula", "Exportar SVG"]) {
        assert.equal(await page.getByRole("button", { name, exact: true }).isVisible(), true, name);
      }
      assert.equal(
        await page
          .getByRole("button", { name: "Ajustar el diagrama a la vista" })
          .getAttribute("title"),
        "Ajustar el diagrama a la vista (Mayús+1)",
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Relación: haz clic en el origen y luego en el destino" })
          .getAttribute("title"),
        "Relación: haz clic en el origen y luego en el destino (R; R otra vez para el siguiente tipo de flecha; Mayús alterna entre continua y discontinua)",
      );
      const zoom = '.toolbar select[aria-label="Zoom"]';
      // A no-break space before the percent sign, as Spanish writes it.
      assert.equal(
        await page.locator(`${zoom} option[value="1"]`).textContent(),
        `100${String.fromCharCode(0xa0)}%`,
      );
      assert.equal(
        await page.locator(`${zoom} option[value="fit"]`).textContent(),
        "Ajustar a la vista",
      );
      assert.equal(
        await page.getByRole("complementary", { name: "Propiedades" }).isVisible(),
        true,
      );
      // Selecting announces the kind in Spanish; the strip's chips and pictures speak it too.
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      assert.equal(await page.locator(".status").textContent(), "Nodo api, API, seleccionado.");
      assert.equal(await page.getByRole("region", { name: "Estilo" }).isVisible(), true);
      const inherit = page.locator('[data-field="style.fill"] [data-token=""]');
      assert.equal(await inherit.getAttribute("aria-label"), "Tema: heredar");
      assert.equal(await inherit.textContent(), "Tema");
      assert.match(
        (await attribute('[data-field="style.stroke"] input[type="color"]', "aria-label")) ?? "",
        /: un color propio$/,
      );
      await h.focusStage();
      await page.keyboard.press("Shift+ArrowRight");
      await h.settled();
      assert.deepEqual(h.place("api"), { x: 140, y: 112 });
      assert.equal(await page.locator(".status").textContent(), "Se movió api en 14, 0.");
      // The context menu, with its keys.
      await page.keyboard.press("Shift+F10");
      const menu = page.getByRole("menu", { name: "Acciones del lienzo" });
      assert.equal(await menu.isVisible(), true);
      const rows = await menu
        .getByRole("menuitem")
        .evaluateAll((items) => items.map((item) => item.textContent));
      assert.equal(rows[0], "Editar la etiquetaEntrar");
      assert.equal(rows[1], "Cambiar el idMayús+F2");
      assert.ok(rows.includes("EliminarSupr"), rows.join(" | "));
      assert.ok(rows.includes("Exportar SVG"), rows.join(" | "));
      await page.keyboard.press("Escape");
      // A relation: its line, route and heads by their Spanish names.
      const label = await page
        .locator('.content g[data-id="save"][data-role="relation"] [data-role="label"]')
        .first()
        .boundingBox();
      assert.ok(label);
      await page.mouse.click(label.x + label.width / 2, label.y + label.height / 2);
      await h.settled();
      assert.equal(
        await page.locator(".status").textContent(),
        "Relación de api a db seleccionada.",
      );
      assert.deepEqual(
        await page
          .locator('[data-field="line"] [role="radio"]')
          .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label"))),
        ["continua", "discontinua", "punteada"],
      );
      await page
        .locator('[data-field="style.routing"] [role="radio"][aria-label="en codo"]')
        .click();
      await h.settled();
      assert.match(h.text, /style save \{ routing orthogonal \}/);
      const corners = page.locator('[data-field="style.corners"] [role="radio"]').first();
      assert.match((await corners.getAttribute("aria-label")) ?? "", /^Predeterminado/);
      const start = page.locator("#mdg-field-style-arrowtail");
      assert.equal(await start.getAttribute("aria-label"), "ninguna");
      await start.click();
      const heads = page.locator('[data-field="style.arrowtail"] .head-grid');
      assert.equal(await heads.isVisible(), true);
      assert.equal(await heads.locator(".inherit").textContent(), "Predeterminado");
      await page.screenshot({ path: join(output, "canvas-es-heads.png") });
      await heads.locator('[role="radio"][aria-label="rombo"]').click();
      await h.settled();
      assert.match(h.text, /arrowtail diamond/);
      // Drawing from the palette still works, and the label is added in place.
      await node.click();
      assert.equal(
        await page.locator(".status").textContent(),
        "Haz clic en el lienzo para colocar el nodo. Esc cancela.",
      );
      const db = await h.centre("db");
      await page.mouse.click(db.x + 300, db.y + 200);
      await h.settled();
      assert.match(h.text, /node1\[""\]/);
      assert.equal(await page.locator(".status").textContent(), "Nodo node1 seleccionado.");
      await page.keyboard.press("Enter");
      const inline = page.locator("textarea.inline");
      assert.equal(await inline.getAttribute("aria-label"), "Etiqueta de node1");
      assert.equal(
        await inline.getAttribute("aria-description"),
        "Entrar o Tab guarda el texto, Mayús+Entrar empieza una línea nueva, Esc cancela.",
      );
      await inline.fill("Cola");
      await inline.press("Enter");
      await h.settled();
      assert.match(h.text, /node1\["Cola"\]/);
      // A pulse turned on: its card speaks Spanish, the effect's name shown once in the header.
      await page.getByRole("button", { name: "Pulso", exact: true }).click();
      await h.settled();
      assert.match(h.text, /animate node1 \{ effect pulse \}/);
      const card = page.locator('.strip .effect-card[data-effect="effect.pulse"]');
      assert.equal(await card.locator(".card-name").textContent(), "Pulso");
      assert.equal(
        await card.getByRole("button", { name: "Pulso: ajustes" }).getAttribute("aria-expanded"),
        "true",
      );
      const colour = card.locator('[data-field="effect.pulse.color"]');
      assert.equal(await colour.locator(".row-label > span").first().textContent(), "color");
      assert.equal(await colour.getByRole("radiogroup").getAttribute("aria-label"), "Pulso: color");
      assert.equal(await colour.locator('[data-token=""]').textContent(), "Tema");
      await page.screenshot({ path: join(output, "canvas-es.png") });
    },
  },
  {
    name: "plays a story with a Spanish timeline and decimal commas",
    lang: "es",
    text: STORY,
    async run(h) {
      const page = h.page;
      const picker = page.getByRole("combobox", { name: "Historia" });
      await picker.waitFor({ state: "visible" });
      assert.deepEqual(
        await picker.locator("option").evaluateAll((options) => options.map((o) => o.textContent)),
        ["Editar el diagrama", "Historia: purchase — A purchase"],
      );
      await picker.selectOption("purchase");
      await h.settled();
      const timeline = page.getByRole("region", { name: "Línea de tiempo de la historia" });
      await timeline.waitFor({ state: "visible" });
      assert.equal(await page.locator(".badge").textContent(), "historia");
      assert.equal(await page.locator(".timeline .clock").textContent(), "0 s / 6,2 s");
      assert.equal(await page.locator(".timeline .scene-name").textContent(), "escena overview");
      // 1200 ms reads "1,2 s".
      assert.equal(
        await page.locator('.timeline .bar[data-path="1.0"]').getAttribute("aria-label"),
        "trace request, 1,2 s",
      );
      for (const name of [
        "Agregar a la escena",
        "Nueva escena después de esta",
        "Quitar la acción seleccionada",
        "Exportar la historia como reproductor HTML",
      ]) {
        assert.equal(await timeline.getByRole("button", { name }).isVisible(), true, name);
      }
      await timeline.getByRole("button", { name: "Reproducir la historia" }).click();
      await page.waitForTimeout(200);
      await timeline.getByRole("button", { name: "Pausar la historia" }).click();
      // Adding an action that needs a selection, with nothing selected, says so.
      await page.getByRole("combobox", { name: "Acción para agregar" }).selectOption("reveal");
      await timeline.getByRole("button", { name: "Agregar a la escena" }).click();
      assert.equal(
        await page.locator(".status").textContent(),
        "Primero selecciona en el lienzo qué revelar.",
      );
      await page.screenshot({ path: join(output, "canvas-es-story.png") });
      await picker.selectOption("");
      await h.settled();
      assert.equal(await timeline.isVisible(), false);
    },
  },
  // Read-only: `CanvasSettings.readOnly` in the host's `settings` message (`canvas-package`).
  {
    name: "read-only: a drag, a press on the border and a rubber band send no plan, and the handles are gone",
    readOnly: true,
    async run(h) {
      const page = h.page;
      const revision = h.revision;
      // The marks of the mode: the class, the badge, the labels, the status line.
      assert.equal(
        await page.locator("#app").evaluate((e) => e.classList.contains("view-only")),
        true,
      );
      const badge = page.locator(".view-only-badge");
      assert.equal(await badge.isVisible(), true);
      assert.equal(await badge.textContent(), "view only");
      assert.match((await badge.getAttribute("title")) ?? "", /^View only: /);
      assert.match((await page.locator(".stage").getAttribute("aria-label")) ?? "", /view only/);
      assert.equal(
        await page.locator(".status").textContent(),
        "This canvas is view only: you can look around, select, zoom and play stories.",
      );
      // Everything that writes is hidden, the same way story mode hides `data-edit`.
      assert.deepEqual(
        await page
          .locator("[data-write]")
          .evaluateAll((els) =>
            els
              .filter((e) => getComputedStyle(e).display !== "none")
              .map((e) => e.getAttribute("aria-label") ?? e.className),
          ),
        [],
      );
      // Dragging api moves nothing on the canvas and tells the host nothing.
      const api = page.locator('.content g[data-id="api"][data-role="element"]');
      await dragBy(h, "api", 80, 30, async () => {
        assert.equal(await api.getAttribute("transform"), null, "the element follows no pointer");
      });
      assert.equal(h.text, SHEET);
      assert.equal(h.revision, revision);
      assert.deepEqual(h.writes(), []);
      // The press selected it: an outline, and no handle to resize, bend or connect.
      assert.deepEqual(h.session.selected, ["api"]);
      assert.equal(await page.locator(".overlay .outline").count(), 1);
      assert.equal(await page.locator(".overlay [data-handle]").count(), 0);
      // A press just outside a border starts no connection: it is a rubber band.
      const box = await api.boundingBox();
      const cache = await h.centre("cache");
      assert.ok(box);
      await page.mouse.move(box.x + box.width + 5, box.y + box.height / 2);
      assert.equal(await page.locator(".stage.connecting").count(), 0);
      await page.mouse.down();
      await page.mouse.move(cache.x, cache.y, { steps: 5 });
      assert.equal(await page.locator(".overlay .wire").count(), 0);
      await page.mouse.up();
      await h.settled();
      assert.equal(h.text, SHEET);
      assert.deepEqual(h.writes(), []);
      // A relation's label is not dragged either.
      const label = await page
        .locator('.content g[data-id="save"][data-role="relation"] [data-role="label"]')
        .first()
        .boundingBox();
      assert.ok(label);
      const at = { x: label.x + label.width / 2, y: label.y + label.height / 2 };
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await page.mouse.move(at.x + 30, at.y + 30, { steps: 4 });
      await page.mouse.up();
      await h.settled();
      assert.deepEqual(h.session.selected, ["save"]);
      assert.equal(await page.locator(".overlay [data-handle]").count(), 0);
      assert.equal(h.text, SHEET);
      assert.deepEqual(h.writes(), []);
    },
  },
  {
    name: "read-only: inline editing, Delete, cut, paste, duplicate, the nudges and the creation keys do nothing",
    readOnly: true,
    async run(h) {
      const page = h.page;
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      assert.deepEqual(h.session.selected, ["api"]);
      // A double click and Enter would open the editor in place.
      await page.mouse.dblclick(api.x, api.y);
      await h.focusStage();
      for (const key of ["Enter", "F2", "Shift+F2"]) await page.keyboard.press(key);
      assert.equal(await page.locator("textarea.inline").count(), 0);
      assert.equal(
        await page.locator(".status").textContent(),
        "View only: the diagram cannot be changed here.",
      );
      // Not one message for the keys that edit, undo and redo included (the host's own keys).
      const before = h.received.length;
      for (const key of [
        ...["Delete", "Backspace", "Control+d", "Control+x", "Control+v", "Control+z", "Control+y"],
        ...["Shift+ArrowRight", "ArrowDown", "Alt+Shift+ArrowRight", "Control+Shift+BracketRight"],
        ...["Alt+g", "Alt+Shift+g", "Control+Alt+h", "n", "d", "s", "o", "t", "c", "r", "g", "u"],
      ]) {
        await page.keyboard.press(key);
      }
      await h.settled();
      assert.equal(h.received.length, before, "no message at all");
      assert.equal(h.text, SHEET);
      assert.equal(await page.locator(".picker").isVisible(), false);
      assert.equal(await page.locator(".dialog").isVisible(), false);
      assert.equal(await page.locator('.toolbar [aria-pressed="true"][data-tool]').count(), 0);
      assert.equal(await page.locator(".panel.library").isVisible(), false);
      // The same with a relation selected: it stays as it is.
      const label = await page
        .locator('.content g[data-id="save"][data-role="relation"] [data-role="label"]')
        .first()
        .boundingBox();
      assert.ok(label);
      await page.mouse.dblclick(label.x + label.width / 2, label.y + label.height / 2);
      await page.keyboard.press("Delete");
      await h.settled();
      assert.equal(await page.locator("textarea.inline").count(), 0);
      assert.equal(h.text, SHEET);
      assert.deepEqual(h.writes(), []);
    },
  },
  {
    name: "read-only: the inspector shows the properties disabled, and commits nothing",
    readOnly: true,
    async run(h) {
      const page = h.page;
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      const inspector = page.getByRole("complementary", { name: "Properties, view only" });
      assert.equal(await inspector.isVisible(), true);
      assert.equal(await inspector.getAttribute("data-readonly"), "");
      // The values are there to read; every control is disabled, so none is left to change.
      const label = page.locator("#mdg-field-label");
      assert.equal(await label.inputValue(), "API");
      assert.equal(await label.isDisabled(), true);
      const live = () =>
        inspector
          .locator("input, select, textarea, button")
          .evaluateAll((els) =>
            els
              .filter((e) => !(e as HTMLInputElement).disabled)
              .map((e) => e.outerHTML.slice(0, 90)),
          );
      assert.deepEqual(await live(), []);
      assert.equal(await page.getByRole("button", { name: "Choose…" }).count(), 0);
      // Forcing what a typed value or a chosen chip would send writes nothing either.
      await label.evaluate((el: HTMLInputElement) => {
        el.disabled = false;
        el.value = "Hacked";
      });
      await label.press("Enter");
      await label.dispatchEvent("change");
      await page
        .locator('[data-field="style.fill"] [data-token="accent"]')
        .evaluate((el: HTMLButtonElement) => {
          el.disabled = false;
          el.click();
        });
      await h.settled();
      assert.equal(h.text, SHEET);
      assert.deepEqual(h.writes(), []);
      assert.equal(
        h.received.some((m) => (m as { action?: { kind: string } }).action?.kind === "setField"),
        false,
      );
      // The diagram's properties: the theme can be read, never created or edited.
      await h.focusStage();
      await page.keyboard.press("Escape");
      await h.settled();
      assert.match((await page.locator(".inspector h2").textContent()) ?? "", /Diagram d/);
      assert.equal(await page.getByRole("button", { name: "New theme from this one…" }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Edit theme…" }).count(), 0);
      assert.deepEqual(await live(), []);
      assert.equal(
        await page.getByRole("complementary", { name: "Properties", exact: true }).count(),
        0,
        "the panel does not say it can be edited",
      );
    },
  },
  {
    name: "read-only: selection, zoom, pan, fit, the minimap, the menu and the export still work",
    readOnly: true,
    async run(h) {
      const page = h.page;
      const zoom = () =>
        page
          .locator('.toolbar select[aria-label="Zoom"]')
          .evaluate((s: HTMLSelectElement) => s.selectedOptions[0]?.textContent ?? "");
      const transform = () =>
        page.locator(".content").evaluate((e: HTMLElement) => e.style.transform);
      // The toolbar keeps what looks and loses what writes.
      for (const name of [
        ...["Zoom out", "Zoom in", "Fit the diagram", "Show the grid", "Show the minimap"],
        ...["Show the properties", "Show the layers (L)", "Export SVG"],
      ]) {
        assert.equal(await page.getByRole("button", { name, exact: true }).isVisible(), true, name);
      }
      for (const name of [
        ...["Arrange", "Snap to the grid and guides", "Show the element libraries (U)"],
        ...["Connect the selected element to…"],
      ]) {
        assert.equal(
          await page.getByRole("button", { name, exact: true }).isVisible(),
          false,
          name,
        );
      }
      assert.equal(await page.locator(".toolbar [data-tool]").first().isVisible(), false);
      assert.equal(await page.locator(".minimap").isVisible(), true);
      // Selecting: a click, Tab, Select all, a rubber band around two boxes.
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      assert.deepEqual(h.session.selected, ["api"]);
      assert.equal(await page.locator(".status").textContent(), "node api, API, selected.");
      await page.keyboard.press("Tab");
      await h.settled();
      assert.deepEqual(h.session.selected, ["db"]);
      await page.keyboard.press("Control+a");
      await h.settled();
      assert.deepEqual([...h.session.selected].sort(), ["api", "cache", "db"]);
      const a = await page.locator('.content g[data-id="api"][data-role="element"]').boundingBox();
      const d = await page.locator('.content g[data-id="db"][data-role="element"]').boundingBox();
      assert.ok(a && d);
      await page.mouse.move(a.x - 15, a.y - 15);
      await page.mouse.down();
      await page.mouse.move(d.x + d.width + 15, d.y + d.height + 15, { steps: 5 });
      await page.mouse.up();
      await h.settled();
      assert.ok(h.session.selected.includes("api") && h.session.selected.includes("db"));
      assert.ok(!h.session.selected.includes("cache"));
      // Zoom with Ctrl and the wheel, fit with Shift+1, and the zoom picker.
      const before = await zoom();
      await page.mouse.move(600, 400);
      await page.keyboard.down("Control");
      await page.mouse.wheel(0, -400);
      await page.keyboard.up("Control");
      await page.waitForTimeout(50);
      assert.notEqual(await zoom(), before);
      await h.focusStage();
      await page.keyboard.press("Shift+Digit1");
      await page.waitForTimeout(50);
      assert.equal(await zoom(), before);
      await page.locator('.toolbar select[aria-label="Zoom"]').selectOption("2");
      assert.equal(await zoom(), "200%");
      await page.getByRole("button", { name: "Fit the diagram", exact: true }).click();
      assert.equal(await zoom(), before);
      // Pan with the wheel and from the minimap.
      const start = await transform();
      await page.mouse.move(600, 400);
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(50);
      assert.notEqual(await transform(), start);
      const moved = await transform();
      const map = await page.locator(".minimap").boundingBox();
      assert.ok(map);
      await page.mouse.click(map.x + 5, map.y + 5);
      assert.notEqual(await transform(), moved);
      // The context menu is cut down to what looks.
      await h.focusStage();
      await page.keyboard.press("Escape");
      await page.keyboard.press("Shift+Digit1");
      await page.waitForTimeout(50);
      const again = await h.centre("api");
      await page.mouse.click(again.x, again.y);
      await h.settled();
      assert.deepEqual(h.session.selected, ["api"]);
      await page.mouse.click(again.x, again.y, { button: "right" });
      const menu = page.locator(".menu");
      assert.equal(await menu.isVisible(), true);
      assert.deepEqual(
        await menu.getByRole("menuitem").evaluateAll((items) => items.map((i) => i.textContent)),
        ["CopyCtrl+C", "Show in text", "Export SVG"],
      );
      await menu.getByRole("menuitem", { name: /^Copy/ }).click();
      await h.settled();
      assert.deepEqual(h.received.at(-1), { type: "copy", ids: ["api"] });
      assert.notEqual(h.clipboard, "");
      // The export goes to the host as always.
      await page.getByRole("button", { name: "Export SVG", exact: true }).click();
      await h.settled();
      assert.deepEqual(h.received.at(-1), { type: "export" });
      assert.equal(h.text, SHEET);
      assert.deepEqual(h.writes(), []);
    },
  },
  {
    name: "read-only: the effects of a diagram play, pause and play again",
    readOnly: true,
    text: SHEET.replace(
      "  placement {",
      "  animate save { effect flow; particles 2 }\n  animate db { effect pulse }\n  placement {",
    ),
    async run(h) {
      const pause = h.page.getByRole("button", { name: "Pause effects" });
      await pause.waitFor({ state: "visible" });
      await h.page.waitForFunction(() =>
        document.querySelector(".content svg style")?.textContent?.includes("@keyframes"),
      );
      await pause.click();
      await h.settled();
      await h.page.waitForFunction(() => !document.querySelector(".content svg style"));
      const play = h.page.getByRole("button", { name: "Play effects" });
      assert.equal(await play.getAttribute("aria-pressed"), "false");
      await play.click();
      await h.settled();
      await h.page.waitForFunction(() =>
        document.querySelector(".content svg style")?.textContent?.includes("@keyframes"),
      );
      assert.equal(await pause.getAttribute("aria-pressed"), "true");
    },
  },
  {
    name: "read-only: a story plays, scrubs and exports, and its timeline has nothing to edit",
    readOnly: true,
    text: STORY,
    async run(h) {
      const page = h.page;
      const picker = page.getByRole("combobox", { name: "Story" });
      await picker.waitFor({ state: "visible" });
      await picker.selectOption("purchase");
      await h.settled();
      const timeline = page.getByRole("region", { name: "Story timeline" });
      await timeline.waitFor({ state: "visible" });
      const opacity = () =>
        page.locator('.content g[data-id="db"][data-role="element"]').getAttribute("opacity");
      assert.equal(await opacity(), "0");
      assert.match((await page.locator(".timeline .clock").textContent()) ?? "", /^0 s \/ 6\.2 s$/);
      // Scrub, then play and pause: as in edit mode.
      const ruler = (await page.locator(".timeline .ruler").boundingBox())!;
      await page.mouse.click(ruler.x + (ruler.width * 400) / 6200, ruler.y + ruler.height / 2);
      assert.equal(await opacity(), "0.5");
      await page.getByRole("button", { name: "Play the story" }).click();
      await page.waitForTimeout(300);
      await page.getByRole("button", { name: "Pause the story" }).click();
      // No grip to retime a bar, and nothing to add, insert or remove.
      assert.equal(await page.locator(".timeline .bar").first().isVisible(), true);
      assert.equal(await page.locator(".timeline .grip").count(), 0);
      for (const name of [
        "Add to scene",
        "New scene after this one",
        "Remove the selected action",
      ]) {
        assert.equal(await timeline.getByRole("button", { name }).isVisible(), false, name);
      }
      assert.equal(await page.getByRole("combobox", { name: "Action to add" }).isVisible(), false);
      // A bar can still be picked, and Delete on it removes nothing.
      await page.locator('.timeline .bar[data-path="0.0"]').click();
      await timeline.focus();
      await page.keyboard.press("Delete");
      await page.keyboard.press("Backspace");
      await h.settled();
      assert.equal(h.text, STORY);
      // A story's frame can still be selected, and the export is still offered.
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      assert.equal(await page.locator(".content .story-selected").count(), 1);
      await page.getByRole("button", { name: "Export the story as an HTML player" }).click();
      await h.settled();
      assert.deepEqual(h.received.at(-1), { type: "exportPlayer", story: "purchase" });
      assert.deepEqual(h.writes(), []);
      // Back to the diagram: still read-only, with the properties disabled.
      await picker.selectOption("");
      await h.settled();
      assert.equal(await timeline.isVisible(), false);
      assert.equal(await page.locator(".view-only-badge").isVisible(), true);
      assert.equal(await page.locator(".toolbar [data-tool]").first().isVisible(), false);
    },
  },
  {
    name: "read-only: switches at run time, both ways, without a reload",
    async run(h) {
      const page = h.page;
      const root = page.locator("#app");
      const readOnly = () => root.evaluate((e) => e.classList.contains("view-only"));
      const palette = page.locator('.toolbar button[data-tool="node"]');
      const badge = page.locator(".view-only-badge");
      const handles = () => page.locator(".overlay [data-handle]").count();
      // A host that never sends `readOnly` sees none of it.
      assert.equal(await readOnly(), false);
      assert.equal(await palette.isVisible(), true);
      assert.equal(await badge.isVisible(), false);
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      // Eight to resize, four to connect and one to rotate.
      assert.equal(await handles(), 13);
      assert.equal(await page.locator("#mdg-field-label").isDisabled(), false);
      // Arm a tool, then turn read-only on: the tool is let go and the editing controls go.
      await palette.click();
      assert.equal(await page.locator(".stage.placing").count(), 1);
      await h.settings({ readOnly: true });
      assert.equal(await readOnly(), true);
      assert.equal(await palette.isVisible(), false);
      assert.equal(await badge.isVisible(), true);
      assert.equal(await page.locator(".stage.placing").count(), 0);
      assert.equal(await palette.getAttribute("aria-pressed"), "false");
      assert.equal(await handles(), 0);
      assert.equal(await page.locator(".overlay .outline").count(), 1, "the selection stays");
      assert.equal(await page.locator("#mdg-field-label").isDisabled(), true);
      assert.equal(
        await page.locator(".status").textContent(),
        "This canvas is view only: you can look around, select, zoom and play stories.",
      );
      // Nothing is placed where the tool would have; a drag of api sends no plan.
      const db = await h.centre("db");
      await page.mouse.click(db.x + 300, db.y + 200);
      await h.settled();
      await dragBy(h, "api", 60, 20);
      assert.equal(h.text, SHEET);
      assert.deepEqual(h.writes(), []);
      // Back to editing: the palette returns and a drag sends a plan again.
      await h.settings({ readOnly: false });
      assert.equal(await readOnly(), false);
      assert.equal(await palette.isVisible(), true);
      assert.equal(await badge.isVisible(), false);
      assert.equal(
        await page.locator(".stage").getAttribute("aria-label"),
        "Diagram canvas. Tab selects elements, arrows move them, Enter edits the label.",
      );
      const apiAgain = await h.centre("api");
      await page.mouse.click(apiAgain.x, apiAgain.y);
      await h.settled();
      // Eight to resize, four to connect and one to rotate.
      assert.equal(await handles(), 13);
      assert.equal(await page.locator("#mdg-field-label").isDisabled(), false);
      assert.equal(
        await page.getByRole("complementary", { name: "Properties", exact: true }).isVisible(),
        true,
      );
      await dragBy(h, "api", 60, 20);
      assert.notEqual(h.text, SHEET);
      assert.ok(h.place("api").x > 126, "moved right");
      assert.equal(h.writes().length, 1);
      // An editor in place that is open when read-only comes is closed, and writes nothing.
      const typed = h.text;
      const now = await h.centre("api");
      await page.mouse.dblclick(now.x, now.y);
      assert.equal(await page.locator("textarea.inline").isVisible(), true);
      await page.locator("textarea.inline").fill("Changed");
      await h.settings({ readOnly: true });
      assert.equal(await page.locator("textarea.inline").count(), 0);
      assert.equal(h.text, typed);
      // A `settings` message without `readOnly`, as VS Code sends them, is edit mode.
      await h.settings(
        {},
        { grid: 14, showGrid: true, snap: true, guides: true, minimap: true, inspector: true },
      );
      assert.equal(await readOnly(), false);
      assert.equal(await palette.isVisible(), true);
    },
  },
  {
    name: "read-only: Ctrl+Z and Ctrl+Y on the canvas stop there, instead of reaching the page's undo",
    async run(h) {
      const page = h.page;
      await page.evaluate(() => {
        const seen: string[] = [];
        (window as unknown as { __undo: string[] }).__undo = seen;
        document.addEventListener("keydown", (e) => {
          if (["z", "y"].includes(e.key.toLowerCase())) seen.push(e.key);
        });
      });
      const reached = () =>
        page.evaluate(() => (window as unknown as { __undo: string[] }).__undo.splice(0));
      const press = async () => {
        await h.focusStage();
        for (const key of ["Control+z", "Control+Shift+z", "Control+y"]) {
          await page.keyboard.press(key);
        }
      };
      // In edit mode the page sees them, as the playground's own undo needs.
      await press();
      assert.equal((await reached()).length, 3);
      await h.settings({ readOnly: true });
      await press();
      assert.deepEqual(await reached(), []);
      assert.equal(
        await page.locator(".status").textContent(),
        "View only: the diagram cannot be changed here.",
      );
      assert.deepEqual(h.writes(), []);
      await h.settings({ readOnly: false });
      await press();
      assert.equal((await reached()).length, 3);
    },
  },
  {
    name: "read-only: the layers can be hidden and shown, never added, renamed, moved or removed",
    readOnly: true,
    text: FREE,
    async run(h) {
      const page = h.page;
      await page.locator('.toolbar button[aria-label^="Show the layers"]').click();
      const panel = page.locator(".panel.layers");
      assert.equal(await panel.isVisible(), true);
      assert.deepEqual(await panel.locator(".layer .name").allTextContents(), ["front", "main"]);
      assert.equal(await panel.getByRole("button", { name: "Add a layer" }).count(), 0);
      assert.equal(await panel.locator(".layer .tools button").count(), 0);
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      assert.equal(
        await panel.getByRole("combobox", { name: "Move the selection to…" }).count(),
        0,
      );
      // A double click on a name renames nothing.
      await panel.locator('.layer[data-layer="front"] .name').dblclick();
      assert.equal(await panel.locator('.layer[data-layer="front"] input').count(), 0);
      // Hiding a layer is looking, and stays.
      const eye = panel.locator('.layer[data-layer="front"] .eye');
      assert.equal(await eye.getAttribute("aria-pressed"), "true");
      await eye.click();
      assert.equal(
        await panel.locator('.layer[data-layer="front"] .eye').getAttribute("aria-pressed"),
        "false",
      );
      // The libraries are a way to add elements: no toggle, no key.
      assert.equal(
        await page.locator('.toolbar button[aria-label^="Show the element libraries"]').isVisible(),
        false,
      );
      await h.focusStage();
      await page.keyboard.press("u");
      assert.equal(await page.locator(".panel.library").isVisible(), false);
      await page.keyboard.press("l");
      assert.equal(await panel.isVisible(), false);
      assert.equal(h.text, FREE);
      assert.deepEqual(h.writes(), []);
    },
  },
  {
    name: "read-only: a sequence diagram keeps its scenarios and moves nothing",
    readOnly: true,
    text: SEQUENCE,
    async run(h) {
      const page = h.page;
      assert.equal(
        await page.locator('.toolbar button[data-tool="participant"]').isVisible(),
        false,
      );
      assert.equal(await page.locator('.toolbar button[data-tool="relation"]').isVisible(), false);
      for (const name of ["More participants", "Divider", "Delay"]) {
        assert.equal(
          await page.getByRole("button", { name, exact: true }).isVisible(),
          false,
          name,
        );
      }
      // A head dragged to another place in the order, a message dragged down, Alt+Up: nothing.
      const bank = await h.centre("bank");
      const customer = await h.centre("customer");
      await page.mouse.move(bank.x, bank.y);
      await page.mouse.down();
      await page.mouse.move((bank.x + customer.x) / 2, bank.y + 30, { steps: 4 });
      await page.mouse.up();
      await h.settled();
      const arrow = await page
        .locator('.content g[data-id="authorize"][data-role="relation"] polyline')
        .first()
        .boundingBox();
      assert.ok(arrow);
      const x = arrow.x + arrow.width / 2;
      const y = arrow.y + arrow.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + 28, { steps: 4 });
      assert.equal(
        await page
          .locator('.content g[data-id="authorize"][data-role="relation"]')
          .getAttribute("transform"),
        null,
      );
      await page.mouse.up();
      await h.settled();
      assert.deepEqual(h.session.selected, ["authorize"]);
      await h.focusStage();
      await page.keyboard.press("Alt+ArrowUp");
      await page.keyboard.press("Alt+a");
      await page.keyboard.press("o");
      await page.keyboard.press("f");
      await h.settled();
      assert.equal(await page.locator(".menu").isVisible(), false);
      assert.equal(h.text, SEQUENCE);
      assert.deepEqual(h.writes(), []);
      // The preview of a scenario is looking: it still works.
      await page.locator('.toolbar select[aria-label="Scenario"]').selectOption("happy");
      await h.settled();
      assert.equal(h.session.previewed, "happy");
      assert.equal(await page.locator('.content g[data-id="declined"]').count(), 0);
    },
  },
  {
    name: "read-only: a C4 view offers its model and the export, not the entities to add",
    readOnly: true,
    text: C4,
    async run(h) {
      const page = h.page;
      assert.equal(
        await page.locator('.toolbar button[aria-label="Add from the model…"]').isVisible(),
        false,
      );
      await h.focusStage();
      await page.keyboard.press("a");
      assert.equal(await page.locator(".picker").isVisible(), false);
      const customer = await h.centre("customer");
      await page.mouse.click(customer.x, customer.y, { button: "right" });
      const menu = page.locator(".menu");
      assert.equal(await menu.isVisible(), true);
      assert.deepEqual(
        await menu.getByRole("menuitem").evaluateAll((items) => items.map((i) => i.textContent)),
        ["CopyCtrl+C", "Show in text", "Open the model", "Export SVG"],
      );
      await menu.getByRole("menuitem", { name: "Open the model" }).click();
      await h.settled();
      assert.deepEqual(h.received.at(-1), { type: "openModel" });
      assert.equal(h.text, C4);
      assert.deepEqual(h.writes(), []);
    },
  },
  {
    name: "read-only: a declared type's palette is hidden too",
    readOnly: true,
    text: 'diagram schema: erd {\n  layout manual\n  entity orders "Orders" { owner "Sales" }\n  placement {\n    place orders at (140, 84)\n  }\n}\n',
    types: [ERD],
    async run(h) {
      const tools = h.page.locator(".toolbar button[data-declared]");
      assert.equal(await tools.count(), 2);
      for (const tool of await tools.all()) assert.equal(await tool.isVisible(), false);
      await h.focusStage();
      await h.page.keyboard.press("Escape");
      assert.deepEqual(h.writes(), []);
    },
  },
  {
    name: "read-only: speaks Spanish in its badge, labels and status line",
    readOnly: true,
    lang: "es",
    async run(h) {
      const page = h.page;
      const badge = page.locator(".view-only-badge");
      assert.equal(await badge.textContent(), "solo lectura");
      assert.match((await badge.getAttribute("title")) ?? "", /^Solo lectura: /);
      assert.match((await page.locator(".stage").getAttribute("aria-label")) ?? "", /solo lectura/);
      assert.equal(
        await page.locator(".status").textContent(),
        "Este lienzo es de solo lectura: puedes recorrerlo, seleccionar, acercar y reproducir historias.",
      );
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      assert.equal(await page.locator(".status").textContent(), "Nodo api, API, seleccionado.");
      assert.equal(
        await page.getByRole("complementary", { name: "Propiedades, solo lectura" }).isVisible(),
        true,
      );
      await h.focusStage();
      await page.keyboard.press("Delete");
      assert.equal(
        await page.locator(".status").textContent(),
        "Solo lectura: el diagrama no se puede cambiar aquí.",
      );
      assert.equal(h.text, SHEET);
      assert.deepEqual(h.writes(), []);
    },
  },
  // Presence: other people's selections, from the host's `presence` message (`live-collaboration`).
  {
    name: "presence: draws an outline and a name tag for each person, in their colour, above the scene",
    async run(h) {
      const page = h.page;
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      assert.equal(await page.locator(".presence-outline, .presence-tag").count(), 0, "nobody yet");
      // `ghost` is not in the scene: it draws nothing and raises nothing.
      await h.presence([BEN, { ...ANA, selection: ["db", "ghost"] }, LI]);
      const found = await drawn(h);
      assert.deepEqual(
        found.outlines.map((o) => [o.tag, o.target, o.stroke]),
        [
          ["rect", "api", "#1c7ed6"],
          ["rect", "db", "#e03131"],
          ["rect", "cache", "#364fc7"],
        ],
      );
      // Black text on the light colours and white on the dark one: whichever reads better.
      assert.deepEqual(
        found.tags.map((t) => [t.target, t.text, t.background, t.color]),
        [
          ["api", "Ben", "rgb(28, 126, 214)", "rgb(0, 0, 0)"],
          ["db", "Ana", "rgb(224, 49, 49)", "rgb(0, 0, 0)"],
          ["cache", "Li", "rgb(54, 79, 199)", "rgb(255, 255, 255)"],
        ],
      );
      // Each outline lies on its element's border and each tag sits just above its top-left corner.
      // The reference is the canvas's own outline of the element, drawn from the same box.
      for (const [index, id] of ["api", "db", "cache"].entries()) {
        const centre = await h.centre(id);
        await page.mouse.click(centre.x, centre.y);
        await h.settled();
        const own = await page.locator(".overlay rect.outline").evaluate((e) => {
          const r = e.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        });
        near(found.outlines[index]!.box, own, 3, `the outline of ${id}`);
        const tag = found.tags[index]!.box;
        assert.ok(Math.abs(tag.x - own.x) <= 2, `the tag of ${id} is at ${tag.x}, not ${own.x}`);
        const gap = own.y - (tag.y + tag.height);
        assert.ok(gap >= 0 && gap <= 4, `the tag of ${id} is ${gap} px above its element`);
      }
      // The layer is above the scene and below the selection's overlay, and quiet for readers.
      assert.deepEqual(
        await page
          .locator(".stage > *")
          .evaluateAll((els) => els.slice(0, 3).map((e) => e.getAttribute("class"))),
        ["content", "presence", "overlay"],
      );
      assert.equal(await page.locator(".presence").getAttribute("aria-hidden"), "true");
      assert.equal(await page.locator(".presence-outlines").getAttribute("aria-hidden"), "true");
      assert.equal(
        await page.locator(".presence [tabindex], .presence button, .presence a").count(),
        0,
      );
      assert.equal(await page.locator("[aria-live] .presence-tag").count(), 0);
      assert.deepEqual(h.writes(), []);
      await page.screenshot({ path: join(output, "canvas-presence.png") });
      assert.deepEqual(errors, []);
    },
  },
  {
    name: "presence: a press on an outline or a tag goes through to what lies under it",
    async run(h) {
      const page = h.page;
      await h.presence([BEN, ANA]);
      const api = await boxOf(h, "api");
      const [tag, anaTag] = (await drawn(h)).tags.map((t) => t.box) as [Rect, Rect];
      // Nothing of the layer is under the pointer, on the border where Ben's outline lies or on
      // his tag: the element is, and a press there selects it for the person, not Ben's outline.
      const edge = { x: api.x + 1, y: api.y + api.height / 2 };
      const middle = { x: tag.x + tag.width / 2, y: tag.y + tag.height / 2 };
      const under = (at: { x: number; y: number }) =>
        page.evaluate(({ x, y }) => {
          const e = document.elementFromPoint(x, y);
          return {
            presence: e?.closest(".presence") != null,
            element: e?.closest('[data-role="element"]')?.getAttribute("data-id") ?? null,
          };
        }, at);
      assert.deepEqual(await under(edge), { presence: false, element: "api" });
      assert.deepEqual((await under(middle)).presence, false);
      assert.deepEqual(
        await page
          .locator(".presence, .presence *")
          .evaluateAll((els) => els.map((e) => getComputedStyle(e).pointerEvents)),
        Array(8).fill("none"),
        "the layer, its svg, the trails' canvas, the cursors' layer, two outlines and two tags",
      );
      await page.mouse.click(edge.x, edge.y);
      await h.settled();
      assert.deepEqual(h.session.selected, ["api"]);
      assert.deepEqual(h.received.at(-1), { type: "select", ids: ["api"] });
      // The person's own outline and the others' are all there, each on its own layer.
      assert.equal(await page.locator(".overlay .outline").count(), 1);
      assert.equal(await page.locator(".presence-outline").count(), 2);
      // A press on Ana's tag starts a rubber band, as it would on the empty canvas: this one,
      // from the tag above db to below and left of api, holds api and not db.
      await page.mouse.move(anaTag.x + anaTag.width / 2, anaTag.y + anaTag.height / 2);
      await page.mouse.down();
      await page.mouse.move(api.x - 12, api.y + api.height + 12, { steps: 5 });
      assert.equal(await page.locator(".overlay .band").count(), 1);
      await page.mouse.up();
      await h.settled();
      assert.ok(h.session.selected.includes("api"), `selected ${h.session.selected}`);
      assert.ok(!h.session.selected.includes("db") && !h.session.selected.includes("cache"));
      // Select all and Tab know the scene's elements only; the status never names a person.
      await h.focusStage();
      await page.keyboard.press("Control+a");
      await h.settled();
      assert.deepEqual([...h.session.selected].sort(), ["api", "cache", "db"]);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Tab");
      await h.settled();
      assert.deepEqual(h.session.selected, ["api"]);
      assert.equal(await page.locator(".status").textContent(), "node api, API, selected.");
      const tree = await page.locator("body").ariaSnapshot();
      assert.doesNotMatch(tree, /Ben/, "assistive technology is told nothing of the layer");
    },
  },
  {
    name: "presence: an id the scene lacks draws nothing and raises no error",
    async run(h) {
      const page = h.page;
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await h.presence([{ name: "Ben", colour: "#1c7ed6", selection: ["ghost", "api.nope", ""] }]);
      assert.equal(await page.locator(".presence-outline, .presence-tag").count(), 0);
      // Malformed messages are nobody, too: a list that is not one, entries without a name.
      await h.postRaw({ type: "presence", people: "oops" });
      await h.postRaw({ type: "presence" });
      await h.postRaw({ type: "presence", people: [null, 3, { name: 7 }, { name: "Eve" }] });
      assert.equal(await page.locator(".presence-outline, .presence-tag").count(), 0);
      // And what is valid beside what is not still draws.
      await h.postRaw({
        type: "presence",
        people: [{ name: "Bad" }, { ...BEN, selection: ["api", 3, null, "ghost"] }],
      });
      const found = await drawn(h);
      assert.deepEqual(
        found.tags.map((t) => t.text),
        ["Ben"],
      );
      assert.deepEqual(errors, []);
    },
  },
  {
    name: "presence: a name or a colour holding markup shows as characters and builds nothing",
    async run(h) {
      const page = h.page;
      const names = [
        "<img src=x>",
        '<img src=x onerror="window.__pwned = 1">',
        "</span><b>bold</b>",
        "&lt;i&gt; &amp;",
        "<svg onload=alert(1)>",
      ];
      await h.presence([
        ...names.map((name, i) => ({
          name,
          colour: [
            'red; background: url("javascript:1")',
            '"><img src=x>',
            "#fff",
            "var(--x)",
            "#000",
          ][i]!,
          selection: ["api"],
        })),
      ]);
      const found = await drawn(h);
      assert.deepEqual(
        found.tags.map((t) => t.text),
        names,
        "every tag shows its name's characters",
      );
      // No element was made from a name: the layer holds a div, the svg, the trails' canvas, rects
      // and spans only.
      assert.deepEqual(
        await page
          .locator(".presence, .presence *")
          .evaluateAll((els) => [...new Set(els.map((e) => e.tagName.toLowerCase()))].sort()),
        ["canvas", "div", "rect", "span", "svg"],
      );
      assert.equal(await page.locator(".presence img, .presence b, .presence i").count(), 0);
      // Each tag is one element holding one text node.
      assert.deepEqual(
        await page
          .locator(".presence-tag")
          .evaluateAll((els) => els.map((e) => [...e.childNodes].map((n) => n.nodeType))),
        names.map(() => [3]),
      );
      assert.equal(
        await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned),
        undefined,
      );
      // A colour that is not one never reaches a style: the neutral grey, or the colour read out.
      assert.deepEqual(
        found.outlines.map((o) => o.stroke),
        ["#6b7280", "#6b7280", "#ffffff", "#6b7280", "#000000"],
      );
      assert.deepEqual(
        found.tags.map((t) => t.background),
        [
          "rgb(107, 114, 128)",
          "rgb(107, 114, 128)",
          "rgb(255, 255, 255)",
          "rgb(107, 114, 128)",
          "rgb(0, 0, 0)",
        ],
      );
    },
  },
  {
    name: "presence: follows the pan and the zoom, a drag, and the element when the text moves it",
    async run(h) {
      const page = h.page;
      await h.presence([BEN]);
      // The element's own drawing differs from its box by its stroke, which grows with the zoom:
      // the centres agree closely and the sizes to within a few pixels.
      const follows = async (label: string) => {
        const outline = (await drawn(h)).outlines[0]!.box;
        const element = await boxOf(h, "api");
        const [dx, dy] = [
          outline.x + outline.width / 2 - (element.x + element.width / 2),
          outline.y + outline.height / 2 - (element.y + element.height / 2),
        ];
        assert.ok(Math.hypot(dx, dy) <= 3, `${label}: the centres are ${dx}, ${dy} apart`);
        const slack = 6 + 0.02 * element.width;
        assert.ok(Math.abs(outline.width - element.width) <= slack, `${label}: width`);
        assert.ok(Math.abs(outline.height - element.height) <= slack, `${label}: height`);
      };
      await follows("at first");
      // Ctrl and the wheel zoom, the wheel pans, Shift+1 fits again.
      await page.mouse.move(600, 400);
      await page.keyboard.down("Control");
      await page.mouse.wheel(0, -400);
      await page.keyboard.up("Control");
      await page.waitForTimeout(50);
      await follows("zoomed");
      await page.mouse.wheel(0, 90);
      await page.waitForTimeout(50);
      await follows("panned");
      await h.focusStage();
      await page.keyboard.press("Shift+Digit1");
      await page.waitForTimeout(50);
      await follows("fitted");
      // A drag of api carries Ben's outline and tag with it, while the button is down and after.
      const before = (await drawn(h)).tags[0]!.box;
      await dragBy(h, "api", 70, 28, async () => {
        await follows("while api is dragged");
        const moving = (await drawn(h)).tags[0]!.box;
        assert.ok(moving.x > before.x + 20, "the tag went along");
      });
      assert.ok(h.place("api").x > 126, "api moved");
      await follows("after the drag");
      // The host sends a render with api somewhere else, as when another person edits the text.
      await h.type(h.text.replace(/place api at \(\d+, \d+\)/, "place api at (126, 280)"));
      await follows("after the text moved it");
      // Editing the same diagram does not clear it.
      await h.type(h.text.replace('cache["Cache"]', 'cache["Cache 2"]'));
      assert.equal(await page.locator(".presence-outline").count(), 1);
    },
  },
  {
    name: "presence: each message replaces the last, and nobody, another diagram or no diagram clears it",
    async run(h) {
      const page = h.page;
      const targets = async () => (await drawn(h)).outlines.map((o) => o.target);
      await h.presence([BEN, ANA]);
      assert.deepEqual(await targets(), ["api", "db"]);
      // Replaced, not merged: Ben is gone, Ana stays.
      await h.presence([ANA]);
      assert.deepEqual(await targets(), ["db"]);
      assert.deepEqual(
        (await drawn(h)).tags.map((t) => t.text),
        ["Ana"],
      );
      // A message without people is the way to clear it.
      await h.presence([]);
      assert.deepEqual(await targets(), []);
      assert.equal(await page.locator(".presence-tag").count(), 0);
      // A render of another diagram clears it; the host sends it again after the render.
      await h.presence([BEN]);
      assert.deepEqual(await targets(), ["api"]);
      await h.type(h.text.replace("diagram d: flow", "diagram other: flow"));
      assert.deepEqual(await targets(), [], "another diagram is another picture");
      assert.equal(await page.locator(".presence-tag").count(), 0);
      await h.presence([BEN]);
      assert.deepEqual(await targets(), ["api"]);
      // A message that leaves nothing to show clears it as well...
      await h.type("");
      assert.equal(await page.locator(".empty").isVisible(), true);
      assert.deepEqual(await targets(), []);
      assert.equal(await page.locator(".presence-tag").count(), 0);
      // ...and one that arrives while nothing is shown waits for the first render.
      await h.presence([BEN]);
      assert.deepEqual(await targets(), []);
      await h.type(SHEET);
      assert.deepEqual(await targets(), ["api"]);
    },
  },
  {
    name: "presence: several people on one element stack their tags and nest their outlines",
    async run(h) {
      await h.presence([
        BEN,
        { ...ANA, selection: ["api", "save"] },
        { ...LI, selection: ["api", "api", "api"] },
      ]);
      const found = await drawn(h);
      const api = await boxOf(h, "api");
      // The first person's outline lies on the border and each next one just outside it.
      const onApi = found.outlines.filter((o) => o.target === "api");
      assert.deepEqual(
        onApi.map((o) => o.stroke),
        ["#1c7ed6", "#e03131", "#364fc7"],
      );
      for (let i = 1; i < onApi.length; i++) {
        const [inner, outer] = [onApi[i - 1]!.box, onApi[i]!.box];
        assert.ok(outer.x < inner.x && outer.y < inner.y, `outline ${i} lies outside ${i - 1}`);
        assert.ok(outer.width > inner.width && outer.height > inner.height);
      }
      near(onApi[0]!.box, api, 4, "the first outline is on the border");
      // The tags are a column above the box, the first person nearest, none over another.
      const tags = found.tags.filter((t) => t.target === "api");
      assert.deepEqual(
        tags.map((t) => t.text),
        ["Ben", "Ana", "Li"],
      );
      // (Above the element, or below it when the stage has no room above: it rises or it falls.)
      const above = tags[0]!.box.y < api.y;
      for (let i = 0; i < tags.length; i++) {
        assert.equal(overlaps(tags[i]!.box, api), false, `tag ${i} is clear of the element`);
        for (let j = i + 1; j < tags.length; j++) {
          assert.equal(overlaps(tags[i]!.box, tags[j]!.box), false, `tags ${i} and ${j} overlap`);
        }
        if (i > 0) {
          const step = tags[i]!.box.y - tags[i - 1]!.box.y;
          assert.ok(above ? step < 0 : step > 0, "the column goes one way, away from the element");
        }
        assert.equal(Math.round(tags[i]!.box.x), Math.round(tags[0]!.box.x), "left-aligned");
      }
      // Ana's selection also holds the relation `save`: a line with her tag above it.
      const save = found.outlines.find((o) => o.target === "save");
      assert.equal(save?.tag, "polyline");
      assert.equal(save?.stroke, "#e03131");
      assert.deepEqual(
        found.tags.filter((t) => t.target === "save").map((t) => t.text),
        ["Ana"],
      );
    },
  },
  {
    name: "presence: outlines messages, a lifeline's participant and a fragment of a sequence diagram",
    text: SEQUENCE,
    async run(h) {
      await h.presence([
        { name: "Ben", colour: "#1c7ed6", selection: ["customer", "pay", "result"] },
      ]);
      const found = await drawn(h);
      assert.deepEqual(
        found.outlines.map((o) => [o.target, o.tag]),
        [
          ["customer", "rect"],
          ["pay", "polyline"],
          ["result", "rect"],
        ],
      );
      assert.equal((await drawn(h)).tags.length, 3);
      // The participant's outline is where its head is; the fragment's is its whole frame.
      const head = await boxOf(h, "customer");
      const [participant, , frame] = found.outlines.map((o) => o.box) as [Rect, Rect, Rect];
      // (The participant's box holds its head and its name: the outline surrounds the head.)
      assert.ok(
        participant.x <= head.x + 2 &&
          participant.y <= head.y + 2 &&
          participant.x + participant.width >= head.x + head.width - 2 &&
          participant.y + participant.height >= head.y + head.height - 2,
        `outline ${JSON.stringify(participant)}, head ${JSON.stringify(head)}`,
      );
      assert.ok(frame.width > head.width && frame.height > head.height, "the fragment is large");
    },
  },
  {
    name: "sequence: selects and pulses a participant beside an actor on its drawn box",
    text: SEQUENCE.replace(
      "  scenario happy",
      "  animate api { effect pulse }\n\n  scenario happy",
    ),
    async run(h) {
      const page = h.page;
      const rect = page.locator('.content g[data-id="api"][data-role="element"] rect').first();
      const drawnBox = await rect.boundingBox();
      assert.ok(drawnBox, "no rectangle drawn for api");
      await page.mouse.click(drawnBox.x + drawnBox.width / 2, drawnBox.y + drawnBox.height / 2);
      await h.settled();
      assert.deepEqual(h.session.selected, ["api"]);
      const frame = await page.locator(".overlay rect.outline").boundingBox();
      assert.ok(frame, "no selection outline");
      // Each edge of the frame within a pixel of the drawn box's (it sits half its stroke out).
      const edges = (b: Rect) => [b.x, b.y, b.x + b.width, b.y + b.height];
      const drawnEdges = edges(drawnBox);
      edges(frame).forEach((edge, i) =>
        assert.ok(
          Math.abs(edge - drawnEdges[i]!) <= 1,
          `outline ${JSON.stringify(frame)} on the drawn box ${JSON.stringify(drawnBox)}`,
        ),
      );
      // The pulse's halo is the drawn box, not the head row above it.
      const boxes = await page.evaluate(() => {
        const halo = document.querySelector<SVGGraphicsElement>(".content svg path.mdg-m")!;
        const head = document.querySelector<SVGGraphicsElement>(
          '.content g[data-id="api"][data-role="element"] rect',
        )!;
        const a = halo.getBBox();
        const b = head.getBBox();
        return [
          { x: a.x, y: a.y, width: a.width, height: a.height },
          { x: b.x, y: b.y, width: b.width, height: b.height },
        ];
      });
      const [halo, head] = boxes as [Rect, Rect];
      assert.ok(
        Math.abs(halo.x + halo.width / 2 - (head.x + head.width / 2)) <= 1 &&
          Math.abs(halo.y + halo.height / 2 - (head.y + head.height / 2)) <= 1,
        `halo ${JSON.stringify(halo)} centred on ${JSON.stringify(head)}`,
      );
      await page.screenshot({ path: join(output, "canvas-sequence-head.png") });
    },
  },
  {
    name: "presence: keeps tags readable in a dark page for every colour of the palette",
    theme: DARK,
    async run(h) {
      const palette = [
        ...["#e03131", "#f08c00", "#2f9e44", "#1c7ed6", "#7048e8", "#c2255c"],
        ...["#0c8599", "#d9480f", "#5f3dc4", "#099268", "#364fc7", "#a61e4d"],
      ];
      const ids = ["api", "db", "cache"];
      await h.presence(
        palette.map((colour, i) => ({
          name: `Person ${i + 1}`,
          colour,
          selection: [ids[i % 3]!],
        })),
      );
      // The WCAG contrast of the colours the browser computed for each tag (no named functions
      // inside: the test runner's bundler would add a helper the page lacks).
      const ratios = await h.page.evaluate(() =>
        [...document.querySelectorAll(".presence-tag")].map((tag) => {
          const style = getComputedStyle(tag);
          const [a, b] = [style.color, style.backgroundColor].map((css) => {
            const [r, g, b] = (css.match(/[\d.]+/g) ?? [])
              .slice(0, 3)
              .map((v) => Number(v) / 255)
              .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
            return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
          });
          return (Math.max(a!, b!) + 0.05) / (Math.min(a!, b!) + 0.05);
        }),
      );
      assert.equal(ratios.length, 12);
      for (const [i, ratio] of ratios.entries()) {
        assert.ok(ratio >= 4.5, `${palette[i]}: the tag's text has a contrast of ${ratio}`);
      }
      await h.page.screenshot({ path: join(output, "canvas-presence-dark.png") });
    },
  },
  {
    name: "presence: leaves out what is on a hidden layer",
    text: SHEET.replace("  layout manual\n", "  layout manual\n  layers back, main\n").replace(
      'api["API"]',
      'api["API"] { layer back }',
    ),
    async run(h) {
      const page = h.page;
      await page.locator('.toolbar button[aria-label^="Show the layers"]').click();
      const eye = page.locator('.panel.layers .layer[data-layer="back"] .eye');
      await h.presence([BEN, ANA]);
      assert.deepEqual(
        (await drawn(h)).tags.map((t) => t.text),
        ["Ben", "Ana"],
      );
      await eye.click();
      assert.deepEqual(
        (await drawn(h)).tags.map((t) => t.text),
        ["Ana"],
        "api is hidden, so is Ben's mark on it",
      );
      await eye.click();
      assert.deepEqual(
        (await drawn(h)).tags.map((t) => t.text),
        ["Ben", "Ana"],
      );
    },
  },
  {
    name: "presence: is no part of the export, the copy, the minimap or anything the canvas sends",
    async run(h) {
      const page = h.page;
      const exported = () => renderDiagram(h.analyze(h.text, h.revision), "d")!.svg;
      const without = exported();
      const scene = await page.locator(".content").innerHTML();
      const map = await page.locator(".minimap").innerHTML();
      const sent = h.received.length;
      await h.presence([{ name: "Zed Presence", colour: "#7048e8", selection: ["api", "save"] }]);
      assert.equal((await drawn(h)).outlines.length, 2, "it is drawn");
      // The SVG the export writes is the document's: byte for byte what it was.
      assert.equal(exported(), without);
      assert.ok(!exported().includes("Zed Presence") && !exported().includes("7048e8"));
      // Nothing was added to the scene or to the minimap, which draw the diagram alone.
      assert.equal(await page.locator(".content").innerHTML(), scene);
      assert.equal(await page.locator(".minimap").innerHTML(), map);
      assert.equal(await page.locator(".content .presence, .minimap .presence-outline").count(), 0);
      assert.equal(h.received.length, sent, "a presence message makes the canvas say nothing");
      // Export and copy ask the host as always, and carry nothing of it.
      await page.getByRole("button", { name: "Export SVG", exact: true }).click();
      await h.settled();
      assert.deepEqual(h.received.at(-1), { type: "export" });
      assert.equal(exported(), without);
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      await h.focusStage();
      await page.keyboard.press("Control+c");
      await h.settled();
      assert.deepEqual(h.received.at(-1), { type: "copy", ids: ["api"] });
      assert.ok(h.clipboard.includes("api"), "the copy holds the element");
      assert.ok(!h.clipboard.includes("Zed") && !h.clipboard.includes("7048e8"));
      // The content of the scene is still the diagram alone, and nothing posted names anyone.
      assert.equal(await page.locator(".content .presence-tag").count(), 0);
      const posted = JSON.stringify(h.received);
      assert.ok(!posted.includes("Zed Presence") && !posted.toLowerCase().includes("7048e8"));
      assert.deepEqual(h.writes(), []);
      assert.equal(h.text, SHEET);
    },
  },
  {
    name: "presence: read-only: still shows the others' selections, and still sends nothing",
    readOnly: true,
    async run(h) {
      const page = h.page;
      const sent = h.received.length;
      await h.presence([BEN, ANA]);
      assert.equal(h.received.length, sent, "presence makes a read-only canvas say nothing");
      const found = await drawn(h);
      assert.deepEqual(
        found.tags.map((t) => [t.target, t.text, t.background]),
        [
          ["api", "Ben", "rgb(28, 126, 214)"],
          ["db", "Ana", "rgb(224, 49, 49)"],
        ],
      );
      assert.equal(await page.locator("#app.view-only").count(), 1);
      // A person who only looks can still select; the two kinds of outline sit side by side.
      const cache = await h.centre("cache");
      await page.mouse.click(cache.x, cache.y);
      await h.settled();
      assert.deepEqual(h.session.selected, ["cache"]);
      assert.equal(await page.locator(".overlay .outline").count(), 1);
      assert.equal(await page.locator(".overlay [data-handle]").count(), 0);
      assert.equal(await page.locator(".presence-outline").count(), 2);
      // A press on Ben's outline selects the element under it, here as in an editing canvas.
      const api = await boxOf(h, "api");
      await page.mouse.click(api.x + 1, api.y + api.height / 2);
      await h.settled();
      assert.deepEqual(h.session.selected, ["api"]);
      assert.deepEqual(h.writes(), []);
      // Turning editing on and off again keeps what the others have selected.
      await h.settings({ readOnly: false });
      assert.equal(await page.locator(".presence-outline").count(), 2);
      await h.settings({ readOnly: true });
      assert.equal(await page.locator(".presence-outline").count(), 2);
      assert.equal(h.text, SHEET);
    },
  },
  {
    name: "presence: reports the pointer to a host that shares presence, and only to one",
    async run(h) {
      const page = h.page;
      const pointers = () =>
        h.received.filter((m) => (m as { type: string }).type === "presencePointer");
      const api = await h.centre("api");
      // A host that never sent `presence` (an editor of one person's diagram) is told nothing.
      await page.mouse.move(api.x, api.y);
      await h.settled();
      assert.deepEqual(pointers(), []);
      await h.presence([]);
      await page.mouse.move(api.x + 10, api.y + 4);
      await page.waitForTimeout(80);
      await h.settled();
      const [first] = pointers() as { point: { x: number; y: number }; diagram?: string }[];
      assert.ok(first, "the pointer was reported");
      assert.equal(first.diagram, "d");
      // In diagram units: api is placed at (126, 112), and the pointer is inside it.
      assert.ok(first.point.x > 126 && first.point.y > 112, JSON.stringify(first.point));
      assert.ok(Number.isInteger(first.point.x) && Number.isInteger(first.point.y));
      // A burst of moves is at most a message every 50 ms, not one per move; the last position
      // always arrives.
      const before = pointers().length;
      const started = Date.now();
      for (let i = 1; i <= 20; i++) await page.mouse.move(api.x + i, api.y + i);
      const took = Date.now() - started;
      await page.waitForTimeout(120);
      await h.settled();
      const burst = pointers().slice(before) as { point: { x: number; y: number } }[];
      assert.ok(
        burst.length >= 1 && burst.length <= Math.ceil(took / 50) + 2 && burst.length < 20,
        `${burst.length} messages for 20 moves in ${took} ms`,
      );
      const end = burst.at(-1)!.point;
      assert.ok(end.x > first.point.x, "the last position arrived");
      // Leaving the canvas says so.
      await page.mouse.move(2, 2);
      await page.waitForTimeout(80);
      await h.settled();
      assert.deepEqual(pointers().at(-1), { type: "presencePointer", point: null });
      assert.deepEqual(h.writes(), []);
    },
  },
  {
    name: "presence: draws a cursor at each pointer, gliding, at every zoom, with the name as text, never exported",
    async run(h) {
      const page = h.page;
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const exported = () => renderDiagram(h.analyze(h.text, h.revision), "d")!.svg;
      const without = exported();
      // The canvas's own report of a screen point is the diagram point a cursor there must show.
      const reportAt = async (x: number, y: number) => {
        await page.mouse.move(x, y);
        await page.waitForTimeout(80);
        await h.settled();
        const last = h.received
          .filter((m) => (m as { type: string }).type === "presencePointer")
          .at(-1) as { point: { x: number; y: number } | null };
        assert.ok(last.point, "a point was reported");
        // The pointer leaves the stage again, so that it does not stand for the cursor.
        await page.mouse.move(2, 2);
        return last.point;
      };
      const cursor = async () =>
        page.evaluate(() => {
          const e = document.querySelector(".presence .presence-cursor");
          if (!e) return undefined;
          const r = e.getBoundingClientRect();
          const arrow = e.querySelector("svg")!.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            arrow: { width: arrow.width, height: arrow.height },
            gliding: e.classList.contains("gliding"),
            transition: getComputedStyle(e).transitionDuration,
            tag: e.querySelector(".presence-cursor-tag")?.textContent ?? "",
          };
        });
      await h.presence([]);
      const api = await h.centre("api");
      const at = await reportAt(api.x, api.y);
      const name = "<img src=x onerror=alert(1)>";
      await h.presence([{ name, colour: "#1c7ed6", selection: [], pointer: at }]);
      await page.waitForTimeout(300);
      const drawnAt = await cursor();
      assert.ok(drawnAt, "a cursor is drawn");
      // The tip is one pixel into the arrow's box: it is where the pointer was on Ben's screen.
      assert.ok(Math.abs(drawnAt.x + 1 - api.x) <= 1.5, `tip x ${drawnAt.x + 1} for ${api.x}`);
      assert.ok(Math.abs(drawnAt.y + 1 - api.y) <= 1.5, `tip y ${drawnAt.y + 1} for ${api.y}`);
      assert.equal(drawnAt.gliding, false, "a new cursor appears where it is");
      // The name is the characters it is, in a text node, and builds nothing.
      assert.equal(drawnAt.tag, name);
      assert.equal(await page.locator(".presence img, .presence script").count(), 0);
      // A press on the cursor goes through to the element under it.
      const through = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest(".presence") == null,
        { x: api.x + 2, y: api.y + 2 },
      );
      assert.equal(through, true);
      // The next point glides there in 200 ms.
      await h.presence([
        { name, colour: "#1c7ed6", selection: [], pointer: { x: at.x + 60, y: at.y } },
      ]);
      const moving = await cursor();
      assert.equal(moving?.gliding, true);
      assert.equal(moving?.transition, "0.2s");
      await page.waitForTimeout(350);
      const glided = await cursor();
      assert.ok(glided && glided.x > drawnAt.x + 40, "it went along");
      // At 50% the tip is still on the point the canvas reports there, and the glyph keeps its size.
      await page.getByRole("combobox", { name: "Zoom" }).selectOption("0.5");
      await page.waitForTimeout(80);
      const half = await h.centre("api");
      const there = await reportAt(half.x, half.y);
      await h.presence([{ name: "Ben", colour: "#1c7ed6", selection: [], pointer: there }]);
      await page.waitForTimeout(300);
      const small = await cursor();
      assert.ok(small, "a cursor is drawn at 50%");
      assert.ok(Math.abs(small.x + 1 - half.x) <= 1.5, `zoomed tip x ${small.x + 1} for ${half.x}`);
      assert.ok(Math.abs(small.y + 1 - half.y) <= 1.5, `zoomed tip y ${small.y + 1} for ${half.y}`);
      assert.deepEqual(small.arrow, drawnAt.arrow, "the glyph keeps its size on screen");
      // A pointer that is not two finite numbers draws nothing, and raises nothing.
      await h.postRaw({
        type: "presence",
        people: [{ name: "Eve", colour: "#000", selection: [], pointer: { x: "1", y: null } }],
      });
      assert.equal(await page.locator(".presence-cursor").count(), 0);
      // Nobody leaves no cursor; the export never had one.
      await h.presence([{ name: "Zed", colour: "#7048e8", selection: [], pointer: there }]);
      assert.equal(await page.locator(".presence-cursor").count(), 1);
      assert.equal(exported(), without);
      assert.ok(!exported().includes("Zed") && !exported().includes("presence"));
      assert.equal(
        await page.locator(".content .presence-cursor, .minimap .presence-cursor").count(),
        0,
      );
      await h.presence([]);
      assert.equal(await page.locator(".presence-cursor").count(), 0);
      await page.screenshot({ path: join(output, "canvas-presence-pointer.png") });
      assert.deepEqual(h.writes(), []);
      assert.deepEqual(errors, []);
    },
  },
  {
    name: "presence: is hidden while a story plays and drawn again when it ends",
    text: STORY,
    async run(h) {
      const page = h.page;
      await h.presence([BEN, ANA]);
      assert.equal(await page.locator(".presence").isVisible(), true);
      assert.equal(await page.locator(".presence-outline").count(), 2);
      const picker = page.getByRole("combobox", { name: "Story" });
      await picker.waitFor({ state: "visible" });
      await picker.selectOption("purchase");
      await h.settled();
      await page.getByRole("region", { name: "Story timeline" }).waitFor({ state: "visible" });
      // A story's frames are not the scene the ids name: nothing is drawn on them.
      assert.equal(await page.locator(".presence").isVisible(), false);
      assert.equal(await page.locator(".presence-outline, .presence-tag").count(), 0);
      // A message that arrives meanwhile replaces what is kept, and is drawn when the story ends.
      await h.presence([{ ...LI, selection: ["db"] }]);
      assert.equal(await page.locator(".presence").isVisible(), false);
      await picker.selectOption("");
      await h.settled();
      assert.equal(await page.locator(".presence").isVisible(), true);
      assert.deepEqual(
        (await drawn(h)).tags.map((t) => [t.target, t.text]),
        [["db", "Li"]],
      );
    },
  },
  {
    name: "notes: O makes a note on a free diagram, with its text editor open",
    text: FREE,
    async run(h) {
      const page = h.page;
      assert.equal(await page.locator('.toolbar button[data-tool="note"]').isVisible(), true);
      await h.focusStage();
      await page.keyboard.press("o");
      await h.settled();
      assert.match(h.text, /\n {2}note note1 "Note"\n/);
      assert.ok(h.place("note1"), "a place near the centre");
      assert.deepEqual(h.session.selected, ["note1"]);
      assert.equal(await page.locator("textarea.inline").inputValue(), "Note");
      await page.keyboard.press("Escape");
      assert.equal(await page.locator(".inline").count(), 0);
    },
  },
  {
    name: "notes: O makes a note in a C4 view, and its inspector shows the note's fields and none of an entity's",
    text: C4,
    async run(h) {
      const page = h.page;
      assert.equal(await page.locator('.toolbar button[data-tool="note"]').isVisible(), true);
      await h.focusStage();
      await page.keyboard.press("o");
      await h.settled();
      // In the view; the model is untouched.
      assert.match(
        h.text,
        /level container\n {2}scope shop\n {2}include [^\n]*\n {2}note note1 "Note"\n/,
      );
      assert.ok(h.text.startsWith("model commerce {"), "the model comes first, as it was");
      assert.equal(
        h.text.split("model commerce")[1]!.split("diagram containers")[0]!.includes("note"),
        false,
      );
      assert.deepEqual(h.session.selected, ["note1"]);
      await page.keyboard.press("Escape");
      await h.settled();
      await page.locator("#mdg-field-attachedTo").waitFor();
      const fields = await page
        .locator('.inspector [id^="mdg-field-"]')
        .evaluateAll((nodes) => nodes.map((n) => n.id));
      assert.ok(
        fields.includes("mdg-field-label") && fields.includes("mdg-field-attachedTo"),
        String(fields),
      );
      assert.deepEqual(
        fields.filter((f) => f.startsWith("mdg-field-entity")),
        [],
      );
      await page.locator("#mdg-field-attachedTo").selectOption("shop.api");
      await h.settled();
      assert.match(h.text, /note note1 "Note" on shop\.api\n/);
      assert.equal(await page.locator(".content polyline.leader").count(), 1);
      await page.screenshot({ path: join(output, "note-c4.png") });
    },
  },
  {
    name: "notes: O on a sequence diagram still writes a note over the selection",
    text: SEQUENCE,
    async run(h) {
      const page = h.page;
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      await page.keyboard.press("o");
      await h.settled();
      assert.match(h.text, /note note1 over api "Note"/);
      assert.equal(await page.locator('.toolbar button[data-tool="note"]').isVisible(), false);
    },
  },
  {
    name: "notes: dragging the note tool onto a box attaches the note, outlines the drop and draws the leader",
    async run(h) {
      const page = h.page;
      const tool = await middleOf(page.locator('.toolbar button[data-tool="note"]'));
      const api = await h.centre("api");
      await page.mouse.move(tool.x, tool.y);
      await page.mouse.down();
      await page.mouse.move(api.x, api.y, { steps: 8 });
      // The box that would take the note is outlined as a drop while the tool is over it.
      await page.waitForSelector(".overlay .highlight.drop");
      assert.equal(await page.locator(".overlay .highlight.drop").count(), 1);
      // Over empty canvas the outline goes away.
      await page.mouse.move(api.x + 300, api.y + 260, { steps: 6 });
      assert.equal(await page.locator(".overlay .highlight.drop").count(), 0);
      await page.mouse.move(api.x, api.y, { steps: 6 });
      await page.mouse.up();
      await h.settled();
      assert.match(h.text, /\n {2}note note1 "Note" on api\n/);
      // East of `api`, level with its top, on the grid.
      const note = h.place("note1");
      const west = h.place("api");
      assert.ok(note.x > west.x + 100, `east of api: ${JSON.stringify([note, west])}`);
      assert.equal(await page.locator(".content polyline.leader").count(), 1);
      assert.match((await page.locator(".status").textContent()) ?? "", /note attached to `api`/);
      assert.equal(await page.locator("textarea.inline").inputValue(), "Note");
      await page.keyboard.press("Escape");
      await h.settled();
      assert.equal(await page.locator(".overlay .highlight.drop").count(), 0);
      await page.screenshot({ path: join(output, "note-attached.png") });
    },
  },
  {
    name: "notes: the armed note tool attaches on a click on an element and creates a free note on empty canvas",
    async run(h) {
      const page = h.page;
      await page.locator('.toolbar button[data-tool="note"]').click();
      const db = await h.centre("db");
      await page.mouse.move(db.x, db.y);
      await h.settled();
      await page.waitForSelector(".overlay .highlight.drop");
      await page.mouse.click(db.x, db.y);
      await h.settled();
      assert.match(h.text, /\n {2}note note1 "Note" on db\n/);
      await page.keyboard.press("Escape");
      await h.settled();
      await page.locator('.toolbar button[data-tool="note"]').click();
      const empty = { x: db.x + 200, y: db.y + 220 };
      await page.mouse.click(empty.x, empty.y);
      await h.settled();
      assert.match(h.text, /\n {2}note note2 "Note"\n/);
    },
  },
  {
    name: "notes: Attached to writes and removes the clause",
    text: `diagram d: flow {
  layout manual
  api["API"]
  db[("DB")]
  note why "Idempotent"
  placement {
    place api at (126, 112)
    place db at (420, 112)
    place why at (126, 300)
  }
}
`,
    async run(h) {
      const page = h.page;
      const why = await h.centre("why");
      await page.mouse.click(why.x, why.y);
      await h.settled();
      const field = page.locator("#mdg-field-attachedTo");
      assert.equal(await field.inputValue(), "");
      await field.selectOption("db");
      await h.settled();
      assert.match(h.text, /\n {2}note why "Idempotent" on db\n/);
      assert.equal(await page.locator(".content polyline.leader").count(), 1);
      await page.locator("#mdg-field-attachedTo").selectOption("");
      await h.settled();
      assert.match(h.text, /\n {2}note why "Idempotent"\n/);
      assert.equal(await page.locator(".content polyline.leader").count(), 0);
    },
  },
  {
    name: "notes: Delete on an element lists the attachment, and confirming keeps the note",
    text: `diagram d: flow {
  layout manual
  api["API"]
  db[("DB")]
  api -> db as save
  note why "Idempotent" on api
  placement {
    place api at (126, 112)
    place db at (420, 112)
    place why at (126, 300)
  }
}
`,
    async run(h) {
      const page = h.page;
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      await page.keyboard.press("Delete");
      await h.settled();
      const dialog = page.locator(".dialog");
      assert.equal(await dialog.isVisible(), true);
      // The relation, the note attached to it and the place of the box.
      assert.equal(await dialog.locator("li").count(), 3, await dialog.innerText());
      assert.match(await dialog.innerText(), /note `why` is attached to it/);
      await page.keyboard.press("Enter");
      await h.settled();
      assert.doesNotMatch(h.text, /\bapi\b/);
      assert.match(h.text, /\n {2}note why "Idempotent"\n/);
      assert.equal((await page.locator('.content g[data-id="why"]').count()) > 0, true);
    },
  },
  {
    name: "notes: moving the note redraws the leader with the live preview",
    text: `diagram d: flow {
  layout manual
  api["API"]
  note why "Idempotent" on api
  placement {
    place api at (126, 112)
    place why at (420, 112)
  }
}
`,
    async run(h) {
      const page = h.page;
      const leader = () => page.locator(".content polyline.leader").first().getAttribute("points");
      const before = await leader();
      assert.ok(before, "the leader is drawn");
      const why = await bodyCentre(h, "why");
      await page.mouse.move(why.x, why.y);
      await page.mouse.down();
      await page.mouse.move(why.x, why.y + 120, { steps: 8 });
      await h.settled();
      // Under the pointer, before the release: the leader follows the note.
      const during = await leader();
      assert.notEqual(
        during,
        before,
        `the leader moved with the preview: ${JSON.stringify(h.previews())}`,
      );
      await page.mouse.up();
      await h.settled();
      assert.notEqual(await leader(), before);
      assert.match(h.text, /on api/);
    },
  },
  {
    name: "notes: a note with an outline is offered the moving dash, a bare one only the pulse",
    text: FREE_NOTES,
    async run(h) {
      const page = h.page;
      const toggles = page.getByRole("group", { name: "Effects" }).getByRole("button");
      const dash = page.getByRole("button", { name: "Moving dash", exact: true });
      const bare = await bodyCentre(h, "bare");
      await page.mouse.click(bare.x, bare.y);
      await h.settled();
      assert.equal(await toggles.count(), 1);
      assert.equal(await dash.count(), 0);
      const framed = await bodyCentre(h, "framed");
      await page.mouse.click(framed.x, framed.y);
      await h.settled();
      assert.equal(await toggles.count(), 2);
      assert.equal(await dash.count(), 1);
    },
  },
  {
    name: "pointer: K points with a trail that selects and writes nothing, and the trail fades within a second",
    async run(h) {
      const page = h.page;
      const before = h.text;
      // The trails canvas sits between the outlines and the cursors, and is hidden from readers.
      assert.deepEqual(
        await page
          .locator(".presence")
          .evaluate((layer) =>
            [...layer.children].map(
              (child) => `${child.tagName.toLowerCase()}.${child.getAttribute("class")}`,
            ),
          ),
        ["svg.presence-outlines", "canvas.presence-trails", "div.presence-cursors"],
      );
      assert.equal(await page.locator(".presence-trails").getAttribute("aria-hidden"), "true");
      await h.focusStage();
      await page.keyboard.press("k");
      await h.settled();
      const toggle = page.locator('.toolbar button[aria-label="Pointer"]');
      assert.equal(await toggle.getAttribute("aria-pressed"), "true");
      assert.match((await page.locator(".status").textContent()) ?? "", /^Pointer on/);
      assert.match(
        await page.locator(".stage").evaluate((stage) => getComputedStyle(stage).cursor),
        /data:image\/svg\+xml/,
      );
      await page.locator(".toolbar").screenshot({ path: join(output, "pointer-cursor.png") });
      const api = await h.centre("api");
      await page.mouse.move(api.x, api.y);
      await page.mouse.down();
      await page.mouse.move(api.x + 80, api.y, { steps: 10 });
      await page.waitForTimeout(80);
      const during = await trailPixels(h);
      assert.ok(during.count > 150, `a trail is drawn: ${during.count} pixels`);
      assert.deepEqual(h.session.selected, []);
      assert.equal(await page.locator("textarea.inline").count(), 0);
      await page.screenshot({ path: join(output, "pointer-trail.png") });
      await page.mouse.up();
      await h.settled();
      assert.equal(h.text, before);
      assert.deepEqual(h.writes(), []);
      // No host that shares presence: nothing of the stroke is sent.
      assert.equal(
        h.received.filter((m) => (m as { type: string }).type === "presenceLaser").length,
        0,
      );
      // Gone within a second, and no part of what is exported.
      await page.waitForTimeout(1000);
      assert.equal((await trailPixels(h)).count, 0);
      const svg = renderDiagram(h.analyze(h.text, h.revision), "d")!.svg;
      assert.ok(!svg.includes("canvas") && !svg.includes("trail") && !svg.includes("presence"));
    },
  },
  {
    name: "pointer: a double click, a right click and Shift+F10 open nothing while pointing",
    async run(h) {
      const page = h.page;
      const before = h.text;
      await h.focusStage();
      await page.keyboard.press("k");
      const api = await h.centre("api");
      await page.mouse.dblclick(api.x, api.y);
      await h.settled();
      assert.equal(await page.locator("textarea.inline").count(), 0);
      await page.mouse.click(api.x, api.y, { button: "right" });
      await h.settled();
      assert.equal(await page.locator(".menu").isVisible(), false);
      await page.keyboard.press("Shift+F10");
      await h.settled();
      assert.equal(await page.locator(".menu").isVisible(), false);
      assert.equal(h.text, before);
      assert.deepEqual(h.session.selected, []);
    },
  },
  {
    name: "pointer: Escape and K put it away, and a press then selects",
    async run(h) {
      const page = h.page;
      const toggle = page.locator('.toolbar button[aria-label="Pointer"]');
      await h.focusStage();
      await page.keyboard.press("k");
      assert.equal(await toggle.getAttribute("aria-pressed"), "true");
      await page.keyboard.press("Escape");
      await h.settled();
      assert.equal(await toggle.getAttribute("aria-pressed"), "false");
      const api = await h.centre("api");
      await page.mouse.click(api.x, api.y);
      await h.settled();
      assert.deepEqual(h.session.selected, ["api"]);
      await page.keyboard.press("k");
      assert.equal(await toggle.getAttribute("aria-pressed"), "true");
      // Turning it on lets go of the selection, so Delete cannot reach what the pointer shows.
      assert.deepEqual(h.session.selected, []);
      await page.keyboard.press("k");
      assert.equal(await toggle.getAttribute("aria-pressed"), "false");
      await toggle.click();
      assert.equal(await toggle.getAttribute("aria-pressed"), "true");
      await toggle.click();
      assert.equal(await toggle.getAttribute("aria-pressed"), "false");
      assert.match((await page.locator(".status").textContent()) ?? "", /^Pointer off/);
    },
  },
  {
    name: "pointer: Space-drag pans and Ctrl+wheel zooms while pointing, and the pan draws no trail",
    async run(h) {
      const page = h.page;
      await h.focusStage();
      await page.keyboard.press("k");
      const transform = () =>
        page.locator(".content").evaluate((e: HTMLElement) => e.style.transform);
      const before = await transform();
      await page.keyboard.down(" ");
      await page.mouse.move(600, 600);
      await page.mouse.down();
      await page.mouse.move(660, 640, { steps: 6 });
      await page.waitForTimeout(60);
      assert.equal((await trailPixels(h)).count, 0, "a pan draws no trail");
      await page.mouse.up();
      await page.keyboard.up(" ");
      await h.settled();
      assert.notEqual(await transform(), before, "the view panned");
      const zoom = await zoomOf(h);
      await page.keyboard.down("Control");
      await page.mouse.move(600, 400);
      await page.mouse.wheel(0, -200);
      await page.keyboard.up("Control");
      await h.settled();
      assert.notEqual(await zoomOf(h), zoom, "the view zoomed");
    },
  },
  {
    name: "pointer: N puts the pointer away and creates, and the node tool of the palette does the same",
    async run(h) {
      const page = h.page;
      const toggle = page.locator('.toolbar button[aria-label="Pointer"]');
      await h.focusStage();
      await page.keyboard.press("k");
      await page.keyboard.press("n");
      await h.settled();
      assert.equal(await toggle.getAttribute("aria-pressed"), "false");
      assert.match(h.text, /\n {2}node1\[""\]\n/);
      await page.keyboard.press("Escape");
      await h.focusStage();
      await page.keyboard.press("k");
      assert.equal(await toggle.getAttribute("aria-pressed"), "true");
      await page.locator('.toolbar button[data-tool="node"]').first().click();
      assert.equal(await toggle.getAttribute("aria-pressed"), "false");
      const empty = await h.centre("cache");
      await page.mouse.click(empty.x + 200, empty.y + 20);
      await h.settled();
      assert.match(h.text, /node2/);
    },
  },
  {
    name: "pointer: a read-only canvas points, and the status line does not refuse",
    readOnly: true,
    async run(h) {
      const page = h.page;
      const toggle = page.locator('.toolbar button[aria-label="Pointer"]');
      assert.equal(await toggle.isVisible(), true);
      await h.focusStage();
      await page.keyboard.press("k");
      await h.settled();
      assert.equal(await toggle.getAttribute("aria-pressed"), "true");
      assert.doesNotMatch(
        (await page.locator(".status").textContent()) ?? "",
        /view only|only shows/i,
      );
      const api = await h.centre("api");
      await page.mouse.move(api.x, api.y);
      await page.mouse.down();
      await page.mouse.move(api.x + 80, api.y + 20, { steps: 8 });
      await page.waitForTimeout(80);
      assert.ok((await trailPixels(h)).count > 100);
      await page.mouse.up();
      assert.deepEqual(h.writes(), []);
    },
  },
  {
    name: "pointer: k typed in the label editor stays text and does not turn the pointer on",
    async run(h) {
      const page = h.page;
      const api = await h.centre("api");
      await page.mouse.dblclick(api.x, api.y);
      const editor = page.locator("textarea.inline");
      await editor.waitFor();
      await page.keyboard.type("k");
      assert.match(await editor.inputValue(), /k/);
      assert.equal(
        await page.locator('.toolbar button[aria-label="Pointer"]').getAttribute("aria-pressed"),
        "false",
      );
      await page.keyboard.press("Escape");
      assert.equal((await trailPixels(h)).count, 0);
    },
  },
  {
    name: "pointer: under reduced motion the stroke stays whole until the pointer lifts, then goes at once",
    async run(h) {
      const page = h.page;
      await page.emulateMedia({ reducedMotion: "reduce" });
      await h.focusStage();
      await page.keyboard.press("k");
      const api = await h.centre("api");
      await page.mouse.move(api.x, api.y);
      await page.mouse.down();
      await page.mouse.move(api.x + 80, api.y, { steps: 8 });
      await page.waitForTimeout(1300);
      assert.ok((await trailPixels(h)).count > 150, "the stroke has not faded");
      await page.mouse.up();
      await page.waitForTimeout(100);
      assert.equal((await trailPixels(h)).count, 0, "nothing of it remains");
    },
  },
  {
    name: "pointer trails of others: a batch is drawn point by point in the person's colour, once, and a batch that does not fit is not drawn",
    async run(h) {
      const page = h.page;
      const points = Array.from({ length: 10 }, (_, i) => ({ x: 120 + i * 11, y: 80, t: i * 22 }));
      const ben: PresencePerson = {
        ...BEN,
        selection: [],
        pointer: { x: 120, y: 80 },
        laser: { batch: 7, points },
      };
      await h.presence([ben]);
      await page.waitForTimeout(70);
      const early = await trailPixels(h);
      await page.waitForTimeout(260);
      const late = await trailPixels(h);
      assert.ok(late.count > early.count, `drawn over time: ${early.count} then ${late.count}`);
      // Ben's colour, #1c7ed6.
      assert.ok(
        late.colour?.every((channel, i) => Math.abs(channel - [28, 126, 214][i]!) <= 2),
        String(late.colour),
      );
      await page.waitForTimeout(1000);
      assert.equal((await trailPixels(h)).count, 0, "faded within 800 ms of its last point");
      // The same batch again draws nothing.
      await h.presence([ben]);
      await page.waitForTimeout(300);
      assert.equal((await trailPixels(h)).count, 0);
      // A batch of 65 points, a moment of 5000 ms and a point that is not a number are not drawn,
      // and the person's cursor is.
      const many = Array.from({ length: 65 }, (_, i) => ({ x: 100 + i, y: 100, t: 0 }));
      for (const [batch, bad] of [
        [8, many],
        [
          9,
          [
            { x: 100, y: 100, t: 0 },
            { x: 140, y: 100, t: 5000 },
          ],
        ],
        [
          10,
          [
            { x: 100, y: 100, t: 0 },
            { x: null, y: 100, t: 10 },
          ],
        ],
      ] as const) {
        // Points the wire would never carry (a null coordinate): the canvas must refuse them.
        const points = bad as unknown as readonly { x: number; y: number; t: number }[];
        await h.presence([{ ...ben, laser: { batch, points } }]);
        await page.waitForTimeout(300);
        assert.equal((await trailPixels(h)).count, 0, `batch ${batch}`);
      }
      assert.equal(await page.locator(".presence-cursor").count(), 1);
      assert.deepEqual(h.writes(), []);
    },
  },
  {
    name: "pointer trails of others: the person's own colour paints the stroke and the cursor, and goes with the next message",
    async run(h) {
      const page = h.page;
      await h.postRaw({ type: "presence", people: [], me: { colour: "#e03131" } });
      await h.focusStage();
      await page.keyboard.press("k");
      const cursor = () =>
        page
          .locator(".stage")
          .evaluate((stage) =>
            (stage as HTMLElement).style.getPropertyValue("--mdg-pointer-cursor"),
          );
      assert.match(await cursor(), /%23e03131/);
      const api = await h.centre("api");
      await page.mouse.move(api.x, api.y);
      await page.mouse.down();
      await page.mouse.move(api.x + 80, api.y, { steps: 8 });
      await page.waitForTimeout(80);
      assert.deepEqual((await trailPixels(h)).colour, [224, 49, 49]);
      await page.mouse.up();
      await h.postRaw({ type: "presence", people: [] });
      assert.doesNotMatch(await cursor(), /%23e03131/);
    },
  },
  {
    name: "pointer trails of others: a stroke is posted to a host that shares presence in batches from 0, and to no other",
    async run(h) {
      const page = h.page;
      await h.presence([]);
      await h.focusStage();
      await page.keyboard.press("k");
      const api = await h.centre("api");
      await page.mouse.move(api.x, api.y);
      await page.mouse.down();
      for (let i = 1; i <= 15; i++) {
        await page.mouse.move(api.x + i * 6, api.y + i * 2);
        await page.waitForTimeout(20);
      }
      await page.mouse.up();
      await page.waitForTimeout(160);
      const posted = h.received
        .map((m, i) => ({ m: m as { type: string }, at: h.receivedAt[i]! }))
        .filter(({ m }) => m.type === "presenceLaser");
      const batches = posted.map(({ m }) => m) as unknown as {
        points: { x: number; y: number; t: number }[];
        diagram?: string;
      }[];
      assert.ok(batches.length >= 3, `${batches.length} batches`);
      // At most one batch every 50 ms (a few milliseconds of slack for the clock).
      for (let i = 1; i < posted.length; i++) {
        assert.ok(posted[i]!.at - posted[i - 1]!.at >= 40, `batches ${i - 1} and ${i} too close`);
      }
      for (const batch of batches) {
        assert.equal(batch.points[0]!.t, 0, "each batch starts at 0");
        assert.ok(batch.points.length <= 64);
        assert.equal(batch.diagram, "d");
      }
      const total = batches.reduce((sum, batch) => sum + batch.points.length, 0);
      assert.ok(total >= 12, `${total} points together`);
      assert.deepEqual(h.writes(), []);
    },
  },
];

async function main(): Promise<void> {
  const browser: Browser = await chromium.launch({ executablePath: browserPath(), headless: true });
  // MDG_WEBVIEW_ONLY runs the tests whose name contains one of its `|`-separated parts, while
  // working on a few.
  const only = process.env.MDG_WEBVIEW_ONLY?.split("|").filter((part) => part !== "");
  // MDG_WEBVIEW_PART=k/n runs the k-th of n runs of consecutive tests, to split the suite.
  const part = /^(\d+)\/(\d+)$/.exec(process.env.MDG_WEBVIEW_PART ?? "");
  const named = only?.length
    ? tests.filter((test) => only.some((piece) => test.name.includes(piece)))
    : tests;
  const size = part ? Math.ceil(named.length / Number(part[2])) : named.length;
  const chosen = part ? named.slice((Number(part[1]) - 1) * size, Number(part[1]) * size) : named;
  let failed = 0;
  try {
    for (const test of chosen) {
      // The extension host speaks the test's language too, as in VS Code; English otherwise.
      setLocale(resolveLocale(test.lang));
      // MDG_WEBVIEW_SCALE draws the pages at a device scale, for screenshots looked at closely.
      const page = await browser.newPage({
        viewport: { width: 1200, height: 800 },
        deviceScaleFactor: Number(process.env.MDG_WEBVIEW_SCALE ?? 1),
      });
      const harness = new Harness(page, test.text ?? SHEET);
      harness.types = test.types ?? [];
      if (test.readOnly) harness.config = { ...harness.config, readOnly: true };
      if (test.project) harness.session = new CanvasSession({ grid: 14, project: () => true });
      try {
        await harness.start(test.theme ?? "", test.lang);
        await test.run(harness);
        console.log(`  ✓ ${test.name}`);
      } catch (error) {
        failed++;
        console.log(`  ✗ ${test.name}\n    ${(error as Error).message.split("\n").join("\n    ")}`);
        await page
          .screenshot({ path: join(output, `failed-${tests.indexOf(test)}.png`) })
          .catch(() => undefined);
      } finally {
        await page.close();
        setLocale("en");
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${chosen.length - failed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

await main();
