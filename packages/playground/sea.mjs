// What the build decides about the family's sea (`playground-sea`): the still pictures of the agent
// setup pages (design D5) and the weight of the code that draws it, read from esbuild's metafile
// (D7). A module of its own, so that a test can read it without running the build.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { stillPicture } from "@meltemi/ocean";

/** The most the chunks that carry the sea may weigh, gzipped. */
export const SEA_BUDGET = 25 * 1024;

/** The entry the editor starts from. */
export const EDITOR_ENTRY = "src/main.ts";

/**
 * The agent setup pages' picture: the `diagrams` sea at rest, in the brand's colours, as one file per
 * scheme that the pages choose between with `prefers-color-scheme`. Throws, naming the file, when a
 * picture is not an SVG.
 *
 * @returns {Record<string, string>}
 */
export function seaStills() {
  const pictures = {
    "sea-diagrams.svg": stillPicture("diagrams", { scheme: "light" }),
    "sea-diagrams-dark.svg": stillPicture("diagrams", { scheme: "dark" }),
  };
  for (const [file, picture] of Object.entries(pictures)) {
    if (!/^<svg[\s>][\s\S]*<\/svg>\s*$/.test(picture)) {
      throw new Error(
        `${file} is not an SVG picture; @meltemi/ocean's stillPicture gave something else.`,
      );
    }
  }
  return pictures;
}

const slashes = (path) => path.replaceAll("\\", "/");

/** Whether an input of the build is the sea's: the package, or the page's modules that draw with it. */
export function isSeaInput(input) {
  const path = slashes(input);
  return (
    path.includes("node_modules/@meltemi/ocean/") ||
    path === "src/sea.ts" ||
    path === "src/boot-sea.ts"
  );
}

/**
 * The chunks that carry the sea and their weight gzipped, from the page's metafile and the files it
 * wrote (paths relative to `workingDir`, the build's `absWorkingDir`). Throws, naming the chunk, when
 * one of them is in the bundle the editor starts with (`EDITOR_ENTRY` and what it imports
 * statically), or when together they weigh more than `budget`.
 *
 * @param {{ outputs: Record<string, { entryPoint?: string; inputs: Record<string, unknown>; imports: { path: string; kind: string; external?: boolean }[] }> }} metafile
 * @param {string} workingDir
 * @param {number} [budget]
 * @returns {{ chunks: { file: string; gzip: number }[]; gzip: number }}
 */
export function seaWeight(metafile, workingDir, budget = SEA_BUDGET) {
  const outputs = Object.entries(metafile.outputs).filter(([file]) => file.endsWith(".js"));
  const carrying = (output) => Object.keys(output.inputs).filter(isSeaInput);
  const chunks = outputs.filter(([, output]) => carrying(output).length > 0);
  if (chunks.length === 0) {
    throw new Error("No chunk of the page carries the sea: @meltemi/ocean is not in the build.");
  }

  // What the editor starts with: its entry, and every chunk it imports statically, transitively.
  const entry = outputs.find(([, output]) => slashes(output.entryPoint ?? "") === EDITOR_ENTRY);
  if (!entry) throw new Error(`No output of the page is built from ${EDITOR_ENTRY}.`);
  const start = new Set();
  const visit = (file) => {
    if (start.has(file)) return;
    start.add(file);
    for (const imported of metafile.outputs[file]?.imports ?? []) {
      if (imported.kind === "import-statement" && !imported.external) visit(imported.path);
    }
  };
  visit(entry[0]);
  for (const [file, output] of chunks) {
    if (start.has(file)) {
      throw new Error(
        `${file} carries the sea (${carrying(output).join(", ")}) and is part of the bundle the editor starts with; the sea must be loaded only when it shows.`,
      );
    }
  }

  const weighed = chunks.map(([file]) => ({
    file,
    gzip: gzipSync(readFileSync(join(workingDir, file)), { level: 9 }).length,
  }));
  const gzip = weighed.reduce((sum, chunk) => sum + chunk.gzip, 0);
  if (gzip > budget) {
    throw new Error(
      `The chunks that carry the sea weigh ${(gzip / 1024).toFixed(1)} KB gzipped, over ${(budget / 1024).toFixed(0)} KB: ${weighed.map((c) => `${c.file} (${(c.gzip / 1024).toFixed(1)} KB)`).join(", ")}.`,
    );
  }
  return { chunks: weighed, gzip };
}
