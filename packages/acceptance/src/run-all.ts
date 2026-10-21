// The whole acceptance run: the acceptance tests, visual regression, determinism, the benchmark, the
// first export and the browser matrix, recorded in docs/quality/results.md with the machine and the
// versions they ran with. The benchmark and the browser matrix also rewrite their own documents.
// Usage: pnpm acceptance
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { machine, runBench, writeBenchDocuments } from "./bench.js";
import { BROWSERS_DOC, browsersMarkdown, browsersPassed, runBrowsers } from "./browsers.js";
import { TOOL_VERSION } from "./cli.js";
import { REPO_ROOT } from "./corpus.js";
import { runDeterminism } from "./determinism.js";
import { runFirstExport } from "./first-export.js";
import { writeMarkdown } from "./markdown.js";
import { runVisual } from "./visual.js";

export const RESULTS_DOC = join(REPO_ROOT, "docs", "quality", "results.md");

export interface PartResult {
  readonly name: string;
  readonly passed: boolean;
  /** What the part found, one line each. */
  readonly lines: readonly string[];
  readonly seconds: number;
  /** The document with the part's details, relative to `docs/quality/`. */
  readonly document?: string;
}

async function part(
  name: string,
  run: () => Promise<{ passed: boolean; lines: string[]; document?: string }>,
): Promise<PartResult> {
  const start = performance.now();
  console.log(`\n${name}…`);
  try {
    const result = await run();
    const seconds = (performance.now() - start) / 1000;
    console.log(`${result.passed ? "✓" : "✗"} ${name} (${seconds.toFixed(0)} s)`);
    for (const line of result.lines) console.log(`    ${line}`);
    return { name, seconds, ...result };
  } catch (error) {
    const seconds = (performance.now() - start) / 1000;
    const message = (error as Error).message.split("\n")[0]!;
    console.log(`✗ ${name}: ${message}`);
    return { name, passed: false, lines: [message], seconds };
  }
}

/** The acceptance tests through Vitest, counted from its JSON report. */
function acceptanceTests(): { passed: boolean; lines: string[] } {
  const out = join(tmpdir(), `meltemi-acceptance-${process.pid}.json`);
  const vitest = join(REPO_ROOT, "node_modules", "vitest", "vitest.mjs");
  const run = spawnSync(
    process.execPath,
    [vitest, "run", "packages/acceptance", "--reporter=json", `--outputFile=${out}`],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      // Messages in English, whatever the machine's language.
      env: { ...process.env, MELTEMI_LANG: "en" },
    },
  );
  try {
    const report = JSON.parse(readFileSync(out, "utf8")) as {
      numTotalTests: number;
      numPassedTests: number;
      numFailedTests: number;
      testResults: { assertionResults: { fullName: string; status: string }[] }[];
    };
    const failed = report.testResults
      .flatMap((file) => file.assertionResults)
      .filter((test) => test.status === "failed")
      .map((test) => `failed: ${test.fullName}`);
    return {
      passed: run.status === 0 && report.numFailedTests === 0,
      lines: [`${report.numPassedTests} of ${report.numTotalTests} tests pass`, ...failed],
    };
  } catch {
    return { passed: false, lines: [`Vitest exited ${run.status}: ${run.stderr.split("\n")[0]}`] };
  } finally {
    rmSync(out, { force: true });
  }
}

export async function runAll(): Promise<{ parts: PartResult[]; versions: string[] }> {
  const versions: string[] = [`Meltemi Diagrams ${TOOL_VERSION}`, `Node ${process.version}`];
  const parts: PartResult[] = [];
  parts.push(await part("Acceptance tests", async () => acceptanceTests()));
  parts.push(
    await part("Visual regression", async () => {
      const report = await runVisual();
      const failed = report.results.filter((r) => !r.passed);
      versions.push(`Visual references: ${report.reference ?? "none"}; drawn by ${report.browser}`);
      return {
        passed: failed.length === 0 && report.results.length > 0,
        lines: [
          `${report.results.length - failed.length} of ${report.results.length} drawings match their references`,
          ...failed.map((r) => `${r.name}: ${r.detail}`),
        ],
      };
    }),
  );
  parts.push(
    await part("Determinism", async () => {
      const report = await runDeterminism();
      versions.push(`Exports captured by ${report.browser}`, report.ffmpeg);
      return {
        passed: report.results.every((r) => r.passed),
        lines: report.results.map((r) => `${r.passed ? "✓" : "✗"} ${r.format}: ${r.detail}`),
      };
    }),
  );
  parts.push(
    await part("Performance", async () => {
      const report = runBench();
      await writeBenchDocuments(report);
      const held = report.cases.filter((c) => c.target !== undefined);
      const over = held.filter((c) => c.timing.p95 >= c.target!);
      return {
        passed: over.length === 0,
        lines: [
          `${held.length - over.length} of ${held.length} targets met`,
          ...over.map(
            (c) => `over: ${c.name}, p95 ${c.timing.p95.toFixed(1)} ms, target ${c.target} ms`,
          ),
        ],
        document: "../performance.md",
      };
    }),
  );
  parts.push(
    await part("First export", async () => {
      const results = await runFirstExport();
      return {
        passed: results.every((r) => r.passed),
        lines: results.map(
          (r) => `${r.passed ? "✓" : "✗"} ${r.path}: ${(r.totalMs / 1000).toFixed(1)} s`,
        ),
      };
    }),
  );
  parts.push(
    await part("Browser matrix", async () => {
      const report = await runBrowsers();
      await writeMarkdown(BROWSERS_DOC, browsersMarkdown(report));
      for (const b of report.browsers)
        versions.push(b.version ? `${b.name} ${b.version}` : `${b.name}: ${b.skipped}`);
      const cells = report.browsers.flatMap((b) => b.cells);
      return {
        passed: browsersPassed(report),
        lines: [
          `${cells.filter((c) => c.passed).length} of ${cells.length} checks pass in ${report.browsers.filter((b) => b.version).length} browsers; ${report.pdf.filter((p) => p.passed).length} of ${report.pdf.length} PDF files`,
          ...report.browsers
            .filter((b) => b.skipped)
            .map((b) => `skipped: ${b.name}, ${b.skipped}`),
          ...report.browsers.flatMap((b) =>
            b.cells.flatMap((c, i) =>
              c.passed === false ? [`${b.name}, ${report.checks[i]!.format}: ${c.detail}`] : [],
            ),
          ),
        ],
        document: "../verification/browsers.md",
      };
    }),
  );
  return { parts, versions: [...new Set(versions)] };
}

/** The results as Markdown. */
export function resultsMarkdown(
  parts: readonly PartResult[],
  versions: readonly string[],
  date: string,
): string {
  const passed = parts.every((p) => p.passed);
  return [
    "# Acceptance results",
    "",
    "Generated by `pnpm acceptance`, which runs every acceptance criterion of",
    "[quality.md](../quality.md) and records the outcome here.",
    "",
    `Run on ${date}: ${machine()}.`,
    "",
    `**${passed ? "Every criterion passes." : "Some criteria fail."}**`,
    "",
    "| Criterion | Result | Time | Details |",
    "| --- | :---: | ---: | --- |",
    ...parts.map(
      (p) =>
        `| ${p.name} | ${p.passed ? "✓" : "✗"} | ${p.seconds.toFixed(0)} s | ${p.document ? `[${p.document.split("/").at(-1)}](${p.document})` : ""} |`,
    ),
    "",
    ...parts.flatMap((p) => [`## ${p.name}`, "", ...p.lines.map((l) => `- ${l}`), ""]),
    "## Versions",
    "",
    ...versions.map((v) => `- ${v}`),
    "",
  ].join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { parts, versions } = await runAll();
  mkdirSync(dirname(RESULTS_DOC), { recursive: true });
  await writeMarkdown(
    RESULTS_DOC,
    resultsMarkdown(parts, versions, new Date().toISOString().slice(0, 10)),
  );
  console.log(`\nWrote docs/quality/results.md`);
  if (parts.some((p) => !p.passed)) process.exitCode = 1;
}
