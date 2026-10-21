// Visual regression with pinned resources: draws every acceptance sheet as PNG in the installed
// browser and compares the pixels with the references in corpus/acceptance/visual/.
// Usage: tsx --conditions=@meltemi/diagrams-source packages/acceptance/src/visual.ts [--update]
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { capture, type CaptureJob } from "@meltemi/diagrams-capture";
import { ACCEPTANCE_ROOT, REPO_ROOT, acceptanceSheets, projectSessions } from "./corpus.js";
import { exportOf, requestFor } from "./exports.js";
import { compareImages, readPng, writePng, VISUAL_TOLERANCE } from "./png.js";

export const VISUAL_ROOT = join(ACCEPTANCE_ROOT, "visual");
const OUTPUT = join(REPO_ROOT, "packages", "acceptance", ".test-output", "visual");

interface Manifest {
  readonly browser: string;
  readonly recorded: string;
  readonly tolerance: typeof VISUAL_TOLERANCE;
  readonly drawings: readonly string[];
}

export interface VisualResult {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface VisualReport {
  readonly browser: string;
  readonly reference: string | null;
  readonly results: readonly VisualResult[];
  readonly updated: boolean;
}

/** Every drawing of the acceptance corpus as a PNG capture job at scale 1. */
function drawings(): { name: string; job: CaptureJob }[] {
  const sessions = projectSessions();
  const out: { name: string; job: CaptureJob }[] = [];
  for (const sheet of acceptanceSheets()) {
    const analysis = sessions.analyze(sheet.path);
    for (const view of analysis.diagrams) {
      const name = analysis.diagrams.length > 1 ? `${sheet.name}.${view.id}` : sheet.name;
      const output = exportOf(
        sessions,
        sheet.path,
        requestFor(sessions, sheet.path, { diagram: view.id }, "png", { scale: 1 }),
      );
      if (!("job" in output)) throw new Error(`${name} did not make a picture.`);
      out.push({ name, job: output.job });
    }
  }
  return out;
}

/** Draws, then records references (`update`) or compares with them. */
export async function runVisual(update = false): Promise<VisualReport> {
  const list = drawings();
  const { browser, results } = await capture(list.map((d) => d.job));
  const manifestPath = join(VISUAL_ROOT, "manifest.json");
  if (update) {
    rmSync(VISUAL_ROOT, { recursive: true, force: true });
    for (const [i, drawing] of list.entries()) {
      const file = join(VISUAL_ROOT, `${drawing.name}.png`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, results[i]!);
    }
    const manifest: Manifest = {
      browser,
      recorded: new Date().toISOString().slice(0, 10),
      tolerance: VISUAL_TOLERANCE,
      drawings: list.map((d) => d.name),
    };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return {
      browser,
      reference: browser,
      updated: true,
      results: list.map((d) => ({ name: d.name, passed: true, detail: "recorded" })),
    };
  }
  const manifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest)
    : null;
  rmSync(OUTPUT, { recursive: true, force: true });
  const outcome: VisualResult[] = list.map((drawing, i) => {
    const referencePath = join(VISUAL_ROOT, `${drawing.name}.png`);
    if (!existsSync(referencePath)) {
      return { name: drawing.name, passed: false, detail: "no reference; run with --update" };
    }
    const comparison = compareImages(readPng(readFileSync(referencePath)), readPng(results[i]!));
    if (!comparison.passed) {
      const base = join(OUTPUT, drawing.name);
      mkdirSync(dirname(base), { recursive: true });
      writeFileSync(`${base}.actual.png`, results[i]!);
      if (comparison.diff) writeFileSync(`${base}.diff.png`, writePng(comparison.diff));
    }
    return {
      name: drawing.name,
      passed: comparison.passed,
      detail:
        comparison.reason ??
        `${(comparison.ratio * 100).toFixed(3)} % of pixels differ, longest run ${comparison.longestRun} px`,
    };
  });
  return { browser, reference: manifest?.browser ?? null, updated: false, results: outcome };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const update = process.argv.includes("--update");
  const report = await runVisual(update);
  for (const result of report.results) {
    console.log(`  ${result.passed ? "✓" : "✗"} ${result.name}: ${result.detail}`);
  }
  if (report.reference && report.reference !== report.browser) {
    console.log(
      `\nReferences were recorded with ${report.reference}; this run used ${report.browser}.`,
    );
  }
  const failed = report.results.filter((r) => !r.passed).length;
  console.log(
    `\n${report.results.length - failed} passed, ${failed} failed (${report.browser})${failed > 0 ? `; see ${OUTPUT}` : ""}`,
  );
  if (failed > 0) process.exitCode = 1;
}
