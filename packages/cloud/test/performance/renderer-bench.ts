/**
 * Measures the renderer object under `wrangler dev` (task 3.3 of the change `agent-mcp`): the
 * cold start of an object (its first drawing, which imports the engine, the fonts, the icons, ELK
 * and resvg), and the time of the acceptance corpus's costliest diagram (`flow/thirty`, thirty
 * elements laid out by ELK) to SVG and to PNG at 1280 and 2048 pixels, of a tall diagram that fills
 * the pixel budget at 2048 (`sequence/thirty`), and of an answer from the cache. It runs the service's own `ProjectRenderer` in `renderer-worker.ts`, configured from
 * `wrangler.jsonc` (its rules and aliases) in a temporary folder, with nothing but the renderer's
 * binding; `wrangler dev` is started `--starts` times, so each start measures a cold isolate.
 *
 *   pnpm cloud:bench-renderer [--starts 3] [--runs 15] [--json <file>]
 *
 * The times are the wall time of each request from this process, on this laptop: the drawing is
 * synchronous work in one isolate, so its CPU time is at most that wall time less the request's own
 * cost (the `ping` and `stats` rows). Nothing is sent anywhere but to the local Worker.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { cpus, tmpdir, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CLOUD, freePort, parseJsonc } from "../browser/worker.js";

const REPO = resolve(CLOUD, "..", "..");
const ACCEPTANCE = join(REPO, "corpus", "acceptance");
/** The corpus's costliest diagram to draw: thirty elements laid out by ELK. */
const SHEET = { files: folderFiles(join(ACCEPTANCE, "flow")), file: "thirty.meltemi" };
/** A tall one, which fills the pixel budget at 2048 (the costliest PNG a preview draws). */
const TALL = { files: folderFiles(join(ACCEPTANCE, "sequence")), file: "thirty.meltemi" };

function folderFiles(folder: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(folder)
      .filter((name) => name.endsWith(".meltemi"))
      .map((name) => [name, readFileSync(join(folder, name), "utf8")]),
  );
}

const { values } = parseArgs({
  options: {
    starts: { type: "string", default: "3" },
    runs: { type: "string", default: "15" },
    json: { type: "string" },
  },
});
const STARTS = Number(values.starts);
const RUNS = Number(values.runs);

/** The measurement Worker's configuration: the renderer's binding, rules and aliases only. */
function benchConfig(): Record<string, unknown> {
  const deployed = parseJsonc(readFileSync(join(CLOUD, "wrangler.jsonc"), "utf8"));
  const alias = Object.fromEntries(
    Object.entries(deployed["alias"] as Record<string, string>).map(([name, path]) => [
      name,
      resolve(CLOUD, path),
    ]),
  );
  return {
    name: "meltemi-diagrams-renderer-bench",
    main: join(CLOUD, "test", "performance", "renderer-worker.ts"),
    compatibility_date: deployed["compatibility_date"],
    rules: deployed["rules"],
    alias,
    durable_objects: { bindings: [{ name: "RENDERERS", class_name: "ProjectRenderer" }] },
    migrations: [{ tag: "v1", new_sqlite_classes: ["ProjectRenderer"] }],
  };
}

function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

interface Running {
  readonly origin: string;
  stop(): Promise<void>;
}

/** `wrangler dev` of the measurement Worker in a new folder, until `/ping` answers. */
async function start(folder: string): Promise<Running> {
  const config = join(folder, "wrangler.bench.json");
  writeFileSync(config, `${JSON.stringify(benchConfig(), null, 2)}\n`);
  const port = await freePort();
  const inspector = await freePort();
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of Object.keys(env)) if (/^(CLOUDFLARE|CF)_/.test(name)) delete env[name];
  Object.assign(env, {
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_SEND_ERROR_REPORTS: "false",
    WRANGLER_HIDE_BANNER: "true",
    CLOUDFLARE_CF_FETCH_ENABLED: "false",
    WRANGLER_LOG_PATH: join(folder, "logs"),
    WRANGLER_REGISTRY_PATH: join(folder, "registry"),
    NO_COLOR: "1",
    CI: "1",
  });
  const script = join(CLOUD, "node_modules", "wrangler", "bin", "wrangler.js");
  const child = spawn(
    process.execPath,
    [
      script,
      "dev",
      "--config",
      config,
      "--persist-to",
      join(folder, "state"),
      "--port",
      String(port),
      "--inspector-port",
      String(inspector),
    ],
    { cwd: folder, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  let log = "";
  child.stdout?.on("data", (chunk: Buffer) => (log += chunk.toString("utf8")));
  child.stderr?.on("data", (chunk: Buffer) => (log += chunk.toString("utf8")));
  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 180_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`wrangler dev ended:\n${log}`);
    if (Date.now() > deadline) {
      killTree(child);
      throw new Error(`wrangler dev did not answer:\n${log}`);
    }
    // Waiting for wrangler's word rather than asking: the first request is one the run measures.
    if (/Ready on/i.test(log)) break;
    await new Promise((done) => setTimeout(done, 200));
  }
  return {
    origin,
    stop: async () => {
      killTree(child);
      await new Promise((done) => setTimeout(done, 500));
    },
  };
}

async function timed<T>(run: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const begun = performance.now();
  const value = await run();
  return { ms: performance.now() - begun, value };
}

interface Answer {
  readonly cached: boolean;
  readonly size: number;
  readonly report: { readonly width: number; readonly height: number };
}

async function render(
  origin: string,
  object: string,
  revision: number,
  format: "svg" | "png",
  width?: number,
  sheet: { files: Record<string, string>; file: string } = SHEET,
): Promise<Answer> {
  const response = await fetch(`${origin}/render?object=${object}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      revision,
      files: sheet.files,
      file: sheet.file,
      format,
      ...(width ? { width } : {}),
    }),
  });
  if (!response.ok) throw new Error(`render: ${response.status} ${await response.text()}`);
  return (await response.json()) as Answer;
}

const median = (list: readonly number[]) => {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};
const p95 = (list: readonly number[]) => {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!;
};

const samples: Record<string, number[]> = {};
const add = (name: string, ms: number) => (samples[name] ??= []).push(ms);
const sizes: Record<string, string> = {};

async function main(): Promise<void> {
  for (let s = 0; s < STARTS; s++) {
    const folder = mkdtempSync(join(tmpdir(), "mdg-renderer-bench-"));
    mkdirSync(join(folder, "state"));
    const worker = await start(folder);
    try {
      const { origin } = worker;
      add("isolate: first request (/ping)", (await timed(() => fetch(`${origin}/ping`))).ms);
      for (let i = 0; i < RUNS; i++) {
        add("Worker request (/ping)", (await timed(() => fetch(`${origin}/ping`))).ms);
      }
      add(
        "object: first call (stats)",
        (await timed(() => fetch(`${origin}/stats?object=cold`))).ms,
      );
      for (let i = 0; i < RUNS; i++) {
        add("object call (stats)", (await timed(() => fetch(`${origin}/stats?object=cold`))).ms);
      }
      let revision = 1;
      const cold = await timed(() => render(origin, "cold", revision++, "svg"));
      add("cold start: first SVG of an object", cold.ms);
      sizes["svg"] =
        `${cold.value.report.width} × ${cold.value.report.height}, ${cold.value.size} bytes`;
      for (let i = 0; i < RUNS; i++) {
        add("SVG", (await timed(() => render(origin, "cold", revision++, "svg"))).ms);
      }
      const firstPng = await timed(() => render(origin, "cold", revision++, "png"));
      add("first PNG of an object (resvg and the faces)", firstPng.ms);
      for (const width of [1280, 2048]) {
        for (let i = 0; i < RUNS; i++) {
          const run = await timed(() => render(origin, "cold", revision++, "png", width));
          add(`PNG ${width}`, run.ms);
          sizes[`png ${width}`] =
            `${run.value.report.width} × ${run.value.report.height}, ${run.value.size} bytes`;
        }
      }
      for (let i = 0; i < RUNS; i++) {
        const run = await timed(() => render(origin, "cold", revision++, "png", 2048, TALL));
        add("PNG 2048, a tall diagram fitted to 4 megapixels", run.ms);
        sizes["png 2048 tall"] =
          `${run.value.report.width} × ${run.value.report.height}, ${run.value.size} bytes`;
      }
      const kept = revision++;
      await render(origin, "cold", kept, "png", 1280);
      for (let i = 0; i < RUNS; i++) {
        const run = await timed(() => render(origin, "cold", kept, "png", 1280));
        if (!run.value.cached)
          throw new Error("the repeated request was not answered from the cache");
        add("cache hit (PNG 1280)", run.ms);
      }
      // A second object in the same isolate: its engine is its own, its modules the isolate's.
      add("second object: first SVG", (await timed(() => render(origin, "second", 1, "svg"))).ms);
    } finally {
      await worker.stop();
      rmSync(folder, { recursive: true, force: true, maxRetries: 5 });
    }
  }
  const rows = Object.entries(samples).map(([name, list]) => ({
    name,
    n: list.length,
    median: median(list),
    p95: p95(list),
    max: Math.max(...list),
  }));
  const machine = `${cpus()[0]?.model.trim()}, ${cpus().length} threads, ${Math.round(totalmem() / 2 ** 30)} GB, ${process.platform}, Node ${process.version}`;
  console.log(`${machine}\n${STARTS} starts of wrangler dev, ${RUNS} runs a case per start`);
  console.log("| Case | n | Median (ms) | p95 (ms) | Max (ms) |");
  console.log("| --- | ---: | ---: | ---: | ---: |");
  for (const row of rows) {
    console.log(
      `| ${row.name} | ${row.n} | ${row.median.toFixed(1)} | ${row.p95.toFixed(1)} | ${row.max.toFixed(1)} |`,
    );
  }
  console.log(sizes);
  if (values.json) {
    writeFileSync(values.json, `${JSON.stringify({ machine, rows, sizes }, null, 2)}\n`);
  }
}

await main();
