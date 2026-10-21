/**
 * The player in a headless Edge or Chrome: pages written by `playerPage` and `playerFragment`, with
 * the bundled runtime, and no network. Usage: pnpm player:test-browser
 */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { layoutDiagram } from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import { compile } from "@meltemi/diagrams-model";
import { sceneGroups, storyFrame } from "@meltemi/diagrams-motion";
import { renderSvg } from "@meltemi/diagrams-render";
import { chromium, type Browser, type Page } from "playwright-core";
import { browserPath } from "../../../vscode/scripts/browser.mjs";
import {
  effectsDocument,
  frameSvg,
  playerFragment,
  playerPage,
  storyDocument,
  storyViews,
  type HostOpenTarget,
  type LaidOutView,
  type StoryPlayerDocument,
} from "../../src/index.js";
import { playerScript } from "../../src/node.js";

const here = dirname(fileURLToPath(import.meta.url));
const output = join(here, "..", "..", ".test-output");
mkdirSync(output, { recursive: true });
const corpus = join(here, "..", "..", "..", "..", "corpus");
const engine = createElkEngine();
const script = playerScript();

const compilation = compile(
  readFileSync(join(corpus, "valid", "stories", "purchase.meltemi"), "utf8"),
);
const story = compilation.document.stories[0]!;
const layouts = new Map<string, LaidOutView>();
for (const [key, view] of storyViews(story)) {
  layouts.set(key, {
    diagram: view.diagram!,
    layout: layoutDiagram(compilation, view.diagram!, { engine }),
  });
}
const purchase: StoryPlayerDocument = storyDocument(story, layouts)!;
const checkout = compilation.document.diagrams[0]!;
const effects = effectsDocument({
  diagram: checkout,
  layout: layoutDiagram(compilation, checkout, { engine }),
})!;

/** The commerce context view with its container and component views, as the exporter bundles them. */
function commerceDocument(locale: "en" | "es") {
  const source = compile(readFileSync(join(corpus, "valid", "c4", "commerce.meltemi"), "utf8"));
  const laid = (id: string): LaidOutView => {
    const diagram = source.document.diagrams.find((d) => d.id === id)!;
    return { diagram, layout: layoutDiagram(source, diagram, { engine, locale }) };
  };
  return effectsDocument(laid("context"), {
    locale,
    drill: {
      root: "context",
      views: new Map([
        ["containers", laid("containers")],
        ["components", laid("components")],
      ]),
      opens: new Map<string, Record<string, HostOpenTarget>>([
        ["context", { shop: { view: "containers", element: null, transition: "morph" } }],
        ["containers", { "shop.api": { view: "components", element: null, transition: "morph" } }],
      ]),
    },
  })!;
}
const commerce = commerceDocument("en");
const commerceEs = commerceDocument("es");
const linkedSource = compile(`language "0.2"

diagram d: flow {
  api["API"] {
    url "https://docs.example.com/api"
    description "Uses <b>TLS</b>"
  }
  db[("DB")]
  api -> db
}
`);
const linked = effectsDocument({
  diagram: linkedSource.document.diagrams[0]!,
  layout: layoutDiagram(linkedSource, linkedSource.document.diagrams[0]!, { engine }),
})!;

/** What the exporter writes for the story at `t`. */
const exported = (t: number) =>
  renderSvg(
    storyFrame(purchase.timeline, (k) => purchase.views[k], t, { accent: purchase.accent })!,
    {
      fonts: "system",
    },
  );

interface PlayerState {
  svg: string;
  time: number;
  playing: boolean;
  staticView: boolean;
}

/** The state of the n-th player of the page. */
async function state(page: Page, n = 0): Promise<PlayerState> {
  return page.evaluate((index) => {
    const element = document.querySelectorAll("meltemi-player")[index] as HTMLElement & {
      player: {
        svg: string;
        controller: { time: number; playing: boolean; staticView: boolean };
      };
    };
    const { svg, controller } = element.player;
    return {
      svg,
      time: controller.time,
      playing: controller.playing,
      staticView: controller.staticView,
    };
  }, n);
}

type Handle = {
  viewport: { x: number; y: number; zoom: number };
  selection: { view: string; role: string; id: string } | null;
  view: string;
  trail: readonly string[];
} & Record<string, (...args: unknown[]) => unknown>;

/** The user viewport of the n-th player. */
async function viewer(page: Page, n = 0): Promise<{ x: number; y: number; zoom: number }> {
  return page.evaluate(
    (index) =>
      (document.querySelectorAll("meltemi-player")[index] as HTMLElement & { player: Handle })
        .player.viewport,
    n,
  );
}

/** Calls a method of the first player's handle. */
async function call(page: Page, method: string, ...args: unknown[]): Promise<unknown> {
  return page.evaluate(
    ([name, rest]) =>
      (
        (document.querySelector("meltemi-player") as HTMLElement & { player: Handle }).player[
          name as string
        ] as (...a: unknown[]) => unknown
      )(...(rest as unknown[])),
    [method, args] as const,
  );
}

/** The selection of the first player. */
async function selection(page: Page): Promise<Handle["selection"]> {
  return page.evaluate(
    () =>
      (document.querySelector("meltemi-player") as HTMLElement & { player: Handle }).player
        .selection,
  );
}

/** The centre of an item of the first player's drawing, in page pixels. */
async function centre(page: Page, id: string, role = "element"): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([i, r]) => {
      const root = document.querySelector("meltemi-player")!.shadowRoot!;
      const box = root
        .querySelector(`.picture [data-id="${i}"][data-role="${r}"]`)!
        .getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    },
    [id, role] as const,
  );
}

/** The first player's stage, in page pixels. */
async function frameBox(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const r = document
      .querySelector("meltemi-player")!
      .shadowRoot!.querySelector(".frame")!
      .getBoundingClientRect();
    return { x: r.x, y: r.y };
  });
}

/** The middle of a relation's first segment, from the document's scene, in page pixels. */
async function trackPoint(page: Page, id: string): Promise<{ x: number; y: number }> {
  const relation = sceneGroups(commerce.views.context!.scene.items).find(
    (g) => g.id === id && g.role === "relation",
  )!;
  const [a, b] = relation.track!;
  const middle = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
  const stage = (await call(page, "project", middle)) as { x: number; y: number };
  const frame = await frameBox(page);
  return { x: frame.x + stage.x, y: frame.y + stage.y };
}

/** Whether the first player's hover card is shown. */
async function cardShown(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const card = document.querySelector("meltemi-player")!.shadowRoot!.querySelector(".card");
    return card !== null && !card.hasAttribute("hidden");
  });
}

/** The elements with a plus badge in the first player. */
async function badges(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [
      ...document
        .querySelector("meltemi-player")!
        .shadowRoot!.querySelectorAll(".overlay [data-open]"),
    ].map((b) => b.getAttribute("data-open")!),
  );
}

const groupOpacity = (svg: string, id: string) =>
  new RegExp(`<g data-id="${id}" data-role="element"(?: opacity="([^"]*)")?>`).exec(svg)?.[1] ??
  null;

const tests: {
  name: string;
  html: string;
  reducedMotion?: boolean;
  /** A phone with a touch screen. */
  touch?: boolean;
  run: (page: Page) => Promise<void>;
}[] = [
  {
    name: "draws the exporter's frames and starts with revealed boxes hidden",
    html: playerPage(purchase, script),
    async run(page) {
      const start = await state(page);
      assert.equal(start.svg, exported(0));
      assert.equal(groupOpacity(start.svg, "db"), "0");
      await page.evaluate(() =>
        (
          document.querySelector("meltemi-player") as HTMLElement & {
            player: { seek(t: number): void };
          }
        ).player.seek(2400),
      );
      assert.equal((await state(page)).svg, exported(2400));
      await page.screenshot({ path: join(output, "player.png"), fullPage: true });
    },
  },
  {
    name: "plays, pauses, and stops at the end",
    html: playerPage(purchase, script),
    async run(page) {
      await page.getByRole("button", { name: "Play" }).click();
      await page.waitForTimeout(400);
      await page.getByRole("button", { name: "Pause" }).click();
      const paused = await state(page);
      assert.ok(paused.time > 100 && !paused.playing, `time ${paused.time}`);
      await page.locator(".frame").focus();
      await page.keyboard.press("End");
      assert.equal((await state(page)).time, 7400);
      // Playing at the end starts again.
      await page.keyboard.press(" ");
      const restarted = await state(page);
      assert.ok(restarted.playing && restarted.time < 1000);
      await page.keyboard.press("k");
      assert.equal((await state(page)).playing, false);
    },
  },
  {
    name: "goes to scenes from the picker, the buttons and the keys, and announces them",
    html: playerPage(purchase, script),
    async run(page) {
      await page.getByRole("combobox", { name: "Scene" }).selectOption({ label: "2. processing" });
      assert.equal((await state(page)).time, 1800);
      assert.equal(await page.getByRole("status").textContent(), "Scene 2 of 2: processing");
      assert.equal(await page.locator(".time").textContent(), "1.8 s / 7.4 s");
      await page.getByRole("button", { name: "Previous scene" }).click();
      assert.equal((await state(page)).time, 0);
      await page.locator(".frame").focus();
      await page.keyboard.press("PageDown");
      assert.equal((await state(page)).time, 1800);
      await page.keyboard.press("ArrowRight");
      assert.equal((await state(page)).time, 2800);
      await page.keyboard.press(",");
      assert.equal((await state(page)).time, 2700);
      await page.keyboard.press(".");
      assert.equal((await state(page)).time, 2800);
      await page.keyboard.press(",");
      assert.match(
        (await page.locator(".frame").getAttribute("aria-label")) ?? "",
        /^A purchase\. Scene 2 of 2: processing\. Interactive drawing$/,
      );
      // Keyboard focus is visible.
      const outline = await page.evaluate(() => {
        const root = document.querySelector("meltemi-player")!.shadowRoot!;
        return getComputedStyle(root.activeElement!).outlineStyle;
      });
      assert.equal(outline, "solid");
    },
  },
  {
    name: "starts in the static view, without autoplay, when reduced motion is asked",
    html: playerPage(purchase, script, { autoplay: true }),
    reducedMotion: true,
    async run(page) {
      const start = await state(page);
      assert.deepEqual([start.playing, start.staticView], [false, true]);
      assert.equal(groupOpacity(start.svg, "db"), null, "the first scene's final state");
      assert.equal(await page.getByRole("button", { name: "Play" }).isDisabled(), true);
      assert.equal(
        await page.getByRole("button", { name: "Static view" }).getAttribute("aria-pressed"),
        "true",
      );
      await page.getByRole("button", { name: "Next scene" }).click();
      assert.equal((await state(page)).time, 7400);
      await page.getByRole("button", { name: "Static view" }).click();
      assert.equal(await page.getByRole("button", { name: "Play" }).isDisabled(), false);
    },
  },
  {
    name: "autoplays when motion is allowed",
    html: playerPage(purchase, script, { autoplay: true }),
    async run(page) {
      await page.waitForTimeout(300);
      const now = await state(page);
      assert.ok(now.playing && now.time > 0);
    },
  },
  {
    name: "summarises the story in words",
    html: playerPage(purchase, script),
    async run(page) {
      await page.getByText("Text summary").click();
      const text = (await page.locator("details").textContent()) ?? "";
      assert.ok(text.includes("Scene 1: overview (0 s to 1.8 s)"), text);
      assert.ok(text.includes("Reveal Cliente, API Gateway, Pedidos and PostgreSQL over 800 ms"));
      assert.ok(text.includes("Trace “HTTPS” from Cliente to API Gateway over 1.2 s"));
    },
  },
  {
    name: "speaks Spanish in a page exported in Spanish, and still plays",
    html: playerPage(purchase, script, { lang: "es" }),
    async run(page) {
      assert.equal(await page.getAttribute("html", "lang"), "es");
      assert.equal(await page.getByRole("figure", { name: "Historia: A purchase" }).count(), 1);
      assert.equal(await page.getByRole("group", { name: "Controles del reproductor" }).count(), 1);
      assert.equal(await page.locator(".time").textContent(), "0 s / 7,4 s");
      const play = page.getByRole("button", { name: "Reproducir" });
      assert.equal(await play.getAttribute("title"), "Reproducir (Espacio)");
      await play.click();
      await page.waitForTimeout(400);
      // The runtime's own words: the button says what it does next.
      const pause = page.getByRole("button", { name: "Pausar" });
      assert.equal(await pause.getAttribute("title"), "Pausar (Espacio)");
      await pause.click();
      const paused = await state(page);
      assert.ok(paused.time > 100 && !paused.playing, `time ${paused.time}`);
      await page.getByRole("combobox", { name: "Escena" }).selectOption({ label: "2. processing" });
      assert.equal((await state(page)).time, 1800);
      assert.equal(await page.getByRole("status").textContent(), "Escena 2 de 2: processing");
      assert.equal(await page.locator(".time").textContent(), "1,8 s / 7,4 s");
      assert.equal(
        await page.getByRole("slider", { name: "Progreso" }).getAttribute("aria-valuetext"),
        "1,8 s de 7,4 s",
      );
      assert.match(
        (await page.locator(".frame").getAttribute("aria-label")) ?? "",
        /^A purchase\. Escena 2 de 2: processing\. Dibujo interactivo$/,
      );
      assert.equal(
        await page.getByRole("button", { name: "Escena anterior" }).getAttribute("title"),
        "Escena anterior (Re Pág)",
      );
      assert.equal(
        await page.getByRole("button", { name: "Escena siguiente" }).isDisabled(),
        true,
        "the last scene has no next",
      );
      await page.getByText("Resumen en texto").click();
      const text = (await page.locator("details").textContent()) ?? "";
      assert.ok(text.includes("Escena 1: overview (de 0 s a 1,8 s)"), text);
      assert.ok(text.includes("Mostrar Cliente, API Gateway, Pedidos y PostgreSQL en 800 ms"));
      assert.ok(text.includes("Recorrer “HTTPS” de Cliente a API Gateway en 1,2 s"));
      await page.getByRole("button", { name: "Vista estática" }).click();
      const still = await state(page);
      assert.deepEqual([still.staticView, still.playing], [true, false]);
      await page.screenshot({ path: join(output, "player-es.png"), fullPage: true });
    },
  },
  {
    name: "gives each player the language of its element, else of its page",
    html: `<!doctype html><html lang="en"><body>${playerFragment(purchase, script, { lang: "es" })}${playerFragment(effects, script)}<section lang="es-CL">${playerFragment(effects, script)}</section></body></html>`,
    async run(page) {
      const [spanish, english, inherited] = [0, 1, 2].map((n) =>
        page.locator("meltemi-player").nth(n),
      );
      assert.equal(await spanish!.getAttribute("lang"), "es");
      assert.equal(await spanish!.getByRole("button", { name: "Reproducir" }).count(), 1);
      assert.equal(await english!.getByRole("button", { name: "Play" }).count(), 1);
      assert.equal(await english!.getByText("Text summary").count(), 1);
      assert.equal(await inherited!.getByRole("button", { name: "Reproducir" }).count(), 1);
      await inherited!.getByText("Resumen en texto").click();
      assert.match(
        (await inherited!.locator("details").textContent()) ?? "",
        /Partículas a lo largo de “HTTPS”: 1,2 s por ciclo, sin fin/,
      );
      await spanish!.getByRole("button", { name: "Reproducir" }).click();
      await page.waitForTimeout(300);
      assert.equal((await state(page, 0)).playing, true);
      assert.equal(await spanish!.getByRole("button", { name: "Pausar" }).count(), 1);
    },
  },
  {
    name: "plays fragments pasted twice, and effects that repeat forever",
    html: `<!doctype html><html lang="en"><body><h1>Two players</h1>${playerFragment(purchase, script)}${playerFragment(effects, script)}</body></html>`,
    async run(page) {
      assert.equal(await page.locator("meltemi-player").count(), 2);
      const [first, second] = [await state(page, 0), await state(page, 1)];
      assert.ok(first.svg.startsWith("<svg") && second.svg.startsWith("<svg"));
      // Forever: no progress slider, and the static view draws no effects.
      const slider = page.locator("meltemi-player").nth(1).getByRole("slider");
      assert.equal(await slider.isHidden(), true);
      await page.locator("meltemi-player").nth(1).getByRole("button", { name: "Play" }).click();
      await page.waitForTimeout(300);
      assert.match((await state(page, 1)).svg, /data-role="motion"/);
      await page
        .locator("meltemi-player")
        .nth(1)
        .getByRole("button", { name: "Static view" })
        .click();
      assert.doesNotMatch((await state(page, 1)).svg, /data-role="motion"/);
    },
  },
  {
    name: "zooms with Ctrl and the wheel around the pointer, never touching the frame",
    html: playerPage(purchase, script),
    async run(page) {
      const before = await viewer(page);
      const box = await page.evaluate(() => {
        const root = document.querySelector("meltemi-player")!.shadowRoot!;
        const r = root
          .querySelector('[data-id="api"][data-role="element"]')!
          .getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      await page.mouse.move(box.x, box.y);
      await page.keyboard.down("Control");
      await page.mouse.wheel(0, -120);
      await page.keyboard.up("Control");
      const after = await viewer(page);
      assert.ok(
        Math.abs(after.zoom - before.zoom * Math.exp(0.24)) < 1e-3,
        `zoom ${before.zoom} -> ${after.zoom}`,
      );
      // The point under the pointer stays under it.
      const still = await page.evaluate(() => {
        const root = document.querySelector("meltemi-player")!.shadowRoot!;
        const r = root
          .querySelector('[data-id="api"][data-role="element"]')!
          .getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      assert.ok(
        Math.abs(still.x - box.x) < 1.5 && Math.abs(still.y - box.y) < 1.5,
        JSON.stringify(still),
      );
      const now = await state(page);
      assert.equal(now.svg, exported(now.time));
      await page.screenshot({ path: join(output, "player-zoom.png"), fullPage: true });
    },
  },
  {
    name: "leaves a plain wheel to the page while the drawing fits, and pans it once zoomed",
    html: playerPage(purchase, script).replace(
      "</body>",
      '<div style="height: 3000px"></div></body>',
    ),
    async run(page) {
      const frame = await page.evaluate(() => {
        const r = document
          .querySelector("meltemi-player")!
          .shadowRoot!.querySelector(".frame")!
          .getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      const before = await viewer(page);
      await page.mouse.move(frame.x, frame.y);
      await page.mouse.wheel(0, 200);
      await page.waitForFunction(() => window.scrollY > 0);
      assert.deepEqual(await viewer(page), before);
      await page.evaluate(() => window.scrollTo(0, 0));
      await call(page, "setZoom", 4);
      await page.waitForTimeout(250);
      const zoomed = await viewer(page);
      await page.mouse.move(frame.x, frame.y);
      await page.mouse.wheel(0, 60);
      await page.waitForTimeout(100);
      const panned = await viewer(page);
      assert.ok(panned.y < zoomed.y, `${zoomed.y} -> ${panned.y}`);
      assert.equal(await page.evaluate(() => window.scrollY), 0);
    },
  },
  {
    name: "pans by dragging and swallows the click that ends the drag",
    html: playerPage(purchase, script),
    async run(page) {
      await call(page, "setZoom", 3);
      await page.waitForTimeout(250);
      const frame = await page.evaluate(() => {
        const r = document
          .querySelector("meltemi-player")!
          .shadowRoot!.querySelector(".frame")!
          .getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      const before = await viewer(page);
      await page.mouse.move(frame.x, frame.y);
      await page.mouse.down();
      await page.mouse.move(frame.x + 20, frame.y, { steps: 2 });
      await page.mouse.move(frame.x + 40, frame.y, { steps: 2 });
      await page.mouse.up();
      const after = await viewer(page);
      assert.ok(Math.abs(after.x - before.x - 40) < 0.5, `${before.x} -> ${after.x}`);
      assert.equal(await selection(page), null);
      assert.equal(
        await page
          .locator("meltemi-player")
          .evaluate((e) => e.shadowRoot!.querySelector(".details")!.hasAttribute("hidden")),
        true,
      );
    },
  },
  {
    name: "zooms and pans from the keyboard and the zoom buttons, and says so",
    html: playerPage(purchase, script),
    async run(page) {
      const fit = (await viewer(page)).zoom;
      await page.locator(".frame").focus();
      await page.keyboard.press("+");
      const zoomed = (await viewer(page)).zoom;
      assert.ok(zoomed > fit, `${fit} -> ${zoomed}`);
      const level = page.getByRole("button", { name: /^Zoom \d+%\. Actual size \(1\)$/ });
      assert.equal(await level.textContent(), `${Math.round(zoomed * 100)}%`);
      assert.equal(
        await page.getByRole("status").textContent(),
        `Zoom ${Math.round(zoomed * 100)}%`,
      );
      await page.keyboard.press("1");
      assert.equal((await viewer(page)).zoom, 1);
      await page.keyboard.press("+");
      const x = (await viewer(page)).x;
      await page.keyboard.press("Shift+ArrowRight");
      assert.ok((await viewer(page)).x < x, "Shift and Right pan");
      await page.keyboard.press("0");
      assert.equal((await viewer(page)).zoom, fit);
      assert.match((await page.getByRole("status").textContent()) ?? "", /^Whole drawing, \d+%$/);
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      assert.ok((await viewer(page)).zoom > fit);
      await page.getByRole("button", { name: "Fit the drawing" }).click();
      assert.equal((await viewer(page)).zoom, fit);
      assert.equal(
        await page.getByRole("button", { name: "Zoom in", exact: true }).getAttribute("title"),
        "Zoom in (+)",
      );
      await call(page, "setZoom", 8);
      assert.equal(
        await page.getByRole("button", { name: "Zoom in", exact: true }).isDisabled(),
        true,
      );
      // The time keys still step the story.
      await page.locator(".frame").focus();
      await page.keyboard.press("ArrowRight");
      assert.equal((await state(page)).time, 1000);
    },
  },
  {
    name: "keeps the zoom while the story plays, and every frame is still the exporter's",
    html: playerPage(purchase, script),
    async run(page) {
      await call(page, "setZoom", 2);
      await page.getByRole("button", { name: "Play" }).click();
      await page.waitForTimeout(500);
      await page.getByRole("button", { name: "Pause" }).click();
      assert.equal((await viewer(page)).zoom, 2);
      const now = await state(page);
      assert.ok(now.time > 200, `time ${now.time}`);
      assert.equal(now.svg, exported(now.time));
    },
  },
  {
    name: "moves the drawing without transitions when reduced motion is asked",
    html: playerPage(purchase, script),
    reducedMotion: true,
    async run(page) {
      const duration = await page.evaluate(
        () =>
          getComputedStyle(
            document.querySelector("meltemi-player")!.shadowRoot!.querySelector(".content")!,
          ).transitionDuration,
      );
      assert.equal(duration, "0s");
    },
  },
  {
    name: "draws only the frame and the playback controls when not interactive",
    html: playerPage(purchase, script).replace(
      "<meltemi-player",
      '<meltemi-player interactive="false"',
    ),
    async run(page) {
      const root = page.locator("meltemi-player");
      assert.equal(
        await root.evaluate((e) =>
          e.shadowRoot!.querySelector(".overlay, .card, .details, .trail, .zoom"),
        ),
        null,
      );
      const before = await viewer(page);
      await page.locator(".frame").focus();
      await page.keyboard.press("+");
      assert.deepEqual(await viewer(page), before);
    },
  },
  {
    name: "shows a card after the pointer rests on an element, and hides it",
    html: playerPage(commerce, script),
    async run(page) {
      const bank = await centre(page, "bank");
      await page.mouse.move(bank.x, bank.y);
      const card = page.getByRole("tooltip", { includeHidden: true });
      await page.waitForFunction(() => {
        const c = document.querySelector("meltemi-player")!.shadowRoot!.querySelector(".card");
        return c !== null && !c.hasAttribute("hidden");
      });
      const text = (await card.textContent()) ?? "";
      assert.match(text, /^Banco/);
      assert.match(text, /External Software System/);
      assert.match(text, /Autoriza tarjetas/);
      // Below the box, never over it.
      const placed = await page.evaluate(() => {
        const root = document.querySelector("meltemi-player")!.shadowRoot!;
        const c = root.querySelector(".card")!.getBoundingClientRect();
        const b = root
          .querySelector('[data-id="bank"][data-role="element"]')!
          .getBoundingClientRect();
        return c.top >= b.bottom || c.bottom <= b.top;
      });
      assert.equal(placed, true);
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(output, "player-card.png") });
      await page.mouse.wheel(0, 10);
      assert.equal(await cardShown(page), false);
      await page.mouse.move(bank.x + 1, bank.y + 1);
      await page.mouse.move(5, 5);
      assert.equal(await cardShown(page), false);
    },
  },
  {
    name: "shows a relation's card from near its line",
    html: playerPage(commerce, script),
    async run(page) {
      const point = await trackPoint(page, "visit");
      await page.mouse.move(point.x, point.y + 4);
      await page.waitForFunction(() => {
        const c = document.querySelector("meltemi-player")!.shadowRoot!.querySelector(".card");
        return c !== null && !c.hasAttribute("hidden");
      });
      const text = (await page.getByRole("tooltip", { includeHidden: true }).textContent()) ?? "";
      assert.match(text, /^Compra/);
      assert.match(text, /Cliente → Commerce/);
    },
  },
  {
    name: "selects on a click and opens the panel, without leaving the page",
    html: playerPage(commerce, script),
    async run(page) {
      const address = page.url();
      const shop = await centre(page, "shop");
      await page.mouse.click(shop.x, shop.y);
      const panel = page.getByRole("region", { name: "Details of Commerce" });
      await panel.waitFor();
      const text = (await panel.textContent()) ?? "";
      assert.match(text, /Software System/);
      assert.match(text, /Tienda en línea/);
      assert.equal(await panel.getByRole("button", { name: "Open containers" }).count(), 1);
      assert.deepEqual(await selection(page), { role: "element", id: "shop", view: "context" });
      assert.equal(page.url(), address);
      assert.equal(await page.getByRole("status").textContent(), "Selected: Commerce");
      // The frame is still the renderer's.
      assert.equal((await state(page)).svg, frameSvg(commerce, 0, { view: "context" }));
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(output, "player-panel.png") });
      // Another element swaps the body; Escape closes; a click on the background clears.
      const bank = await centre(page, "bank");
      await page.mouse.click(bank.x, bank.y);
      await page.getByRole("region", { name: "Details of Banco" }).waitFor();
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("region").count(), 0);
      await page.mouse.click(5 + (await frameBox(page)).x, 5 + (await frameBox(page)).y);
      assert.equal(await selection(page), null);
      assert.equal(await call(page, "select", "nope"), false);
    },
  },
  {
    name: "walks the elements from the keyboard and opens their details with Enter",
    html: playerPage(commerce, script),
    async run(page) {
      await page.locator(".frame").focus();
      await page.keyboard.press("ArrowDown");
      const first = (await page.getByRole("status").textContent()) ?? "";
      assert.ok(first.length > 0);
      await page.keyboard.press("Enter");
      const region = page.getByRole("region");
      await region.waitFor();
      const focused = await page.evaluate(
        () => document.querySelector("meltemi-player")!.shadowRoot!.activeElement?.className,
      );
      assert.equal(focused, "title");
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("region").count(), 0);
      const back = await page.evaluate(
        () => document.querySelector("meltemi-player")!.shadowRoot!.activeElement?.className,
      );
      assert.match(back ?? "", /\bframe\b/);
      await page.keyboard.press("Escape");
      assert.equal(await selection(page), null);
      assert.equal(await page.getByRole("status").textContent(), "Selection cleared");
    },
  },
  {
    name: "selects an element with a link instead of following it, and offers the link",
    html: playerPage(linked, script),
    async run(page) {
      const api = await centre(page, "api");
      await page.mouse.click(api.x, api.y);
      const panel = page.getByRole("region", { name: "Details of API" });
      await panel.waitFor();
      assert.equal(page.url(), "about:blank");
      const link = panel.getByRole("link", { name: "https://docs.example.com/api" });
      assert.equal(await link.getAttribute("href"), "https://docs.example.com/api");
      assert.equal(await link.getAttribute("rel"), "noopener noreferrer");
      // The description is text, never markup.
      assert.match((await panel.textContent()) ?? "", /Uses <b>TLS<\/b>/);
      assert.equal(await panel.locator("b").count(), 0);
    },
  },
  {
    name: "opens the panel under the drawing on a phone, from a tap, without a card",
    html: playerPage(commerce, script),
    touch: true,
    async run(page) {
      const shop = await centre(page, "shop");
      await page.touchscreen.tap(shop.x, shop.y);
      await page.getByRole("region", { name: "Details of Commerce" }).waitFor();
      assert.equal(await cardShown(page), false);
      const below = await page.evaluate(() => {
        const root = document.querySelector("meltemi-player")!.shadowRoot!;
        const frame = root.querySelector(".frame")!.getBoundingClientRect();
        const panel = root.querySelector(".details")!.getBoundingClientRect();
        return panel.top >= frame.bottom - 1 && document.documentElement.scrollWidth <= innerWidth;
      });
      assert.equal(below, true);
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(output, "player-panel-phone.png"), fullPage: true });
    },
  },
  {
    name: "speaks Spanish in the cards, the panel and the zoom controls",
    html: playerPage(commerceEs, script, { lang: "es" }),
    async run(page) {
      const shop = await centre(page, "shop");
      await page.mouse.click(shop.x, shop.y);
      const panel = page.getByRole("region", { name: "Detalles de Commerce" });
      await panel.waitFor();
      assert.equal(await panel.getByRole("button", { name: "Abrir containers" }).count(), 1);
      assert.equal(await page.getByRole("button", { name: "Acercar", exact: true }).count(), 1);
      assert.equal(await page.getByRole("status").textContent(), "Seleccionado: Commerce");
      await page.emulateMedia({ colorScheme: "dark" });
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(output, "player-panel-es-dark.png") });
    },
  },
  {
    name: "draws plus badges only on elements that open a view",
    html: playerPage(commerce, script),
    async run(page) {
      assert.deepEqual(await badges(page), ["shop"]);
      assert.equal(
        await page
          .locator("meltemi-player")
          .evaluate((e) => e.shadowRoot!.querySelector(".trail")!.hasAttribute("hidden")),
        true,
        "no trail on the top view",
      );
    },
  },
  {
    name: "opens a child view with a camera move and a morph, and goes back up",
    html: playerPage(commerce, script),
    async run(page) {
      const shop = await centre(page, "shop");
      await page.mouse.dblclick(shop.x, shop.y);
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(output, "player-drill.png") });
      await page.waitForFunction(() => {
        const p = (
          document.querySelector("meltemi-player") as HTMLElement & {
            player: { view: string; controller: { drill: unknown } };
          }
        ).player;
        return p.view === "containers" && p.controller.drill === null;
      });
      assert.equal(await page.getByRole("status").textContent(), "Opened containers");
      assert.deepEqual(await badges(page), ["shop.api"]);
      assert.equal((await state(page)).svg, frameSvg(commerce, 0, { view: "containers" }));
      const crumbs = await page.getByRole("navigation", { name: "Path" }).textContent();
      assert.match(crumbs ?? "", /Commerce en contexto/);
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(output, "player-drilled.png") });
      // The badge opens too, and Backspace goes up.
      await page.locator("meltemi-player").evaluate((e) => {
        const badge = e.shadowRoot!.querySelector('.overlay [data-open="shop.api"]')!;
        badge.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
      });
      await page.waitForFunction(
        () =>
          (document.querySelector("meltemi-player") as HTMLElement & { player: { view: string } })
            .player.view === "components",
      );
      await page.locator(".frame").focus();
      await page.keyboard.press("Backspace");
      await page.waitForFunction(() => {
        const p = (
          document.querySelector("meltemi-player") as HTMLElement & {
            player: { view: string; controller: { drill: unknown } };
          }
        ).player;
        return p.view === "containers" && p.controller.drill === null;
      });
      assert.deepEqual(await selection(page), {
        role: "element",
        id: "shop.api",
        view: "containers",
      });
      assert.equal(await page.getByRole("status").textContent(), "Back in containers");
      // A crumb jumps to the top.
      await page
        .getByRole("navigation", { name: "Path" })
        .getByRole("button", { name: "Commerce en contexto", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          (document.querySelector("meltemi-player") as HTMLElement & { player: { view: string } })
            .player.view === "context",
      );
      // Enter on a selected element that opens something opens it.
      await call(page, "select", "shop");
      await page.locator(".frame").focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () =>
          (document.querySelector("meltemi-player") as HTMLElement & { player: { view: string } })
            .player.view === "containers",
      );
    },
  },
  {
    name: "cuts to the child view when reduced motion is asked",
    html: playerPage(commerce, script),
    reducedMotion: true,
    async run(page) {
      const shop = await centre(page, "shop");
      await page.mouse.dblclick(shop.x, shop.y);
      assert.equal(
        await page.evaluate(
          () =>
            (
              document.querySelector("meltemi-player") as HTMLElement & {
                player: { view: string; controller: { drill: unknown } };
              }
            ).player.controller.drill,
        ),
        null,
      );
      assert.equal(
        await page.evaluate(
          () =>
            (document.querySelector("meltemi-player") as HTMLElement & { player: { view: string } })
              .player.view,
        ),
        "containers",
      );
      assert.equal(await page.getByRole("status").textContent(), "Opened containers");
    },
  },
  {
    name: "only selects an element that opens nothing on a double click",
    html: playerPage(commerce, script),
    async run(page) {
      const bank = await centre(page, "bank");
      await page.mouse.dblclick(bank.x, bank.y);
      await page.waitForTimeout(100);
      assert.equal(await call(page, "open", "bank"), false);
      assert.deepEqual(await selection(page), { role: "element", id: "bank", view: "context" });
      assert.equal(
        await page.evaluate(
          () =>
            (document.querySelector("meltemi-player") as HTMLElement & { player: { view: string } })
              .player.view,
        ),
        "context",
      );
    },
  },
];

async function main(): Promise<void> {
  const browser: Browser = await chromium.launch({ executablePath: browserPath(), headless: true });
  let failed = 0;
  try {
    for (const test of tests) {
      const page = await browser.newPage(
        test.touch
          ? { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true }
          : { viewport: { width: 1200, height: 800 } },
      );
      const requests: string[] = [];
      const errors: string[] = [];
      page.on("request", (request) => requests.push(request.url()));
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      try {
        if (test.reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
        await page.setContent(test.html);
        await page.waitForFunction(() =>
          [...document.querySelectorAll("meltemi-player")].every(
            (e) => (e as HTMLElement & { player?: unknown }).player !== undefined,
          ),
        );
        await test.run(page);
        assert.deepEqual(errors, [], "no errors");
        assert.deepEqual(requests, [], "the page works offline");
        console.log(`  ✓ ${test.name}`);
      } catch (error) {
        failed++;
        console.log(`  ✗ ${test.name}\n    ${(error as Error).message.split("\n").join("\n    ")}`);
        await page
          .screenshot({ path: join(output, `failed-${tests.indexOf(test)}.png`) })
          .catch(() => undefined);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${tests.length - failed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

await main();
