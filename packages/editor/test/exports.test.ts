import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  MAX_PIXELS,
  produceExport,
  ProjectSessions,
  type ExportContext,
  type ExportOutput,
  type ExportRequest,
} from "../src/node.js";

const CHECKOUT = [
  'language "0.2"',
  "",
  "diagram checkout: flow {",
  "  layout manual",
  '  web["Web"]',
  '  api["API"]',
  '  web -> api: "Pay" as pay',
  "  animate pay { effect flow }",
  "  animate api { effect pulse }",
  "  placement {",
  "    place web at (100, 100)",
  "    place api at (400, 100)",
  "  }",
  "}",
  "",
  "diagram still: flow {",
  "  layout manual",
  "  a -> b",
  "  placement {",
  "    place a at (100, 100)",
  "    place b at (400, 100)",
  "  }",
  "}",
  "",
  "diagram long: flow {",
  "  layout manual",
  "  a -> b as r",
  "  a -> c as s",
  "  animate r { effect flow; duration 1100ms }",
  "  animate s { effect flow; duration 2000ms; delay 300ms }",
  "  placement {",
  "    place a at (100, 100)",
  "    place b at (400, 100)",
  "    place c at (400, 300)",
  "  }",
  "}",
  "",
  "diagram finite: flow {",
  "  layout manual",
  "  a -> b as r",
  "  animate r { effect flow; duration 1s; repeat 2; delay 500ms }",
  "  placement {",
  "    place a at (100, 100)",
  "    place b at (400, 100)",
  "  }",
  "}",
  "",
].join("\n");

describe("exports that pick what nothing says", () => {
  const root = mkdtempSync(join(tmpdir(), "mdg-editor-exports-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "diagrams"));
  writeFileSync(
    join(root, "project.json"),
    JSON.stringify({ name: "p", language: "0.2", sources: ["diagrams"] }),
  );
  writeFileSync(join(root, "diagrams", "checkout.meltemi"), CHECKOUT);
  const path = join(root, "diagrams", "checkout.meltemi").split(sep).join("/");

  function exportOf(
    diagramId: string,
    format: ExportRequest["format"],
    options: Partial<ExportRequest> = {},
  ): ExportOutput {
    const projects = new ProjectSessions({ toolVersion: "1.0.0" });
    const workspace = projects.forFile(path);
    const context: ExportContext = {
      file: workspace.file(path)!,
      workspace,
      projects,
      playerScript: () => "",
      report: () => undefined,
      printed: new Set(),
    };
    const owner = context.file;
    const diagram = owner.compilation.document.diagrams.find((d) => d.id === diagramId)!;
    return produceExport(context, {
      target: { kind: "diagram", diagram, owner },
      format,
      theme: null,
      fonts: "system",
      motion: "static",
      at: null,
      scenario: undefined,
      scale: 1,
      size: null,
      background: null,
      link: null,
      embed: false,
      autoplay: false,
      loop: false,
      fps: null,
      durationMs: null,
      out: "out.gif",
      ...options,
    });
  }

  const video = (output: ExportOutput) => {
    if (!("video" in output)) throw new Error(JSON.stringify(output));
    return output;
  };

  it("gives endless effects one loop of their cycles, and says so", () => {
    const gif = video(exportOf("checkout", "gif"));
    expect(gif.video.durationMs).toBe(6000);
    expect(gif.video.fps).toBe(15);
    expect(gif.notices).toEqual([
      "The effects of `checkout` repeat forever: the video lasts 6 s, one loop of them.",
    ]);
  });

  it("gives effects whose loop would pass 10 s their longest cycle, and says which", () => {
    const gif = video(exportOf("long", "gif"));
    expect(gif.video.durationMs).toBe(2300);
    expect(gif.notices).toEqual([
      "The effects of `long` repeat forever: the video lasts 2.3 s, their longest cycle.",
    ]);
  });

  it("gives a diagram without moving effects a second", () => {
    const mp4 = video(exportOf("still", "mp4"));
    expect(mp4.video.durationMs).toBe(1000);
    expect(mp4.notices).toEqual(["`still` has no moving effects: the video lasts 1 s."]);
  });

  it("keeps a given duration and the end of finite effects, naming nothing", () => {
    const given = video(exportOf("checkout", "gif", { durationMs: 2000 }));
    expect(given.video.durationMs).toBe(2000);
    expect(given.notices).toBeUndefined();
    const finite = video(exportOf("finite", "webm"));
    expect(finite.video.durationMs).toBe(2500);
    expect(finite.notices).toBeUndefined();
  });

  it("draws a transparent MP4 over the theme's background, and a WebM stays transparent", () => {
    const mp4 = video(exportOf("checkout", "mp4", { background: "transparent" }));
    expect(mp4.video.background).toBe("#F7FBFF");
    expect(mp4.notices).toContain("MP4 has no transparency: the theme's background was used.");
    const webm = video(exportOf("checkout", "webm", { background: "transparent" }));
    expect(webm.video.background).toBe("transparent");
    expect(webm.notices).toEqual([
      "The effects of `checkout` repeat forever: the video lasts 6 s, one loop of them.",
    ]);
  });

  it("scales a video over the limit down, keeping its proportions", () => {
    const big = video(
      exportOf("checkout", "mp4", { size: { width: 20000, height: 10000 }, durationMs: 1000 }),
    );
    expect([big.video.width, big.video.height]).toEqual([16384, 8192]);
    expect(big.notices).toEqual([
      "Made at 16384 × 8192 pixels, the largest that fits the limit of 16384 a side.",
    ]);
  });

  it("captures a picture over the limit at the largest scale that fits", () => {
    const png = exportOf("checkout", "png", { scale: 4, size: { width: 9000, height: 2000 } });
    if (!("job" in png)) throw new Error(JSON.stringify(png));
    expect(png.job.width).toBe(9000);
    expect(png.job.scale).toBeCloseTo(16384 / 9000, 6);
    expect(Math.round(png.job.width * png.job.scale!)).toBe(MAX_PIXELS);
    expect(png.notices).toEqual([
      "Made at 16384 × 3641 pixels, the largest that fits the limit of 16384 a side.",
    ]);
    // A PDF has no scale: its page shrinks, keeping its proportions.
    const pdf = exportOf("checkout", "pdf", { size: { width: 20000, height: 5000 } });
    if (!("job" in pdf)) throw new Error(JSON.stringify(pdf));
    expect([pdf.job.width, pdf.job.height]).toEqual([16384, 4096]);
    expect(pdf.notices).toHaveLength(1);
    // A picture within the limit says nothing.
    const small = exportOf("checkout", "png", { scale: 2 });
    expect("job" in small && small.notices).toBeUndefined();
  });

  const text = (output: ExportOutput) => {
    if (!("text" in output)) throw new Error(JSON.stringify(output));
    return output.text;
  };

  it("leaves the branding out when asked, and keeps the rest of the picture", () => {
    const branded = text(exportOf("still", "svg"));
    const plain = text(exportOf("still", "svg", { branding: "none" }));
    expect(branded).toContain('data-role="frame"');
    expect(branded).toContain("meltemi-wind");
    expect(plain).not.toContain('data-role="frame"');
    expect(plain).not.toContain("meltemi-wind");
    // The same fonts and background: only the strip goes.
    const style = (svg: string) => /<style>[\s\S]*?<\/style>/.exec(svg)?.[0];
    expect(style(plain)).toBe(style(branded));
    const height = (svg: string) => Number(/height="(\d+(?:\.\d+)?)"/.exec(svg)?.[1]);
    expect(height(branded) - height(plain)).toBe(44);
    // A request that says the theme's branding, or nothing, draws the same bytes.
    expect(text(exportOf("still", "svg", { branding: "theme" }))).toBe(branded);
  });

  it("leaves the branding out of the player's pictures and of a video's frames", () => {
    // The player holds its scenes as data: the frame is a group whose role says so.
    const framed = /"role":"frame"/;
    const player = text(exportOf("checkout", "html"));
    expect(player).toMatch(framed);
    expect(text(exportOf("checkout", "html", { branding: "none" }))).not.toMatch(framed);
    const branded = video(exportOf("checkout", "gif", { durationMs: 1000 }));
    const plain = video(exportOf("checkout", "gif", { durationMs: 1000, branding: "none" }));
    // A video keeps its format's size; the scene it records has no frame.
    expect(branded.video.html).toMatch(framed);
    expect(plain.video.html).not.toMatch(framed);
    expect([plain.video.width, plain.video.height]).toEqual([
      branded.video.width,
      branded.video.height,
    ]);
  });
});
