// Determinism of exports: the reference example exported twice in every format, compared by
// content — SVG and HTML byte for byte, PNG pixel for pixel, videos frame by frame through FFmpeg's
// frame hashes, so container metadata never counts as a change.
// Usage: tsx --conditions=@meltemi/diagrams-source packages/acceptance/src/determinism.ts
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findFfmpeg } from "@meltemi/diagrams-capture";
import { browserOf, mdg, purchaseProject } from "./cli.js";
import { FORMAT_NAMES } from "./kit.js";
import { compareImages, readPng } from "./png.js";

export interface DeterminismResult {
  readonly format: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface DeterminismReport {
  readonly browser: string;
  readonly ffmpeg: string;
  readonly results: readonly DeterminismResult[];
}

/** The hash of every decoded frame of a video. */
function frameHashes(ffmpeg: string, file: string): string[] {
  const out = execFileSync(ffmpeg, ["-v", "error", "-i", file, "-f", "framemd5", "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split("\n")
    .filter((l) => l !== "" && !l.startsWith("#"))
    .map((l) => l.split(",").at(-1)!.trim());
}

const files = (folder: string) =>
  readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(folder.length + 1))
    .sort();

export async function runDeterminism(): Promise<DeterminismReport> {
  const scratch = join(tmpdir(), `meltemi-determinism-${process.pid}`);
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  const project = purchaseProject(scratch);
  const story = join(project, "stories", "purchase.meltemi");
  const ffmpeg = findFfmpeg();
  const results: DeterminismResult[] = [];
  let browser = "unknown";
  const twice = (name: string, make: (out: string) => string) => {
    const a = join(scratch, `${name}-a`);
    const b = join(scratch, `${name}-b`);
    const printed = make(a);
    make(b);
    if (browserOf(printed) !== "unknown") browser = browserOf(printed);
    return { a, b };
  };
  try {
    // SVG of every diagram, byte for byte.
    {
      const { a, b } = twice("svg", (out) => mdg("export", project, "--out", out));
      const list = files(a);
      const same = list.every((f) => readFileSync(join(a, f)).equals(readFileSync(join(b, f))));
      results.push({
        format: "SVG",
        passed: same && list.length > 0,
        detail: `${list.length} files, byte for byte`,
      });
    }
    // HTML player of the story, byte for byte.
    {
      const { a, b } = twice("html", (out) =>
        mdg("export", story, "--story", "purchase", "--format", "html", "--out", `${out}.html`),
      );
      const same = readFileSync(`${a}.html`).equals(readFileSync(`${b}.html`));
      results.push({ format: "HTML player", passed: same, detail: "byte for byte" });
    }
    // PNG of every diagram, pixel for pixel.
    {
      const { a, b } = twice("png", (out) =>
        mdg("export", project, "--format", "png", "--out", out),
      );
      const list = files(a);
      const same = list.every((f) => {
        const c = compareImages(
          readPng(readFileSync(join(a, f))),
          readPng(readFileSync(join(b, f))),
        );
        return c.differing === 0;
      });
      results.push({
        format: "PNG",
        passed: same && list.length > 0,
        detail: `${list.length} files, pixel for pixel`,
      });
    }
    // Videos of the story, frame by frame.
    for (const format of ["mp4", "webm", "gif"] as const) {
      if (!ffmpeg) {
        results.push({
          format: FORMAT_NAMES[format],
          passed: true,
          detail: "skipped: FFmpeg is not installed",
        });
        continue;
      }
      const { a, b } = twice(format, (out) =>
        mdg(
          "export",
          story,
          "--story",
          "purchase",
          "--format",
          format,
          "--duration",
          "3s",
          "--out",
          `${out}.${format}`,
        ),
      );
      const first = frameHashes(ffmpeg, `${a}.${format}`);
      const second = frameHashes(ffmpeg, `${b}.${format}`);
      const same =
        first.length > 0 &&
        first.length === second.length &&
        first.every((h, i) => h === second[i]);
      const bytes = readFileSync(`${a}.${format}`).equals(readFileSync(`${b}.${format}`));
      results.push({
        format: FORMAT_NAMES[format],
        passed: same,
        detail: `${first.length} frames, frame hashes ${same ? "equal" : "differ"}; files ${bytes ? "identical" : "differ in bytes only"}`,
      });
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  const version = ffmpeg
    ? execFileSync(ffmpeg, ["-version"], { encoding: "utf8" })
        .split("\n")[0]!
        .replace(/ Copyright.*/, "")
    : "none";
  return { browser, ffmpeg: version, results };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const report = await runDeterminism();
  for (const r of report.results) console.log(`  ${r.passed ? "✓" : "✗"} ${r.format}: ${r.detail}`);
  console.log(`\n${report.browser}, ${report.ffmpeg}`);
  if (report.results.some((r) => !r.passed)) process.exitCode = 1;
}
