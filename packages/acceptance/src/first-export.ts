// First export from a template: the machine time of `init`, `validate` and the export of SVG, PNG,
// PDF and MP4 for each template, and the playground from opening to the downloaded SVG.
// Usage: tsx --conditions=@meltemi/diagrams-source packages/acceptance/src/first-export.ts
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { TEMPLATES, type TemplateName } from "@meltemi/diagrams-project";
import { browserPath } from "../../vscode/scripts/browser.mjs";
import { REPO_ROOT } from "./corpus.js";
import { mdg } from "./cli.js";
import { serveFolder } from "./serve.js";
import { TARGETS } from "./timing.js";

export interface FirstExport {
  readonly path: string;
  readonly steps: readonly { readonly step: string; readonly ms: number }[];
  readonly totalMs: number;
  readonly passed: boolean;
}

function timed<T>(steps: { step: string; ms: number }[], step: string, fn: () => T): T {
  const start = performance.now();
  const result = fn();
  steps.push({ step, ms: performance.now() - start });
  return result;
}

/** The CLI path for one template, in a scratch folder. */
function cliPath(template: TemplateName, scratch: string): FirstExport {
  const folder = join(scratch, template);
  const steps: { step: string; ms: number }[] = [];
  timed(steps, "init", () => mdg("init", folder, "--template", template));
  timed(steps, "validate", () => mdg("validate", folder));
  const diagrams = join(folder, "diagrams");
  const first = readdirSync(diagrams)
    .filter((f) => f.endsWith(".meltemi"))
    .sort()[0]!;
  const file = join(diagrams, first);
  const out = join(scratch, `${template}-out`);
  mkdirSync(out, { recursive: true });
  timed(steps, "export SVG", () => mdg("export", file, "--out", out));
  timed(steps, "export PNG", () => mdg("export", file, "--format", "png", "--out", out));
  timed(steps, "export PDF", () => mdg("export", file, "--format", "pdf", "--out", out));
  timed(steps, "export MP4", () =>
    mdg("export", file, "--format", "mp4", "--duration", "2s", "--out", out),
  );
  const totalMs = steps.reduce((n, s) => n + s.ms, 0);
  return {
    path: `CLI, ${template} template`,
    steps,
    totalMs,
    passed: totalMs < TARGETS.firstExport,
  };
}

/** The playground: from opening the page to the downloaded SVG of the first template. */
async function playgroundPath(): Promise<FirstExport | undefined> {
  const dist = join(REPO_ROOT, "packages", "playground", "dist");
  if (!existsSync(join(dist, "index.html"))) return undefined;
  const server = await serveFolder(dist);
  const browser = await chromium.launch({ executablePath: browserPath(), headless: true });
  const steps: { step: string; ms: number }[] = [];
  try {
    const page = await browser.newPage({
      acceptDownloads: true,
      viewport: { width: 1440, height: 900 },
      // The steps find controls by their English names, whatever the machine's language.
      locale: "en-US",
    });
    let start = performance.now();
    await page.goto(`${server.base}/index.html`);
    await page.waitForFunction(
      () => document.querySelector("#app .content svg") !== null,
      undefined,
      { timeout: 60_000 },
    );
    steps.push({ step: "open the page and draw the template", ms: performance.now() - start });
    start = performance.now();
    await page.locator(".topbar").getByRole("button", { name: "Export" }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("dialog[open]").getByRole("button", { name: "Export", exact: true }).click(),
    ]);
    await download.path();
    steps.push({ step: "export the SVG", ms: performance.now() - start });
  } finally {
    await browser.close();
    await server.close();
  }
  const totalMs = steps.reduce((n, s) => n + s.ms, 0);
  return {
    path: "playground, flow template",
    steps,
    totalMs,
    passed: totalMs < TARGETS.firstExport,
  };
}

export async function runFirstExport(): Promise<FirstExport[]> {
  const scratch = join(tmpdir(), `meltemi-first-export-${process.pid}`);
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  try {
    const out = (Object.keys(TEMPLATES) as TemplateName[]).map((t) => cliPath(t, scratch));
    const playground = await playgroundPath();
    if (playground) out.push(playground);
    return out;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const results = await runFirstExport();
  for (const r of results) {
    console.log(`  ${r.passed ? "✓" : "✗"} ${r.path}: ${(r.totalMs / 1000).toFixed(1)} s`);
    for (const s of r.steps) console.log(`      ${s.step}: ${(s.ms / 1000).toFixed(2)} s`);
  }
  if (results.some((r) => !r.passed)) process.exitCode = 1;
}
