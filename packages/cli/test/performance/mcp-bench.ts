/**
 * `pnpm cli:bench-mcp`: the speed of the local MCP server's previews (`mcp-local-server`, "Speed of
 * local previews"). The built command line (`packages/cli/dist/bin.js`; build it first) runs
 * `mcp --folder` over the acceptance corpus's flow sheets, as an agent's machine runs it, and the
 * SDK's client asks it for the corpus's costliest diagram (`flow/thirty`) as a PNG:
 *
 * - a cold process's first preview, three times, each in a process of its own (the engine, ELK, the
 *   fonts and resvg are loaded then), under 3 seconds;
 * - fifteen warm previews in one process after a first one, each at another width so that none is
 *   answered from the core's cache, the median and the p95 under 1 second.
 *
 * A time is from the call to the answer, as the agent waits for it. The table is printed for
 * `docs/performance.md`; the exit code is 1 when a target is missed, naming the case and its time.
 */

import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const BIN = join(REPO, "packages", "cli", "dist", "bin.js");
const CORPUS = join(REPO, "corpus", "acceptance", "flow");
const FILE = "thirty.meltemi";
const TARGETS = { cold: 3_000, warm: 1_000 } as const;

if (!existsSync(BIN)) {
  console.error(`${BIN} is missing: run pnpm --filter "@meltemi/diagrams-cli..." build first.`);
  process.exit(1);
}

const folder = mkdtempSync(join(tmpdir(), "mdg-mcp-bench-"));
for (const name of readdirSync(CORPUS).filter((n) => n.endsWith(".meltemi"))) {
  cpSync(join(CORPUS, name), join(folder, name));
}

/** A server of its own, connected: its client, and how to end it. */
async function server(): Promise<{ client: Client; stop: () => void }> {
  const child = spawn(process.execPath, [BIN, "mcp", "--folder", folder, "--port", "0"], {
    env: { ...process.env, MELTEMI_LANG: "en" },
    stdio: ["ignore", "pipe", "ignore"],
  });
  const url = await new Promise<string>((resolve, reject) => {
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      out += chunk;
      if (out.includes("\n")) resolve(out.split(/\r?\n/)[0]!.trim());
    });
    child.once("exit", (code) => reject(new Error(`mdg mcp exited ${code}`)));
  });
  const client = new Client({ name: "mcp-bench", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return { client, stop: () => child.kill() };
}

/** One preview's time, in milliseconds; a refusal stops the run. */
async function preview(client: Client, width: number): Promise<number> {
  const start = performance.now();
  const result = (await client.callTool({
    name: "preview",
    arguments: { path: FILE, width },
  })) as { isError?: boolean; structuredContent?: Record<string, unknown> };
  const ms = performance.now() - start;
  if (result.isError)
    throw new Error(`preview refused: ${JSON.stringify(result.structuredContent)}`);
  if (result.structuredContent?.["cached"] === true)
    throw new Error("a preview came from the cache");
  return ms;
}

const quantile = (values: readonly number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]!;
};

const cold: number[] = [];
for (let run = 0; run < 3; run++) {
  const { client, stop } = await server();
  try {
    cold.push(await preview(client, 1280));
  } finally {
    await client.close();
    stop();
  }
}

const warm: number[] = [];
{
  const { client, stop } = await server();
  try {
    await preview(client, 1280);
    for (let i = 1; i <= 15; i++) warm.push(await preview(client, 1280 + i));
  } finally {
    await client.close();
    stop();
  }
}

const row = (name: string, values: readonly number[]) =>
  `| ${name.padEnd(46)} | ${quantile(values, 0.5).toFixed(1).padStart(11)} | ${quantile(values, 0.95).toFixed(1).padStart(8)} | ${Math.max(
    ...values,
  )
    .toFixed(1)
    .padStart(8)} |`;

console.log(
  `${cpus()[0]?.model ?? "?"}, Node ${process.version}, ${new Date().toISOString().slice(0, 10)}`,
);
console.log("");
console.log(`| ${"Case".padEnd(46)} | Median (ms) | p95 (ms) | Max (ms) |`);
console.log(`| ${"-".repeat(46)} | ----------: | -------: | -------: |`);
console.log(row("a process's first PNG 1280 of `flow/thirty`", cold));
console.log(row("a warm PNG 1280 of `flow/thirty`", warm));

const missed: string[] = [];
if (Math.max(...cold) >= TARGETS.cold) {
  missed.push(`the first preview took ${Math.max(...cold).toFixed(0)} ms (target ${TARGETS.cold})`);
}
if (quantile(warm, 0.95) >= TARGETS.warm) {
  missed.push(
    `a warm preview's p95 is ${quantile(warm, 0.95).toFixed(0)} ms (target ${TARGETS.warm})`,
  );
}
if (missed.length > 0) {
  console.error(`\nMissed: ${missed.join("; ")}.`);
  process.exitCode = 1;
}
