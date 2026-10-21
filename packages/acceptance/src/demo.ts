// The editing demo: the playground driven through a short session (code typed, a box dragged, a
// connector bent, a label renamed, undo and redo, an SVG export), each step captioned and checked,
// recorded frame by frame and encoded by the installed FFmpeg.
// Usage: pnpm demo   (writes docs/media/editing-demo.mp4 and docs/media/editing-demo.gif)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import { findFfmpeg } from "@meltemi/diagrams-capture";
import { browserPath } from "../../vscode/scripts/browser.mjs";
import { REPO_ROOT } from "./corpus.js";
import { serveFolder } from "./serve.js";

export const MEDIA = join(REPO_ROOT, "docs", "media");
export const DEMO_MP4 = join(MEDIA, "editing-demo.mp4");
export const DEMO_GIF = join(MEDIA, "editing-demo.gif");
const VIEWPORT = { width: 1440, height: 810 };

/** A step that did not do what the demo shows. */
class DemoError extends Error {}

interface Frame {
  readonly path: string;
  readonly ms: number;
}

class Recorder {
  readonly frames: Frame[] = [];
  private cursor = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };

  constructor(
    readonly page: Page,
    readonly folder: string,
  ) {}

  /** A frame of the page as it is, shown for `ms`. */
  async shot(ms = 100): Promise<void> {
    const path = join(this.folder, `${String(this.frames.length).padStart(5, "0")}.png`);
    await this.page.screenshot({ path });
    this.frames.push({ path, ms });
  }

  /** The caption bar and the drawn pointer, which headless screenshots do not show. */
  async caption(text: string): Promise<void> {
    await this.page.evaluate(
      ([caption, x, y]) => {
        let bar = document.getElementById("demo-caption");
        if (!bar) {
          bar = document.createElement("div");
          bar.id = "demo-caption";
          Object.assign(bar.style, {
            position: "fixed",
            left: "50%",
            bottom: "18px",
            transform: "translateX(-50%)",
            padding: "10px 18px",
            borderRadius: "10px",
            background: "rgba(11, 24, 48, 0.88)",
            color: "#ffffff",
            font: "600 17px/1.3 system-ui, sans-serif",
            zIndex: "2147483647",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          });
          document.body.append(bar);
          const pointer = document.createElement("div");
          pointer.id = "demo-pointer";
          Object.assign(pointer.style, {
            position: "fixed",
            width: "18px",
            height: "18px",
            marginLeft: "-9px",
            marginTop: "-9px",
            borderRadius: "50%",
            background: "rgba(233, 84, 32, 0.55)",
            border: "2px solid #ffffff",
            boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.35)",
            zIndex: "2147483647",
            pointerEvents: "none",
          });
          document.body.append(pointer);
        }
        bar.textContent = caption as string;
        const pointer = document.getElementById("demo-pointer")!;
        pointer.style.left = `${x as number}px`;
        pointer.style.top = `${y as number}px`;
      },
      [text, this.cursor.x, this.cursor.y] as const,
    );
  }

  private async pointer(): Promise<void> {
    await this.page.evaluate(
      ([x, y]) => {
        const pointer = document.getElementById("demo-pointer");
        if (pointer) {
          pointer.style.left = `${x}px`;
          pointer.style.top = `${y}px`;
        }
      },
      [this.cursor.x, this.cursor.y] as const,
    );
  }

  /** Moves the pointer in visible steps, recording each. */
  async move(x: number, y: number, steps = 8): Promise<void> {
    const from = this.cursor;
    for (let i = 1; i <= steps; i++) {
      this.cursor = {
        x: from.x + ((x - from.x) * i) / steps,
        y: from.y + ((y - from.y) * i) / steps,
      };
      await this.page.mouse.move(this.cursor.x, this.cursor.y);
      await this.pointer();
      await this.shot(60);
    }
  }

  /** Drags from where the pointer is to a point, recording the drag. */
  async drag(x: number, y: number, steps = 12): Promise<void> {
    await this.page.mouse.down();
    await this.move(x, y, steps);
    await this.page.mouse.up();
  }

  async click(x: number, y: number): Promise<void> {
    await this.move(x, y);
    await this.page.mouse.click(x, y);
    await this.shot(200);
  }

  /** Types text into the focused field a few characters per frame. */
  async type(text: string): Promise<void> {
    for (let i = 0; i < text.length; i += 2) {
      await this.page.keyboard.type(text.slice(i, i + 2));
      await this.shot(70);
    }
  }
}

const code = (page: Page) => page.locator(".code-input").inputValue();

/** Waits until the analysis has caught up with the text and the canvas has drawn it. */
async function analysed(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const playground = (
      window as unknown as { meltemiPlayground: { studio: { analysis?: { text: string } } } }
    ).meltemiPlayground;
    const text = (document.querySelector(".code-input") as HTMLTextAreaElement).value;
    return playground.studio.analysis?.text === text;
  });
  await page.waitForTimeout(150);
}

/** Waits for the code to satisfy a check, or fails the step. */
async function expectCode(
  page: Page,
  step: string,
  test: (text: string) => boolean,
): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (test(await code(page))) {
      await analysed(page);
      return;
    }
    await page.waitForTimeout(100);
  }
  throw new DemoError(`Step "${step}": the code did not change as the demo shows.`);
}

/** The centre of an element or relation drawn on the canvas, in page coordinates. */
async function centre(
  page: Page,
  id: string,
  role: "element" | "relation",
): Promise<{ x: number; y: number }> {
  const box = await page
    .locator(`#app .content g[data-id="${id}"][data-role="${role}"]`)
    .first()
    .boundingBox();
  if (!box) throw new DemoError(`\`${id}\` is not on the canvas.`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Fits the diagram in the canvas. */
async function fit(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Fit the diagram" }).click();
  await page.waitForTimeout(200);
}

/** Plays the script in the page, recording frames into `folder`. */
export async function playDemo(page: Page, folder: string): Promise<Frame[]> {
  const r = new Recorder(page, folder);

  // 1. The flow template: code on the left, canvas on the right, without the minimap.
  await page.getByRole("button", { name: "Show the minimap" }).click();
  await fit(page);
  await r.caption("A diagram is a text file: the code, and the canvas that draws it");
  await r.shot(2600);

  // 2. Typing in the code.
  await r.caption("Type in the code, and the canvas follows");
  const text = await code(page);
  const line = 'api -> db: "Reads and writes" as store';
  const at = text.indexOf(line);
  if (at < 0) throw new DemoError("The flow template has changed; update the demo's script.");
  await page.locator(".code-input").evaluate((area: HTMLTextAreaElement, end) => {
    area.focus();
    area.setSelectionRange(end, end);
  }, at + line.length);
  await r.shot(500);
  await page.keyboard.press("Enter");
  await r.type('cache[("Cache")]');
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  await r.type('api -> cache: "Reads first" as read');
  await page.keyboard.press("Escape");
  await expectCode(page, "type", (t) => t.includes('cache[("Cache")]') && t.includes("as read"));
  await page.locator('#app .content g[data-id="cache"][data-role="element"]').first().waitFor();
  await fit(page);
  await r.shot(1800);

  // 3. Dragging a box writes its position.
  await r.caption("Drag a box: the code gains its position, and nothing else moves");
  // Under the API, so that its connector runs straight down.
  const cache = await centre(page, "cache", "element");
  const api = await centre(page, "api", "element");
  await r.move(cache.x, cache.y, 10);
  await r.drag(api.x, cache.y + 60, 14);
  await expectCode(
    page,
    "drag",
    (t) => /place cache at \(/.test(t) && t.includes("layout assisted"),
  );
  await r.shot(2000);

  // 4. A property of the diagram from the inspector.
  await r.caption("Choose orthogonal connectors in the inspector: one line is added");
  await fit(page);
  const canvas = (await page.locator("#app").boundingBox())!;
  await r.click(canvas.x + 40, canvas.y + canvas.height - 60);
  const routing = page.locator("#mdg-field-routing");
  await routing.waitFor({ timeout: 5000 });
  const g = (await routing.boundingBox())!;
  await r.move(g.x + g.width / 2, g.y + g.height / 2, 8);
  await routing.selectOption("orthogonal");
  await expectCode(page, "routing", (t) => t.includes("routing orthogonal"));
  await r.shot(1800);

  // 5. Bending a connector writes its route.
  await r.caption("Bend a connector: the code gains its route");
  const request = await centre(page, "request", "relation");
  await r.click(request.x, request.y);
  const handle = page.locator('#app circle.handle.segment[data-id="request"]').first();
  await handle.waitFor({ timeout: 5000 }).catch(() => {
    throw new DemoError('Step "route": the connector shows no handle to bend.');
  });
  const h = (await handle.boundingBox())!;
  await r.move(h.x + h.width / 2, h.y + h.height / 2, 6);
  await r.drag(h.x + h.width / 2, h.y + h.height / 2 + 70, 12);
  await expectCode(page, "route", (t) => /route request from .* via \[/.test(t));
  await r.shot(2000);

  // 6. Renaming a label in the inspector changes one string.
  await r.caption("Rename a label in the inspector: one string changes in the code");
  const store = await centre(page, "store", "relation");
  await r.click(store.x, store.y);
  const field = page.locator("#mdg-field-label");
  await field.waitFor({ timeout: 5000 });
  const f = (await field.boundingBox())!;
  await r.click(f.x + f.width / 2, f.y + f.height / 2);
  await field.fill("");
  await r.shot(300);
  await r.type("Reads and writes rows");
  await field.press("Enter");
  await expectCode(page, "label", (t) => t.includes('"Reads and writes rows" as store'));
  await r.shot(2000);

  // 7. One history for the code and the canvas.
  await r.caption("One history for code and canvas: undo, then redo");
  const empty = await page.locator("#app").boundingBox();
  await r.click(empty!.x + 30, empty!.y + empty!.height - 40);
  await page.keyboard.press("Control+z");
  await expectCode(page, "undo", (t) => t.includes('"Reads and writes" as store'));
  await r.shot(1500);
  await page.keyboard.press("Control+Shift+z");
  await expectCode(page, "redo", (t) => t.includes('"Reads and writes rows" as store'));
  await r.shot(1500);

  // 8. Exporting.
  await r.caption("Export: the same SVG, PNG, PDF and video the command line writes");
  const button = page.locator(".topbar").getByRole("button", { name: "Export" });
  const b = (await button.boundingBox())!;
  await r.click(b.x + b.width / 2, b.y + b.height / 2);
  const dialog = page.locator("dialog[open]");
  await dialog.waitFor();
  await r.shot(1200);
  const confirm = dialog.getByRole("button", { name: "Export", exact: true });
  const c = (await confirm.boundingBox())!;
  await r.move(c.x + c.width / 2, c.y + c.height / 2, 8);
  const [download] = await Promise.all([page.waitForEvent("download"), confirm.click()]);
  await download.path();
  await r.shot(400);
  await r.caption("Meltemi Diagrams: diagrams as code, with a canvas");
  await r.shot(2600);
  return r.frames;
}

/** Encodes the frames into an MP4 and a GIF with FFmpeg. */
function encode(ffmpeg: string, frames: readonly Frame[], folder: string): void {
  const list = frames.flatMap((f) => [
    `file '${f.path.replaceAll("\\", "/")}'`,
    `duration ${(f.ms / 1000).toFixed(3)}`,
  ]);
  // The concat demuxer needs the last file once more to keep its duration.
  list.push(`file '${frames.at(-1)!.path.replaceAll("\\", "/")}'`);
  const listFile = join(folder, "frames.txt");
  writeFileSync(listFile, `${list.join("\n")}\n`);
  mkdirSync(MEDIA, { recursive: true });
  const run = (args: string[]) => {
    const result = spawnSync(
      ffmpeg,
      ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listFile, ...args],
      {
        encoding: "utf8",
      },
    );
    if (result.status !== 0) throw new Error(`FFmpeg failed: ${result.stderr}`);
  };
  run([
    "-vf",
    "fps=12,format=yuv420p",
    "-c:v",
    "libx264",
    "-crf",
    "24",
    "-movflags",
    "+faststart",
    DEMO_MP4,
  ]);
  run([
    "-vf",
    "fps=8,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
    DEMO_GIF,
  ]);
}

export async function recordDemo(): Promise<{ frames: number; seconds: number }> {
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) throw new Error("The demo is encoded by FFmpeg, which is not installed.");
  const dist = join(REPO_ROOT, "packages", "playground", "dist");
  if (!existsSync(join(dist, "index.html")))
    throw new Error("Build the playground first: pnpm playground:build.");
  const folder = join(tmpdir(), `meltemi-demo-${process.pid}`);
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  const server = await serveFolder(dist);
  const browser = await chromium.launch({ executablePath: browserPath(), headless: true });
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      acceptDownloads: true,
      colorScheme: "light",
      // The demo clicks controls by their English names, whatever the machine's language.
      locale: "en-US",
    });
    const page = await context.newPage();
    await page.goto(`${server.base}/index.html`);
    await page.waitForFunction(
      () => "meltemiPlayground" in window && document.querySelector("#app .content svg") !== null,
      undefined,
      { timeout: 30_000 },
    );
    await analysed(page);
    const frames = await playDemo(page, folder);
    encode(ffmpeg, frames, folder);
    return { frames: frames.length, seconds: frames.reduce((n, f) => n + f.ms, 0) / 1000 };
  } finally {
    await browser.close();
    await server.close();
    rmSync(folder, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = await recordDemo();
    for (const file of [DEMO_MP4, DEMO_GIF]) {
      console.log(
        `  ${file.slice(REPO_ROOT.length + 1).replaceAll("\\", "/")} (${(statSync(file).size / 1024).toFixed(0)} KB)`,
      );
    }
    console.log(`\nRecorded ${result.frames} frames, ${result.seconds.toFixed(1)} s.`);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
