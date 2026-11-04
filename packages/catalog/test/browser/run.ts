/**
 * The catalog in a headless Edge or Chrome, opened from disk: navigation, links, search, players,
 * downloads, narrow screens and dark mode, and no network. Usage: pnpm catalog:test-browser
 */
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// The editor builds catalogs and depends on this package, so the test reaches it by path.
import { buildCatalog, ProjectSessions } from "../../../editor/src/node.js";
import { toProjectPath } from "../../../project/src/index.js";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { browserPath } from "../../../vscode/scripts/browser.mjs";
import { catalogScript } from "../../src/node.js";

const here = dirname(fileURLToPath(import.meta.url));
const output = join(here, "..", "..", ".test-output");
const corpus = join(here, "..", "..", "..", "..", "corpus");

/**
 * A project of corpus sheets in four folders, with its source in the catalog, in `folder`; with a
 * `locale`, the project's content language.
 */
function writeFixture(folder: string, locale?: "es"): string {
  const fixture = join(output, folder);
  rmSync(fixture, { recursive: true, force: true });
  for (const sheet of [
    "c4/commerce.meltemi",
    "free/converted.meltemi",
    "sequence/payment.meltemi",
    "stories/purchase.meltemi",
  ]) {
    mkdirSync(join(fixture, dirname(sheet)), { recursive: true });
    copyFileSync(join(corpus, "valid", sheet), join(fixture, sheet));
  }
  writeFileSync(
    join(fixture, "project.json"),
    JSON.stringify({
      name: "corpus",
      language: "0.2",
      ...(locale ? { locale } : {}),
      catalog: {
        title: "Corpus catalog",
        description: "Every profile of the corpus, with a story.",
        source: true,
      },
    }),
  );
  const projects = new ProjectSessions({ toolVersion: "1.0.0" });
  const workspace = projects.forFolder(toProjectPath(fixture));
  const build = buildCatalog(workspace, projects, {
    generator: "Meltemi Diagrams 1.0.0",
    script: catalogScript,
  });
  mkdirSync(dirname(build.out), { recursive: true });
  writeFileSync(build.out, build.html);
  return build.out;
}

const url = pathToFileURL(writeFixture("fixture")).href;
// The same project with `"locale": "es"`: its catalog is written in Spanish.
const spanishUrl = pathToFileURL(writeFixture("fixture-es", "es")).href;

interface Test {
  readonly name: string;
  /** The catalog to open; the English one by default. */
  readonly url?: string;
  readonly viewport?: { width: number; height: number };
  readonly dark?: boolean;
  /** A touch screen. */
  readonly touch?: boolean;
  readonly run: (page: Page, context: BrowserContext) => Promise<void>;
}

/** Opens a route and waits for its page. */
async function open(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
  await page.waitForFunction((h) => location.hash === h, hash);
}

/** The SVG of the page's drawing, once drawn. */
async function drawing(page: Page): Promise<string> {
  await page.waitForFunction(
    () => document.querySelector("#drawing")?.shadowRoot?.querySelector(".frame svg") !== null,
  );
  return page.evaluate(
    () => document.querySelector("#drawing")!.shadowRoot!.querySelector(".frame svg")!.outerHTML,
  );
}

/** The centre of an element of the page's drawing, in page pixels. */
async function centre(page: Page, id: string): Promise<{ x: number; y: number }> {
  return page.evaluate((i) => {
    const g = document
      .querySelector("#drawing")!
      .shadowRoot!.querySelector(`.picture [data-id="${i}"][data-role="element"]`)!;
    const r = g.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, id);
}

/** What the catalog says of its drawing: the selection and the trail. */
async function catalogState(
  page: Page,
): Promise<{ selection: { id: string } | null; trail: readonly string[] }> {
  return page.evaluate(() => {
    const catalog = (
      window as unknown as {
        meltemiCatalog: { selection: { id: string } | null; trail: readonly string[] };
      }
    ).meltemiCatalog;
    return { selection: catalog.selection, trail: [...catalog.trail] };
  });
}

/** The elements of the page's drawing with a plus badge. */
async function catalogBadges(page: Page): Promise<string[]> {
  await page.waitForFunction(
    () => document.querySelector("#drawing")?.shadowRoot?.querySelector(".overlay") !== null,
  );
  return page.evaluate(() =>
    [
      ...document.querySelector("#drawing")!.shadowRoot!.querySelectorAll(".overlay [data-open]"),
    ].map((b) => b.getAttribute("data-open")!),
  );
}

const heading = (page: Page) => page.locator("main h1").textContent();
const shot = (page: Page, name: string) =>
  page.screenshot({ path: join(output, `${name}.png`), fullPage: true });

const tests: Test[] = [
  {
    name: "lists the folders, draws the thumbnails and reads without network",
    run: async (page) => {
      assert.equal(await heading(page), "Corpus catalog");
      assert.deepEqual(await page.locator("main h2").allTextContents(), [
        "c4",
        "free",
        "sequence",
        "stories",
      ]);
      await page.waitForFunction(() =>
        [...document.querySelectorAll("[data-thumb]")]
          .slice(0, 3)
          .every((t) => t.shadowRoot?.querySelector("svg")),
      );
      assert.equal(await page.locator("nav [aria-current=page]").textContent(), "Overview");
      await shot(page, "home");
    },
  },
  {
    name: "visits every page from disk without a request or an error",
    run: async (page) => {
      const hashes = await page.evaluate(() =>
        [...document.querySelectorAll("nav a")].map((a) => a.getAttribute("href")!),
      );
      assert.ok(hashes.length >= 9);
      for (const hash of hashes) {
        await open(page, hash);
        if (hash.startsWith("#/diagram/") || hash.startsWith("#/story/")) {
          assert.match(await drawing(page), /^<svg/);
        }
      }
      await open(page, "#/entities");
      assert.equal(await heading(page), "Entities");
      await open(page, "#/nowhere");
      assert.equal(await heading(page), "Not found");
    },
  },
  {
    name: "searches without case or accents and opens a result from the keyboard",
    run: async (page) => {
      await page.keyboard.press("/");
      assert.equal(await page.evaluate(() => document.activeElement?.id), "search");
      await page.keyboard.type("PÉDIDOS");
      await page.waitForFunction(() => location.hash.startsWith("#/search?q="));
      const status = await page.locator("#search-status").textContent();
      assert.match(status!, /^\d+ results? for “PÉDIDOS”\.$/);
      assert.equal(await page.locator("#announce").textContent(), status);
      assert.ok((await page.locator(".results li").count()) >= 2);
      assert.equal(await page.evaluate(() => document.activeElement?.id), "search");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => !location.hash.startsWith("#/search"));
      // The page moves the focus to the new view's title once it has drawn it.
      await page
        .waitForFunction(() => document.activeElement?.tagName === "H1", undefined, {
          timeout: 5000,
        })
        .catch(() => undefined);
      assert.equal(await page.evaluate(() => document.activeElement?.tagName), "H1");
      assert.equal(await page.inputValue("#search"), "");
      await page.goBack();
      await page.waitForFunction(() => location.hash.startsWith("#/search"));
      await shot(page, "search");
    },
  },
  {
    name: "selects an element on a click, and its panel opens the linked diagram",
    run: async (page) => {
      await open(page, "#/diagram/free/converted/grouped_free");
      await drawing(page);
      const box = await centre(page, "api");
      await page.mouse.click(box.x, box.y);
      const panel = page.locator("#drawing").getByRole("region");
      await panel.waitFor();
      // A click selects: the address stays.
      assert.equal(
        await page.evaluate(() => location.hash),
        "#/diagram/free/converted/grouped_free",
      );
      assert.equal((await catalogState(page)).selection?.id, "api");
      await panel.getByRole("button", { name: /^Open grouped/ }).click();
      await page.waitForFunction(
        () => location.hash === "#/diagram/free/converted/grouped?element=api",
      );
      await page.waitForFunction(
        () =>
          (window as unknown as { meltemiCatalog: { selection: { id: string } | null } })
            .meltemiCatalog.selection?.id === "api",
      );
      assert.equal(await heading(page), "grouped");
      await shot(page, "linked");
    },
  },
  {
    name: "opens an entity from the panel of a C4 element and lists where it is drawn",
    run: async (page) => {
      await open(page, "#/diagram/c4/commerce/containers");
      await drawing(page);
      const box = await centre(page, "shop.api");
      await page.mouse.click(box.x, box.y);
      const panel = page.locator("#drawing").getByRole("region");
      await panel.waitFor();
      assert.match((await panel.textContent()) ?? "", /Container/);
      await panel.getByRole("link", { name: "Entity: API" }).click();
      await page.waitForFunction(() => location.hash === "#/entity/c4/commerce/commerce/shop.api");
      // The hash changes before the page draws the entity: wait for its list.
      await page.waitForFunction(
        () => document.querySelectorAll("main section:last-of-type a").length > 0,
      );
      const shown = await page.locator("main section:last-of-type a").allTextContents();
      assert.ok(shown.includes("containers"), shown.join(", "));
      await shot(page, "entity");
    },
  },
  {
    name: "drills down on a double click into the next page, and goes back up",
    run: async (page) => {
      await open(page, "#/diagram/c4/commerce/context");
      await drawing(page);
      assert.deepEqual(await catalogBadges(page), ["shop"]);
      const shop = await centre(page, "shop");
      await page.mouse.dblclick(shop.x, shop.y);
      await page.waitForFunction(() => location.hash === "#/diagram/c4/commerce/containers");
      // The next page's player plays the way in, then settles on the child view.
      await page.waitForFunction(
        () =>
          (
            window as unknown as {
              meltemiCatalog: { players: { controller: { drill: unknown } }[] };
            }
          ).meltemiCatalog.players[0]?.controller.drill === null,
      );
      assert.equal(await heading(page), "containers");
      assert.deepEqual((await catalogState(page)).trail, ["Commerce en contexto"]);
      assert.deepEqual(await catalogBadges(page), ["shop.api"]);
      await shot(page, "drilled");
      // Backspace in the drawing goes up, and the parent selects the box it came from.
      await page.keyboard.press("Backspace");
      await page.waitForFunction(() => location.hash === "#/diagram/c4/commerce/context");
      await page.waitForFunction(
        () =>
          (window as unknown as { meltemiCatalog: { selection: { id: string } | null } })
            .meltemiCatalog.selection?.id === "shop",
      );
      // The browser's Back and Forward go between the same pages.
      await page.goBack();
      await page.waitForFunction(() => location.hash === "#/diagram/c4/commerce/containers");
      await page.goForward();
      await page.waitForFunction(() => location.hash === "#/diagram/c4/commerce/context");
    },
  },
  {
    name: "shows the views above a deep link, and selects the element of the address",
    run: async (page) => {
      await open(page, "#/diagram/c4/commerce/components");
      await drawing(page);
      assert.deepEqual((await catalogState(page)).trail, ["Commerce en contexto", "containers"]);
      const crumbs = await page.locator("main nav.crumbs a").allTextContents();
      assert.deepEqual(crumbs.slice(-2), ["Commerce en contexto", "containers"]);
      await open(page, "#/diagram/c4/commerce/containers?element=shop.db");
      await drawing(page);
      await page.waitForFunction(
        () =>
          (window as unknown as { meltemiCatalog: { selection: { id: string } | null } })
            .meltemiCatalog.selection?.id === "shop.db",
      );
      // The entity of a system lists the views scoped to it.
      await open(page, "#/entity/c4/commerce/commerce/shop");
      assert.ok((await page.locator("main h2").allTextContents()).includes("Views scoped to it"));
    },
  },
  {
    name: "opens the panel under the drawing on a phone, from a tap",
    viewport: { width: 375, height: 812 },
    touch: true,
    dark: true,
    run: async (page) => {
      await open(page, "#/diagram/c4/commerce/containers");
      await drawing(page);
      const box = await centre(page, "shop.api");
      await page.touchscreen.tap(box.x, box.y);
      const panel = page.locator("#drawing").getByRole("region");
      await panel.waitFor();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      assert.ok(overflow <= 0, `scrolls sideways by ${overflow}px`);
      await page.waitForTimeout(400);
      await shot(page, "phone-panel");
    },
  },
  {
    name: "switches sequence scenarios and keeps the choice in the address",
    run: async (page) => {
      await open(page, "#/diagram/sequence/payment/payment");
      const written = await drawing(page);
      await page.selectOption("#scenario", { label: "Pago rechazado" });
      await page.waitForFunction(() => location.hash.endsWith("?scenario=rejected"));
      const rejected = await drawing(page);
      assert.notEqual(rejected, written);
      assert.match(rejected, /Rechazo/);
      assert.doesNotMatch(rejected, />OK</);
      await page.reload();
      assert.equal(await page.inputValue("#scenario"), "2");
      await shot(page, "scenario");
    },
  },
  {
    name: "plays a story with the player",
    run: async (page) => {
      await open(page, "#/story/stories/purchase/purchase");
      const first = await drawing(page);
      await page.locator("#drawing").getByRole("button", { name: "Play" }).click();
      await page.waitForTimeout(1200);
      const time = await page.evaluate(
        () =>
          (window as unknown as { meltemiCatalog: { players: { controller: { time: number } }[] } })
            .meltemiCatalog.players[0]!.controller.time,
      );
      assert.ok(time > 500, `time ${time}`);
      assert.notEqual(await drawing(page), first);
      await shot(page, "story");
    },
  },
  {
    name: "downloads a standalone SVG with its fonts, and the source",
    run: async (page) => {
      await open(page, "#/diagram/stories/purchase/checkout");
      await drawing(page);
      const [svg] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Download SVG" }).click(),
      ]);
      assert.equal(svg.suggestedFilename(), "purchase.checkout.svg");
      const text = readFileSync((await svg.path())!, "utf8");
      // Zoomed and selected, the download is still the renderer's drawing.
      await page.evaluate(() => {
        const player = (
          window as unknown as {
            meltemiCatalog: {
              players: { setZoom(z: number): void; select(id: string): boolean }[];
            };
          }
        ).meltemiCatalog.players[0]!;
        player.setZoom(3);
        player.select("api");
      });
      const [again] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Download SVG" }).click(),
      ]);
      assert.equal(readFileSync((await again.path())!, "utf8"), text);
      assert.doesNotMatch(text, /data-open|class="overlay"|scale\(3\)/);
      assert.match(text, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
      assert.match(text, /@font-face\{font-family:"Inter"/);
      const [source] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Download source" }).click(),
      ]);
      assert.equal(source.suggestedFilename(), "purchase.meltemi");
      assert.equal(
        readFileSync((await source.path())!, "utf8"),
        readFileSync(join(corpus, "valid", "stories", "purchase.meltemi"), "utf8"),
      );
    },
  },
  {
    name: "keeps history and focuses each page's heading",
    run: async (page) => {
      await page
        .getByRole("link", { name: /payment/ })
        .first()
        .click();
      await page.waitForFunction(() => location.hash.startsWith("#/diagram/"));
      // The page draws and focuses its heading after the hash changes.
      await page.waitForFunction(() => document.activeElement?.tagName === "H1");
      assert.equal(await page.title(), "payment · Corpus catalog");
      await page.goBack();
      await page.waitForFunction(() => location.hash === "" || location.hash === "#/");
      assert.equal(await heading(page), "Corpus catalog");
    },
  },
  {
    name: "speaks Spanish in a catalog built in Spanish: pages, search, players and drawings",
    url: spanishUrl,
    run: async (page) => {
      assert.equal(await page.getAttribute("html", "lang"), "es");
      assert.equal(await page.locator("nav [aria-current=page]").textContent(), "Vista general");
      assert.equal(await page.getAttribute("#search", "placeholder"), "Buscar (tecla /)");
      assert.match(
        (await page.locator("main .stats").textContent()) ?? "",
        /^\d+ diagramas · 1 historia · \d+ entidades$/,
      );
      // The runtime's words: search results and their count, from the keyboard.
      await page.keyboard.press("/");
      await page.keyboard.type("pedidos");
      await page.waitForFunction(() => location.hash.startsWith("#/search?q="));
      const status = await page.locator("#search-status").textContent();
      assert.match(status!, /^\d+ resultados? para “pedidos”\.$/);
      assert.equal(await page.locator("#announce").textContent(), status);
      assert.equal(await page.title(), "Búsqueda · Corpus catalog");
      assert.ok((await page.locator(".results .badge").allTextContents()).includes("Flujo"));
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => !location.hash.startsWith("#/search"));
      // A story's page, with its player in Spanish.
      await open(page, "#/story/stories/purchase/purchase");
      assert.deepEqual(await page.locator("main h2").allTextContents(), [
        "Escenas",
        "Diagramas que muestra",
        "Código fuente",
      ]);
      await drawing(page);
      await page.locator("#drawing").getByRole("button", { name: "Reproducir" }).click();
      await page.waitForTimeout(600);
      await page.locator("#drawing").getByRole("button", { name: "Pausar" }).click();
      const time = await page.evaluate(
        () =>
          (window as unknown as { meltemiCatalog: { players: { controller: { time: number } }[] } })
            .meltemiCatalog.players[0]!.controller.time,
      );
      assert.ok(time > 100, `time ${time}`);
      // A sequence diagram's scenarios, and a C4 view drawn with Spanish type lines.
      await open(page, "#/diagram/sequence/payment/payment");
      await drawing(page);
      assert.deepEqual(await page.locator("#scenario option").allTextContents(), [
        "Tal como está escrito",
        "Pago aprobado",
        "Pago rechazado",
      ]);
      assert.equal(await page.getByRole("button", { name: "Descargar SVG" }).count(), 1);
      await open(page, "#/diagram/c4/commerce/containers");
      assert.match(await drawing(page), /\[Contenedor/);
      const api = await centre(page, "shop.api");
      await page.mouse.click(api.x, api.y);
      const panel = page
        .locator("#drawing")
        .getByRole("region", { name: "Detalles de API de pedidos" });
      await panel.waitFor();
      assert.equal(await panel.getByRole("button", { name: /^Abrir components/ }).count(), 1);
      assert.match((await panel.textContent()) ?? "", /Contenedor/);
      await open(page, "#/nowhere");
      assert.equal(await heading(page), "No encontrado");
      await open(page, "#/");
      await shot(page, "home-es");
    },
  },
  {
    name: "fits a phone in dark mode",
    viewport: { width: 375, height: 812 },
    dark: true,
    run: async (page) => {
      for (const hash of ["#/", "#/diagram/sequence/payment/payment", "#/entities"]) {
        await open(page, hash);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        assert.ok(overflow <= 0, `${hash} scrolls sideways by ${overflow}px`);
      }
      const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      assert.equal(background, "rgb(15, 18, 22)");
      await open(page, "#/");
      await shot(page, "phone-dark");
    },
  },
];

async function main(): Promise<void> {
  const browser: Browser = await chromium.launch({ executablePath: browserPath(), headless: true });
  let failed = 0;
  try {
    for (const test of tests) {
      const context = await browser.newContext({
        acceptDownloads: true,
        viewport: test.viewport ?? { width: 1280, height: 860 },
        colorScheme: test.dark ? "dark" : "light",
        ...(test.touch ? { hasTouch: true, isMobile: true } : {}),
      });
      const page = await context.newPage();
      const address = test.url ?? url;
      const requests: string[] = [];
      const errors: string[] = [];
      page.on("request", (request) => {
        const target = request.url();
        if (target.split("#")[0] !== address && !/^(data|blob):/.test(target)) {
          requests.push(target);
        }
      });
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      try {
        await page.goto(address);
        await page.waitForFunction(() => "meltemiCatalog" in window);
        await test.run(page, context);
        assert.deepEqual(errors, [], "no errors");
        assert.deepEqual(requests, [], "the catalog works offline");
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
  }
  console.log(`\n${tests.length - failed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

await main();
