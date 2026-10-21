// The verification kit: the purchase example in the seven formats people put into slides, documents
// and pages, with the checklist of docs/verification/office-apps.md beside them.
// Usage: pnpm verification:kit <folder>
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findFfmpeg } from "@meltemi/diagrams-capture";
import { REPO_ROOT } from "./corpus.js";
import { browserOf, mdg, purchaseProject } from "./cli.js";

/** The kit's files by format. */
export const KIT_FILES = {
  svg: "purchase-slide.svg",
  png: "purchase-slide.png",
  pdf: "purchase-slide.pdf",
  html: "purchase-story.html",
  mp4: "purchase-story.mp4",
  webm: "purchase-story.webm",
  gif: "purchase-story.gif",
} as const;

export type KitFormat = keyof typeof KIT_FILES;

/** The formats as people name them. */
export const FORMAT_NAMES: Record<KitFormat, string> = {
  svg: "SVG",
  png: "PNG",
  pdf: "PDF",
  html: "HTML player",
  mp4: "MP4",
  webm: "WebM",
  gif: "GIF",
};

/** The address the slide's SVG and PDF link to, to check that links survive. */
export const KIT_LINK = "https://example.com/meltemi/purchase";

/** The office applications' checks, taken from their document so that both say the same. */
export const OFFICE_APPS_DOC = join(REPO_ROOT, "docs", "verification", "office-apps.md");

export interface KitFile {
  readonly format: KitFormat;
  readonly file: string;
  readonly bytes: number;
}

export interface Kit {
  readonly folder: string;
  /** The purchase project the kit was exported from. */
  readonly project: string;
  readonly files: readonly KitFile[];
  /** The browser that captured PNG, PDF and the videos, such as `Edg/155.0.4283.45`. */
  readonly browser: string;
}

/** The checklist section of the office applications' document. */
export function checklist(): string {
  const doc = readFileSync(OFFICE_APPS_DOC, "utf8");
  const start = doc.indexOf("## Checklist");
  const end = doc.indexOf("\n## ", start + 1);
  if (start < 0) throw new Error(`${OFFICE_APPS_DOC} has no "## Checklist" section.`);
  return doc.slice(start, end < 0 ? undefined : end).trim();
}

/**
 * Writes the kit into `folder`: the executive slide as SVG, PNG (transparent) and PDF, the story
 * as the HTML player and as MP4, WebM and GIF, and `checklist.md`. The purchase project is copied
 * into `work`, which the caller removes.
 */
export function writeKit(folder: string, work: string): Kit {
  const project = purchaseProject(work);
  const slide = join(project, "diagrams", "executive.meltemi");
  const story = join(project, "stories", "purchase.meltemi");
  mkdirSync(folder, { recursive: true });
  const out = (format: KitFormat) => join(folder, KIT_FILES[format]);
  let browser = "unknown";
  const run = (...args: string[]) => {
    const printed = mdg(...args);
    if (browserOf(printed) !== "unknown") browser = browserOf(printed);
  };
  run("export", slide, "--link", KIT_LINK, "--out", out("svg"));
  run("export", slide, "--format", "png", "--background", "transparent", "--out", out("png"));
  run("export", slide, "--format", "pdf", "--link", KIT_LINK, "--out", out("pdf"));
  run("export", story, "--story", "purchase", "--format", "html", "--out", out("html"));
  const videos: KitFormat[] = ["mp4", "webm", "gif"];
  const ffmpeg = findFfmpeg() !== null;
  if (ffmpeg) {
    for (const format of videos)
      run("export", story, "--story", "purchase", "--format", format, "--out", out(format));
  }
  const files = (Object.keys(KIT_FILES) as KitFormat[])
    .filter((format) => ffmpeg || !videos.includes(format))
    .map((format) => ({ format, file: out(format), bytes: statSync(out(format)).size }));
  const lines = [
    "# Meltemi Diagrams verification kit",
    "",
    `Made by \`pnpm verification:kit\` on ${new Date().toISOString().slice(0, 10)} (${browser}).`,
    "Put each file into the application, go through the checks, and record the results in the",
    "table of `docs/verification/office-apps.md`.",
    "",
    "| Format | File | Size |",
    "| --- | --- | ---: |",
    ...files.map(
      (f) =>
        `| ${FORMAT_NAMES[f.format]} | ${KIT_FILES[f.format]} | ${(f.bytes / 1024).toFixed(0)} KB |`,
    ),
    "",
    checklist(),
    "",
  ];
  writeFileSync(join(folder, "checklist.md"), lines.join("\n"));
  return { folder, project, files, browser };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: pnpm verification:kit <folder>");
    process.exit(2);
  }
  const folder = resolve(process.env.INIT_CWD ?? process.cwd(), target);
  const work = join(tmpdir(), `meltemi-kit-${process.pid}`);
  rmSync(work, { recursive: true, force: true });
  try {
    const kit = writeKit(folder, work);
    for (const f of kit.files)
      console.log(`  ${KIT_FILES[f.format]} (${(f.bytes / 1024).toFixed(0)} KB)`);
    console.log(`  checklist.md\n\nWrote the kit to ${folder} (${kit.browser}).`);
    if (kit.files.length < Object.keys(KIT_FILES).length) {
      console.log("FFmpeg is not installed: the kit has no videos.");
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
