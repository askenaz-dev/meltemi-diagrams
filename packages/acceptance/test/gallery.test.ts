import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { findFfmpeg } from "@meltemi/diagrams-capture";
import { templateManifest, toProjectPath } from "@meltemi/diagrams-project";
import { mdg } from "../src/cli.js";
import { TOOL_VERSION, projectSessions } from "../src/corpus.js";
import {
  EXAMPLE,
  EXAMPLE_EXPORTS,
  EXAMPLE_FILES,
  GALLERY,
  GALLERY_SHEETS,
  TEMPLATE,
} from "../src/gallery.js";
import { pdfFacts } from "../src/pdf.js";
import { readPng } from "../src/png.js";

const sessions = projectSessions();

/** The width and height of an SVG from its root's attributes. */
function svgSize(svg: string): { width: number; height: number } {
  const root = /<svg\b[^>]*>/.exec(svg)![0];
  return {
    width: Number(/\swidth="([\d.]+)"/.exec(root)![1]),
    height: Number(/\sheight="([\d.]+)"/.exec(root)![1]),
  };
}

const files = (folder: string): string[] =>
  readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(folder, join(e.parentPath, e.name)).replaceAll("\\", "/"))
    .sort();

describe("gallery", () => {
  it("has one sheet for each profile, a sketch and a whiteboard", () => {
    expect(GALLERY_SHEETS.map((s) => s.profile)).toEqual([
      "flow",
      "sequence",
      "c4",
      "free",
      "free",
      "free",
    ]);
  });

  it.each(GALLERY_SHEETS.map((s) => [s.file, s] as const))(
    "%s validates cleanly and its exports are current",
    (_name, sheet) => {
      const path = join(GALLERY, sheet.file);
      const analysis = sessions.analyze(toProjectPath(path));
      expect(analysis.diagnostics.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
      expect(analysis.diagrams).toHaveLength(1);
      const stem = path.replace(/\.meltemi$/, "");
      const svg = readFileSync(`${stem}.svg`, "utf8");
      expect(svg, "run pnpm gallery").toBe(mdg("export", path, "--stdout"));
      const size = svgSize(svg);
      const png = readPng(readFileSync(`${stem}.png`));
      expect([png.width, png.height]).toEqual([
        Math.round(size.width * 2),
        Math.round(size.height * 2),
      ]);
      expect(pdfFacts(readFileSync(`${stem}.pdf`)).pages).toBe(1);
    },
    60_000,
  );

  it("links every sheet and export from its README", () => {
    const readme = readFileSync(join(GALLERY, "README.md"), "utf8");
    for (const sheet of GALLERY_SHEETS) {
      const stem = sheet.file.replace(/\.meltemi$/, "");
      for (const file of [sheet.file, `${stem}.svg`, `${stem}.png`, `${stem}.pdf`]) {
        expect(readme).toContain(`](${file})`);
      }
    }
  });
});

describe("purchase example", () => {
  it("is the purchase template as a project", () => {
    const sources = files(TEMPLATE);
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      expect(readFileSync(join(EXAMPLE, file), "utf8"), file).toBe(
        readFileSync(join(TEMPLATE, file), "utf8"),
      );
    }
    expect(readFileSync(join(EXAMPLE, "project.json"), "utf8")).toBe(
      templateManifest("purchase", "purchase", {
        toolVersion: TOOL_VERSION,
        languageVersion: "0.2",
      }),
    );
    expect(mdg("validate", EXAMPLE)).toMatch(/0 errors, 0 warnings/);
  });

  it("holds every export, current", () => {
    for (const name of Object.values(EXAMPLE_FILES)) {
      if ((name.endsWith(".mp4") || name.endsWith(".gif")) && !findFfmpeg()) continue;
      expect(existsSync(join(EXAMPLE_EXPORTS, name)), name).toBe(true);
    }
    const views: [string, string, string][] = [
      ["architecture.meltemi", "context", EXAMPLE_FILES.context],
      ["architecture.meltemi", "containers", EXAMPLE_FILES.containers],
      ["payment.meltemi", "payment", EXAMPLE_FILES.payment],
      ["executive.meltemi", "executive", EXAMPLE_FILES.executive],
    ];
    for (const [file, diagram, svg] of views) {
      expect(readFileSync(join(EXAMPLE_EXPORTS, svg), "utf8"), "run pnpm gallery").toBe(
        mdg("export", join(EXAMPLE, "diagrams", file), "--diagram", diagram, "--stdout"),
      );
    }
    const slide = readPng(readFileSync(join(EXAMPLE_EXPORTS, EXAMPLE_FILES.slidePng)));
    expect([slide.width, slide.height]).toEqual([2560, 1440]);
  }, 60_000);

  it("draws the container view no wider than twice its height", () => {
    const { width, height } = svgSize(
      readFileSync(join(EXAMPLE_EXPORTS, EXAMPLE_FILES.containers), "utf8"),
    );
    expect(width).toBeLessThanOrEqual(2 * height);
  });

  it.runIf(findFfmpeg() !== null)("has a video as long as the story", () => {
    const run = spawnSync(
      findFfmpeg()!,
      ["-hide_banner", "-i", join(EXAMPLE_EXPORTS, EXAMPLE_FILES.mp4)],
      {
        encoding: "utf8",
      },
    );
    const match = /Duration: (\d+):(\d+):([\d.]+)/.exec(run.stderr)!;
    const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    const player = readFileSync(join(EXAMPLE_EXPORTS, EXAMPLE_FILES.player), "utf8");
    const duration = Number(/"durationMs":(\d+)/.exec(player)![1]) / 1000;
    expect(Math.abs(seconds - duration)).toBeLessThan(0.1);
    expect(run.stderr).toMatch(/1920x1080/);
  });
});
