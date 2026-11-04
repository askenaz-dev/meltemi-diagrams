// The picture a project's thumbnail is made of: the open diagram as the static SVG the SVG export
// writes (`produceExport` with the export dialog's defaults: the theme of the file, embedded fonts, no
// motion), or nothing when the open file draws nothing. It reads the Studio and nothing else, so it
// runs in Node as in the browser.

import { produceExport, type ExportContext, type ExportRequest } from "@meltemi/diagrams-editor";
import type { OpenAnalysis, Studio } from "../studio.js";
import type { ThumbnailRender } from "./thumbnails.js";

const NONE: ThumbnailRender = { kind: "none" };

/**
 * Whether the analysis of the open file has a diagram that draws: the file is a `.meltemi` source
 * with at least one diagram laid out. A file that holds only a `model` block, a text that is not a
 * diagram and a diagram with errors draw nothing.
 */
export function drawsSomething(analysis: OpenAnalysis | undefined): boolean {
  return analysis?.document?.diagrams.some((view) => Boolean(view.layout?.scene)) === true;
}

/** The export dialog's request for an SVG of a diagram, as `baseRequest` makes it there. */
function svgRequest(target: ExportRequest["target"]): ExportRequest {
  return {
    target,
    format: "svg",
    theme: null,
    fonts: "embedded",
    motion: "static",
    at: null,
    scenario: undefined,
    scale: 2,
    size: null,
    background: null,
    link: null,
    embed: false,
    autoplay: false,
    loop: false,
    fps: null,
    durationMs: null,
    out: null,
  };
}

/**
 * Renders the diagram the canvas shows (the first that draws when the canvas shows none) of the open
 * file. The work waits for every font and icon it reads, as an export does.
 */
export function renderThumbnail(studio: Studio): Promise<ThumbnailRender> {
  return studio.settled((): ThumbnailRender => {
    if (!studio.open.endsWith(".meltemi")) return NONE;
    const analysis = studio.document();
    const drawn = analysis?.diagrams.filter((view) => view.layout?.scene) ?? [];
    if (drawn.length === 0) return NONE;
    const projects = studio.projects;
    const absolute = studio.absolute(studio.open);
    const workspace = projects.forFile(absolute);
    const file = workspace.file(absolute);
    if (!file) return NONE;
    const current = studio.session.current;
    const shown = drawn.find((view) => view.id === current) ?? drawn[0]!;
    const diagram = file.compilation.document.diagrams.find((d) => d.id === shown.id);
    if (!diagram) return NONE;
    const context: ExportContext = {
      file,
      workspace,
      projects,
      playerScript: () => "",
      report: () => undefined,
      printed: new Set(),
    };
    const output = produceExport(context, svgRequest({ kind: "diagram", diagram, owner: file }));
    return "text" in output ? { kind: "svg", svg: output.text } : NONE;
  });
}
