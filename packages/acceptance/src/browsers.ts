// The browser matrix: the purchase example in every format, opened in Edge, Chrome and Firefox
// (Firefox through WebDriver BiDi) from a server on 127.0.0.1, with nothing else reachable. PDF is
// read from the file, the same for every browser.
// Usage: pnpm verification:browsers   (writes docs/verification/browsers.md)
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, type Browser, type Page } from "playwright-core";
import { findFfmpeg } from "@meltemi/diagrams-capture";
import { machine } from "./bench.js";
import { REPO_ROOT } from "./corpus.js";
import { mdg } from "./cli.js";
import { KIT_FILES, KIT_LINK, writeKit } from "./kit.js";
import { writeMarkdown } from "./markdown.js";
import { pdfFacts } from "./pdf.js";
import { readPng } from "./png.js";
import { BLANK_PAGE, serveFolder } from "./serve.js";

export type BrowserName = "Edge" | "Chrome" | "Firefox";

interface BrowserKind {
  readonly name: BrowserName;
  readonly engine: "chromium" | "firefox";
  readonly paths: readonly (string | undefined)[];
}

/** Where each browser is installed; an environment variable names another place. */
export const BROWSERS: readonly BrowserKind[] = [
  {
    name: "Edge",
    engine: "chromium",
    paths: [
      process.env.MELTEMI_EDGE,
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/usr/bin/microsoft-edge",
    ],
  },
  {
    name: "Chrome",
    engine: "chromium",
    paths: [
      process.env.MELTEMI_CHROME,
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
    ],
  },
  {
    name: "Firefox",
    engine: "firefox",
    paths: [
      process.env.MELTEMI_FIREFOX,
      "C:/Program Files/Mozilla Firefox/firefox.exe",
      "/Applications/Firefox.app/Contents/MacOS/firefox",
      "/usr/bin/firefox",
    ],
  },
];

/** What the exports are expected to be, from the files themselves. */
interface Expected {
  readonly base: string;
  readonly svgs: readonly string[];
  readonly animatedSvg: string;
  readonly pngs: readonly {
    readonly url: string;
    readonly width: number;
    readonly height: number;
  }[];
  readonly player: string;
  readonly catalog: string;
  readonly videos: readonly {
    readonly url: string;
    readonly format: string;
    readonly durationS: number;
    readonly width: number;
    readonly height: number;
  }[];
  readonly gif: { readonly url: string; readonly width: number; readonly height: number } | null;
  /** The playground's page, when it is built. */
  readonly playground: string | null;
  /** The SVG the CLI writes for the executive slide, which the playground must write too. */
  readonly slideSvg: string;
  /** The size of the CLI's PNG of the executive slide at scale 2. */
  readonly slidePng: { readonly width: number; readonly height: number };
  readonly ffmpeg: string | null;
  /** Where the playground's downloads are saved. */
  readonly downloads: string;
}

interface Check {
  readonly format: string;
  readonly name: string;
  /** Runs in a fresh page; returns what it saw, throws what went wrong. */
  readonly run: (page: Page, expected: Expected) => Promise<string>;
}

export interface Cell {
  /** `null` when the check could not run, such as without FFmpeg. */
  readonly passed: boolean | null;
  readonly detail: string;
}

export interface BrowserResult {
  readonly name: BrowserName;
  readonly version: string | null;
  /** Why the browser was skipped. */
  readonly skipped?: string;
  readonly cells: readonly Cell[];
}

export interface PdfResult {
  readonly file: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface BrowserReport {
  readonly date: string;
  readonly machine: string;
  readonly capture: string;
  readonly ffmpeg: string;
  readonly checks: readonly { readonly format: string; readonly name: string }[];
  readonly browsers: readonly BrowserResult[];
  readonly pdf: readonly PdfResult[];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Pixels that are drawn: not transparent and not white. Runs in the page. */
const PAINTED = `window.__painted = (source, width, height) => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let painted = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 16 && !(data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245)) painted++;
  }
  return { painted, corner: data[3] };
};`;

interface VideoSeen {
  readonly duration: number;
  readonly width: number;
  readonly height: number;
  readonly frames: readonly { readonly at: number; readonly painted: number }[];
}

/**
 * Loads a video in the page, then seeks to control times and counts the pixels each frame draws.
 * A string, so that the page runs it as written.
 */
const VIDEO = `async (src) => {
  const element = document.createElement("video");
  element.muted = true;
  element.preload = "auto";
  const once = (event) =>
    new Promise((resolve, reject) => {
      element.addEventListener(event, () => resolve(), { once: true });
      element.addEventListener("error", () => reject(new Error("video error " + element.error?.code + ": " + element.error?.message)), { once: true });
    });
  const loaded = once("loadeddata");
  element.src = src;
  document.body.append(element);
  await loaded;
  const frames = [];
  for (const at of [0.5, element.duration / 2, element.duration - 0.2]) {
    const seeked = once("seeked");
    element.currentTime = at;
    await seeked;
    frames.push({ at, painted: window.__painted(element, 480, 270).painted });
  }
  return { duration: element.duration, width: element.videoWidth, height: element.videoHeight, frames };
}`;

async function blank(page: Page, expected: Expected): Promise<void> {
  await page.goto(`${expected.base}${BLANK_PAGE}`);
  await page.evaluate(PAINTED);
}

/** Loads an image in the page; its natural size, the painted pixels and the top left alpha. */
async function image(page: Page, url: string) {
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const w = window as unknown as {
      __painted(s: CanvasImageSource, w: number, h: number): { painted: number; corner: number };
    };
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      ...w.__painted(img, img.naturalWidth, img.naturalHeight),
    };
  }, url);
}

/** The pixels of a screenshot that are drawn. */
function paintedIn(png: Buffer): number {
  const picture = readPng(png);
  let painted = 0;
  const d = picture.pixels;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! > 16 && !(d[i]! > 245 && d[i + 1]! > 245 && d[i + 2]! > 245)) painted++;
  }
  return painted;
}

/** Page errors and requests that leave the server, recorded while a check runs. */
function watch(page: Page, base: string) {
  const errors: string[] = [];
  const outside: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => {
    const url = request.url();
    if (/^(https?|wss?):/.test(url) && !url.startsWith(base)) outside.push(url);
  });
  return { errors, outside };
}

interface PlayerState {
  readonly time: number;
  readonly playing: boolean;
  readonly duration: number | null;
}

const playerState = (page: Page): Promise<PlayerState> =>
  page.evaluate(() => {
    const element = document.querySelector("meltemi-player") as HTMLElement & {
      player: { controller: { time: number; playing: boolean; duration: number | null } };
    };
    const { controller } = element.player;
    return { time: controller.time, playing: controller.playing, duration: controller.duration };
  });

export const CHECKS: readonly Check[] = [
  {
    format: "SVG",
    name: "loads as an image and draws",
    async run(page, expected) {
      await blank(page, expected);
      for (const url of [...expected.svgs, expected.animatedSvg]) {
        const seen = await image(page, url);
        assert(seen.width > 0 && seen.height > 0, `${url} has no size`);
        assert(seen.painted > 100, `${url} draws ${seen.painted} pixels`);
      }
      return `${expected.svgs.length + 1} files`;
    },
  },
  {
    format: "SVG",
    name: "inline in a page, with its fonts",
    async run(page, expected) {
      await blank(page, expected);
      for (const url of expected.svgs) {
        const seen = await page.evaluate(async (src) => {
          const text = await (await fetch(src)).text();
          document.body.innerHTML = `<div id="host" style="display:inline-block">${text}</div>`;
          await document.fonts.ready;
          const svg = document.querySelector("#host svg") as SVGSVGElement;
          const texts = [...svg.querySelectorAll("text")] as SVGTextContentElement[];
          return {
            width: svg.getBoundingClientRect().width,
            texts: texts.length,
            empty: texts.filter(
              (t) => t.textContent!.trim() !== "" && t.getComputedTextLength() <= 0,
            ).length,
            fonts: [...document.fonts].filter((f) => f.status === "loaded").length,
          };
        }, url);
        assert(seen.width > 0, `${url} inline has no width`);
        assert(
          seen.texts > 0 && seen.empty === 0,
          `${url}: ${seen.empty} of ${seen.texts} texts are not laid out`,
        );
        assert(seen.fonts > 0, `${url}: no embedded font loaded`);
        const painted = paintedIn(await page.locator("#host").screenshot());
        assert(painted > 100, `${url} inline draws ${painted} pixels`);
      }
      return `${expected.svgs.length} files`;
    },
  },
  {
    format: "Animated SVG",
    name: "moves on its own, opened as a page",
    async run(page, expected) {
      await page.goto(expected.animatedSvg);
      const animations = await page.evaluate(() => document.getAnimations().length);
      assert(animations > 0, "no running animation");
      const first = await page.screenshot();
      await page.waitForTimeout(450);
      const second = await page.screenshot();
      assert(!first.equals(second), "two screenshots 450 ms apart are the same");
      return animations === 1 ? "1 animation" : `${animations} animations`;
    },
  },
  {
    format: "PNG",
    name: "loads at its size",
    async run(page, expected) {
      await blank(page, expected);
      for (const png of expected.pngs) {
        const seen = await image(page, png.url);
        assert(
          seen.width === png.width && seen.height === png.height,
          `${png.url} is ${seen.width}×${seen.height}, not ${png.width}×${png.height}`,
        );
        assert(seen.painted > 100, `${png.url} draws ${seen.painted} pixels`);
      }
      const slide = expected.pngs.find((p) => p.url.endsWith(KIT_FILES.png))!;
      const corner = (await image(page, slide.url)).corner;
      assert(corner === 0, `the slide's corner has alpha ${corner}, not transparent`);
      return `${expected.pngs.length} files; the slide is ${slide.width}×${slide.height}, transparent`;
    },
  },
  {
    format: "HTML player",
    name: "plays offline, moves forward and answers the keyboard",
    async run(page, expected) {
      const seen = watch(page, expected.base);
      await page.goto(expected.player);
      await page.waitForFunction(() => {
        const element = document.querySelector("meltemi-player") as
          (HTMLElement & { player?: unknown }) | null;
        return element?.player !== undefined;
      });
      const start = await playerState(page);
      assert(start.duration !== null && start.duration > 0, "the player has no duration");
      await page.getByRole("button", { name: "Play" }).click();
      await page.waitForTimeout(600);
      await page.getByRole("button", { name: "Pause" }).click();
      const paused = await playerState(page);
      assert(
        paused.time > 200 && !paused.playing,
        `after 600 ms of play the time is ${paused.time} ms`,
      );
      await page.locator(".frame").focus();
      await page.keyboard.press("End");
      assert((await playerState(page)).time === start.duration, "End does not go to the end");
      await page.keyboard.press("Home");
      assert((await playerState(page)).time === 0, "Home does not go to the start");
      await page.keyboard.press(" ");
      assert((await playerState(page)).playing, "Space does not play");
      await page.keyboard.press("k");
      assert(!(await playerState(page)).playing, "k does not pause");
      assert(seen.errors.length === 0, `errors: ${seen.errors.join("; ")}`);
      assert(seen.outside.length === 0, `requests outside: ${seen.outside.join(", ")}`);
      return `${(start.duration / 1000).toFixed(1)} s story`;
    },
  },
  {
    format: "Catalog",
    name: "opens, navigates and searches offline",
    async run(page, expected) {
      const seen = watch(page, expected.base);
      await page.goto(expected.catalog);
      await page.locator("main h1").waitFor();
      const routes = await page.evaluate(() =>
        [...document.querySelectorAll("nav a")]
          .map((a) => a.getAttribute("href")!)
          .filter((h) => h.startsWith("#/diagram/") || h.startsWith("#/story/")),
      );
      assert(routes.length > 0, "the navigation lists no drawing");
      for (const route of routes) {
        await page.evaluate((h) => {
          location.hash = h;
        }, route);
        await page.waitForFunction(
          () => document.querySelector("#drawing")?.shadowRoot?.querySelector(".frame svg") != null,
          undefined,
          { timeout: 15_000 },
        );
      }
      await page.evaluate(() => {
        location.hash = "#/search?q=orders";
      });
      await page.locator(".results li").first().waitFor();
      const results = await page.locator(".results li").count();
      assert(seen.errors.length === 0, `errors: ${seen.errors.join("; ")}`);
      assert(seen.outside.length === 0, `requests outside: ${seen.outside.join(", ")}`);
      return `${routes.length} drawings, ${results} results for “orders”`;
    },
  },
  ...(["MP4", "WebM"] as const).map((format): Check => ({
    format,
    name: "reports duration and size, draws frames at control times",
    async run(page, expected) {
      const video = expected.videos.find((v) => v.format === format);
      if (!video) throw new Skip("FFmpeg is not installed");
      await blank(page, expected);
      const seen = await page.evaluate<VideoSeen>(`(${VIDEO})(${JSON.stringify(video.url)})`);
      assert(
        Math.abs(seen.duration - video.durationS) < 0.1,
        `duration ${seen.duration} s, not ${video.durationS} s`,
      );
      assert(
        seen.width === video.width && seen.height === video.height,
        `size ${seen.width}×${seen.height}`,
      );
      const blankFrame = seen.frames.find((f) => f.painted < 100);
      assert(!blankFrame, `the frame at ${blankFrame?.at.toFixed(2)} s draws nothing`);
      return `${seen.duration.toFixed(2)} s, ${seen.width}×${seen.height}, ${seen.frames.length} frames`;
    },
  })),
  {
    format: "GIF",
    name: "decodes at its size",
    async run(page, expected) {
      if (!expected.gif) throw new Skip("FFmpeg is not installed");
      await blank(page, expected);
      const seen = await image(page, expected.gif.url);
      assert(
        seen.width === expected.gif.width && seen.height === expected.gif.height,
        `size ${seen.width}×${seen.height}`,
      );
      assert(seen.painted > 100, `draws ${seen.painted} pixels`);
      return `${seen.width}×${seen.height}`;
    },
  },
];

/** A check that cannot run here. */
class Skip extends Error {}

/** Opens the playground on a file of the purchase template. */
async function playgroundOn(page: Page, expected: Expected, file: string): Promise<void> {
  if (!expected.playground) throw new Skip("the playground is not built (pnpm playground:build)");
  await page.goto(expected.playground);
  await page.waitForFunction(
    () => document.querySelector("#app .content svg") !== null,
    undefined,
    {
      timeout: 60_000,
    },
  );
  await page.getByRole("button", { name: "Templates" }).click();
  await page.getByRole("menuitem", { name: /^purchase/ }).click();
  const confirm = page.locator("dialog[open]").getByRole("button", { name: "Open the template" });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.waitForFunction(
    () => document.querySelector(".status-text")?.textContent?.includes("the purchase template"),
    undefined,
    { timeout: 30_000 },
  );
  await page.locator("#file-select").selectOption(file);
  // The analysis of the code on screen.
  await page.waitForFunction(() => {
    const playground = (
      window as unknown as { meltemiPlayground: { studio: { analysis?: { text: string } } } }
    ).meltemiPlayground;
    const text = (document.querySelector(".code-input") as HTMLTextAreaElement).value;
    return playground.studio.analysis?.text === text;
  });
}

/**
 * Exports from the playground's dialog and saves the download; `null` when the browser cannot
 * make the format, which the dialog says within a moment of choosing it.
 */
async function playgroundExport(
  page: Page,
  expected: Expected,
  format: string,
  fields: Record<string, string> = {},
): Promise<string | null> {
  await page.locator(".topbar").getByRole("button", { name: "Export" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel("Format").selectOption(format);
  for (const [label, value] of Object.entries(fields)) {
    await dialog.getByLabel(label, { exact: true }).fill(value);
  }
  const unable = await page
    .waitForFunction(
      () =>
        /no video encoder|cannot encode/.test(
          document.querySelector("dialog[open]")?.textContent ?? "",
        ),
      undefined,
      { timeout: 1500 },
    )
    .then(() => true)
    .catch(() => false);
  if (unable) return null;
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 180_000 }),
    dialog.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  const path = join(expected.downloads, `${Date.now()}-${download.suggestedFilename()}`);
  await download.saveAs(path);
  return path;
}

/** The codec, size, frames and duration of a video, decoded by FFmpeg. */
function videoFacts(ffmpeg: string, file: string) {
  const run = spawnSync(ffmpeg, ["-hide_banner", "-i", file, "-f", "framemd5", "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const stream = /Stream #\d+:\d+[^:]*: Video: (\w+)[^\n]*?, (\d+)x(\d+)/.exec(run.stderr);
  if (run.status !== 0 || !stream) throw new Error(`FFmpeg cannot decode ${file}`);
  return {
    codec: stream[1]!,
    width: Number(stream[2]),
    height: Number(stream[3]),
    frames: run.stdout.split("\n").filter((l) => l !== "" && !l.startsWith("#")).length,
    durationS: (() => {
      const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(run.stderr);
      return d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : NaN;
    })(),
  };
}

/** The playground in each browser: the same exports as the command line, made in the page. */
const PLAYGROUND_CHECKS: readonly Check[] = [
  {
    format: "Playground",
    name: "SVG equal to the command line's",
    async run(page, expected) {
      await playgroundOn(page, expected, "diagrams/executive.meltemi");
      const file = await playgroundExport(page, expected, "svg");
      assert(file, "SVG is not offered");
      assert(readFileSync(file, "utf8") === expected.slideSvg, "the SVG differs from the CLI's");
      return "byte for byte";
    },
  },
  {
    format: "Playground",
    name: "PNG at its scale",
    async run(page, expected) {
      await playgroundOn(page, expected, "diagrams/executive.meltemi");
      // The scale is 2 unless changed. (Typing into the number field is left out: through
      // WebDriver BiDi, Firefox adds the typed text to the value instead of replacing it.)
      const file = await playgroundExport(page, expected, "png");
      assert(file, "PNG is not offered");
      const picture = readPng(readFileSync(file));
      const { width, height } = expected.slidePng;
      assert(
        picture.width === width && picture.height === height,
        `${picture.width}×${picture.height}, not ${width}×${height}`,
      );
      return `${picture.width}×${picture.height}`;
    },
  },
  ...(
    [
      ["gif", "GIF", ["gif"], 960, 540],
      ["webm", "WebM", ["vp9", "vp8"], 1920, 1080],
      ["mp4", "MP4", ["h264"], 1920, 1080],
    ] as const
  ).map(([format, label, codecs, width, height]): Check => ({
    format: "Playground",
    name: `${label} recorded in the page`,
    async run(page, expected) {
      if (!expected.ffmpeg) throw new Skip("FFmpeg is not installed");
      await playgroundOn(page, expected, "stories/purchase.meltemi");
      const file = await playgroundExport(page, expected, format, { Duration: "2s" });
      if (!file) throw new Skip(`this browser cannot encode ${label}`);
      const facts = videoFacts(expected.ffmpeg, file);
      assert((codecs as readonly string[]).includes(facts.codec), `codec ${facts.codec}`);
      assert(
        facts.width === width && facts.height === height,
        `size ${facts.width}×${facts.height}`,
      );
      if (format === "gif") {
        // The GIF writer lets a frame last longer instead of repeating it unchanged: at most 30
        // frames (15 per second), over the two seconds.
        assert(facts.frames > 1 && facts.frames <= 30, `${facts.frames} frames`);
        assert(Math.abs(facts.durationS - 2) < 0.05, `${facts.durationS} s, not 2 s`);
      } else assert(facts.frames === 60, `${facts.frames} frames, not 60`);
      return `${facts.codec}, ${facts.width}×${facts.height}, ${facts.frames} frames over ${facts.durationS.toFixed(2)} s`;
    },
  })),
];

/** Every check, in the order of the report. */
export const ALL_CHECKS: readonly Check[] = [...CHECKS, ...PLAYGROUND_CHECKS];

/** The duration of a video in seconds, as FFmpeg reads it. */
function videoDuration(ffmpeg: string, file: string): number {
  let out = "";
  try {
    execFileSync(ffmpeg, ["-hide_banner", "-i", file], { encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    // Without an output FFmpeg exits with an error after describing the input.
    out = String((error as { stderr?: string }).stderr ?? "");
  }
  const match = /Duration: (\d+):(\d+):([\d.]+)/.exec(out);
  if (!match) throw new Error(`FFmpeg reads no duration in ${file}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

const gifSize = (bytes: Buffer) => ({
  width: bytes.readUInt16LE(6),
  height: bytes.readUInt16LE(8),
});

/** The SVG's width over its height, from its `viewBox`. */
function svgRatio(file: string): number {
  const box = /viewBox="([\d.-]+) ([\d.-]+) ([\d.]+) ([\d.]+)"/.exec(readFileSync(file, "utf8"));
  if (!box) throw new Error(`${file} has no viewBox`);
  return Number(box[3]) / Number(box[4]);
}

const list = (folder: string, extension: string) =>
  readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(extension))
    .map((e) => join(e.parentPath, e.name))
    .sort();

/** The PDFs, read from their files: one page at the drawing's proportions, fonts, text and links. */
function checkPdfs(pairs: readonly { pdf: string; svg: string }[], root: string): PdfResult[] {
  return pairs.map(({ pdf, svg }) => {
    const facts = pdfFacts(readFileSync(pdf));
    const problems: string[] = [];
    if (facts.pages !== 1) problems.push(`${facts.pages} pages`);
    const ratio = facts.size ? facts.size.width / facts.size.height : 0;
    if (Math.abs(ratio / svgRatio(svg) - 1) > 0.01)
      problems.push(`page ratio ${ratio.toFixed(3)}, drawing ${svgRatio(svg).toFixed(3)}`);
    if (facts.embeddedFonts === 0) problems.push("no embedded font");
    if (facts.textOperators === 0 || facts.unicodeMaps === 0) problems.push("no extractable text");
    if (facts.links === 0) problems.push("no link annotation");
    const size = facts.size
      ? `${facts.size.width.toFixed(1)} × ${facts.size.height.toFixed(1)} pt`
      : "no size";
    return {
      file: relative(root, pdf).replaceAll("\\", "/"),
      passed: problems.length === 0,
      detail:
        problems.length > 0
          ? problems.join("; ")
          : `${size}, ${facts.embeddedFonts} fonts, ${facts.textOperators} text runs, ${facts.links} link`,
    };
  });
}

async function launch(kind: BrowserKind): Promise<Browser | string> {
  const path = kind.paths.find((p) => p && existsSync(p));
  if (!path) return "not installed";
  const start = () =>
    kind.engine === "firefox"
      ? firefox.launch({ channel: "moz-firefox", executablePath: path, headless: true })
      : chromium.launch({ executablePath: path, headless: true });
  try {
    // A browser that is still closing from an earlier run can refuse the first start.
    return await start().catch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return start();
    });
  } catch (error) {
    const lines = (error as Error).message.split("\n").filter((l) => l.trim() !== "");
    return `cannot be driven: ${lines.slice(0, 4).join(" ")}`;
  }
}

export interface BrowserRunOptions {
  /** Only these browsers; the others are left out of the report. */
  readonly only?: readonly BrowserName[];
}

export async function runBrowsers(options: BrowserRunOptions = {}): Promise<BrowserReport> {
  const scratch = join(tmpdir(), `meltemi-browsers-${process.pid}`);
  rmSync(scratch, { recursive: true, force: true });
  const site = join(scratch, "site");
  mkdirSync(site, { recursive: true });
  const ffmpeg = findFfmpeg();
  try {
    // The exports: the kit, every diagram of the project as SVG, PNG and PDF, the animated slide and
    // the catalog.
    const kit = writeKit(join(site, "kit"), join(scratch, "work"));
    mdg("export", kit.project, "--out", join(site, "svg"));
    mdg("export", kit.project, "--format", "png", "--out", join(site, "png"));
    mdg("export", kit.project, "--format", "pdf", "--link", KIT_LINK, "--out", join(site, "pdf"));
    const slide = join(kit.project, "diagrams", "executive.meltemi");
    mdg("export", slide, "--motion", "animated", "--out", join(site, "animated.svg"));
    mdg("build", "catalog", kit.project, "--out", join(site, "catalog"));
    // The playground, served from the same origin when it is built.
    const playgroundDist = join(REPO_ROOT, "packages", "playground", "dist");
    const hasPlayground = existsSync(join(playgroundDist, "index.html"));
    if (hasPlayground) cpSync(playgroundDist, join(site, "playground"), { recursive: true });
    const downloads = join(scratch, "downloads");
    mkdirSync(downloads, { recursive: true });

    const server = await serveFolder(site);
    const url = (file: string) => `${server.base}/${relative(site, file).replaceAll("\\", "/")}`;
    const kitFile = (name: string) => join(site, "kit", name);
    const svgs = [...list(join(site, "svg"), ".svg"), kitFile(KIT_FILES.svg)];
    const pngs = [...list(join(site, "png"), ".png"), kitFile(KIT_FILES.png)];
    const videos = ffmpeg
      ? (["mp4", "webm"] as const).map((format) => {
          const file = kitFile(KIT_FILES[format]);
          return {
            url: url(file),
            format: format === "mp4" ? "MP4" : "WebM",
            durationS: videoDuration(ffmpeg, file),
            width: 1920,
            height: 1080,
          };
        })
      : [];
    const expected: Expected = {
      base: server.base,
      svgs: svgs.map(url),
      animatedSvg: url(join(site, "animated.svg")),
      pngs: pngs.map((file) => {
        const picture = readPng(readFileSync(file));
        return { url: url(file), width: picture.width, height: picture.height };
      }),
      player: url(kitFile(KIT_FILES.html)),
      catalog: url(join(site, "catalog", "index.html")),
      videos,
      gif: ffmpeg
        ? { url: url(kitFile(KIT_FILES.gif)), ...gifSize(readFileSync(kitFile(KIT_FILES.gif))) }
        : null,
      playground: hasPlayground ? url(join(site, "playground", "index.html")) : null,
      slideSvg: readFileSync(join(site, "svg", "diagrams", "executive.svg"), "utf8"),
      slidePng: readPng(readFileSync(join(site, "png", "diagrams", "executive.png"))),
      ffmpeg,
      downloads,
    };
    const pdfPairs = [
      ...list(join(site, "pdf"), ".pdf").map((pdf) => ({
        pdf,
        svg: join(site, "svg", relative(join(site, "pdf"), pdf).replace(/\.pdf$/, ".svg")),
      })),
      { pdf: kitFile(KIT_FILES.pdf), svg: kitFile(KIT_FILES.svg) },
    ];
    const pdf = checkPdfs(pdfPairs, site);

    const browsers: BrowserResult[] = [];
    try {
      for (const kind of BROWSERS.filter((b) => !options.only || options.only.includes(b.name))) {
        const browser = await launch(kind);
        if (typeof browser === "string") {
          browsers.push({ name: kind.name, version: null, skipped: browser, cells: [] });
          continue;
        }
        const cells: Cell[] = [];
        try {
          for (const check of ALL_CHECKS) {
            // English names drive the pages, whatever the machine's language.
            const context = await browser.newContext({
              viewport: { width: 1440, height: 900 },
              locale: "en-US",
            });
            const page = await context.newPage();
            try {
              cells.push({ passed: true, detail: await check.run(page, expected) });
            } catch (error) {
              const message = (error as Error).message.split("\n")[0]!;
              cells.push(
                error instanceof Skip
                  ? { passed: null, detail: message }
                  : { passed: false, detail: message },
              );
            } finally {
              await context.close();
            }
          }
          browsers.push({ name: kind.name, version: browser.version(), cells });
        } finally {
          await browser.close();
        }
      }
    } finally {
      await server.close();
    }
    const ffmpegVersion = ffmpeg
      ? execFileSync(ffmpeg, ["-version"], { encoding: "utf8" })
          .split("\n")[0]!
          .replace(/ Copyright.*/, "")
      : "none";
    return {
      date: new Date().toISOString().slice(0, 10),
      machine: machine(),
      capture: kit.browser,
      ffmpeg: ffmpegVersion,
      checks: ALL_CHECKS.map((c) => ({ format: c.format, name: c.name })),
      browsers,
      pdf,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const mark = (cell: Cell | undefined) =>
  !cell ? "—" : cell.passed === null ? "skipped" : cell.passed ? "✓" : "✗";

/** The report as Markdown: one row per format and check, one column per browser and version. */
export function browsersMarkdown(report: BrowserReport): string {
  const head = report.browsers.map((b) =>
    b.version ? `${b.name} ${b.version}` : `${b.name} (${b.skipped})`,
  );
  const rows = report.checks.map(
    (check, i) =>
      `| ${check.format} | ${check.name} | ${report.browsers.map((b) => mark(b.cells[i])).join(" | ")} |`,
  );
  const pdfPassed = report.pdf.every((p) => p.passed);
  rows.push(
    `| PDF | page size, embedded fonts, extractable text, link (read from the file) | ${report.browsers.map(() => (pdfPassed ? "✓" : "✗")).join(" | ")} |`,
  );
  const details = report.checks.flatMap((check, i) =>
    report.browsers
      .filter((b) => b.cells[i])
      .map(
        (b) =>
          `| ${check.format}, ${check.name} | ${b.name} | ${mark(b.cells[i])} | ${b.cells[i]!.detail} |`,
      ),
  );
  return [
    "# Browser verification",
    "",
    "Generated by `pnpm verification:browsers`. The purchase reference example is exported in every",
    "format and each file is opened in Edge, Chrome and Firefox (Firefox through WebDriver BiDi),",
    "served from 127.0.0.1 with no other address reachable. PDF is read from the file: its page,",
    "fonts, text and links are the same whatever opens it. The office applications are checked by",
    "hand: see [office-apps.md](office-apps.md).",
    "",
    `Run on ${report.date}: ${report.machine}. Captures by ${report.capture}; ${report.ffmpeg}.`,
    "",
    `| Format | Check | ${head.join(" | ")} |`,
    `| --- | --- | ${head.map(() => ":---:").join(" | ")} |`,
    ...rows,
    "",
    "## What each browser saw",
    "",
    "| Check | Browser | Result | Detail |",
    "| --- | --- | :---: | --- |",
    ...details,
    "",
    "## PDF files",
    "",
    "| File | Result | Detail |",
    "| --- | :---: | --- |",
    ...report.pdf.map((p) => `| ${p.file} | ${p.passed ? "✓" : "✗"} | ${p.detail} |`),
    "",
  ].join("\n");
}

export const BROWSERS_DOC = join(REPO_ROOT, "docs", "verification", "browsers.md");

/** Whether every check that ran passed. */
export const browsersPassed = (report: BrowserReport) =>
  report.pdf.every((p) => p.passed) &&
  report.browsers.every((b) => b.cells.every((c) => c.passed !== false));

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // `--only Firefox` checks one browser and leaves the recorded matrix alone.
  const at = process.argv.indexOf("--only");
  const only = at > 0 ? (process.argv[at + 1]?.split(",") as BrowserName[]) : undefined;
  const report = await runBrowsers({ only });
  for (const b of report.browsers) {
    console.log(`${b.name} ${b.version ?? `skipped: ${b.skipped}`}`);
    b.cells.forEach((cell, i) =>
      console.log(
        `  ${mark(cell)} ${report.checks[i]!.format}, ${report.checks[i]!.name}: ${cell.detail}`,
      ),
    );
  }
  for (const p of report.pdf) console.log(`  ${p.passed ? "✓" : "✗"} PDF ${p.file}: ${p.detail}`);
  if (!only) {
    await writeMarkdown(BROWSERS_DOC, browsersMarkdown(report));
    console.log(`\nWrote ${relative(REPO_ROOT, BROWSERS_DOC)}`);
  }
  if (!browsersPassed(report)) process.exitCode = 1;
}
