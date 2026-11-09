// The preview tool (`mcp-previews`): a diagram or a story's frame of the project as it is now, drawn by
// the project's renderer object with the command line's engine (`renderer.ts`, the core of
// `@meltemi/diagrams-mcp/preview`), never in the Worker's request path. The Worker reads the room's
// snapshot and the bytes of the images and fonts it uses, and hands them over; the object answers
// the picture and its report, or says why it drew nothing. An account asks for at most thirty
// previews a minute.

import { TOOLS, toBase64 } from "@meltemi/diagrams-mcp";
import { MAX_PNG_WIDTH, MIN_PNG_WIDTH } from "@meltemi/diagrams-mcp/preview";
import { requireProjectAccess } from "../access.js";
import { fail } from "../errors.js";
import { drawingBinaries, renderersOf } from "./shapes.js";
import { implement, type AnyImplementation } from "./tool.js";

const TEXT = new TextDecoder();

const preview = implement(TOOLS.preview, async (session, args) => {
  const { op } = session;
  const { project, path } = args;
  const format = args.format ?? "png";
  // The width first, before anything is read: a request the renderer would refuse costs nothing.
  if (args.width !== undefined) {
    if (format !== "png")
      throw fail("request.invalid", "width is for a PNG; an SVG is drawn at its own size.");
    if (args.width > MAX_PNG_WIDTH) {
      throw fail("request.invalid", `width is over the limit of ${MAX_PNG_WIDTH} pixels.`, {
        limit: MAX_PNG_WIDTH,
      });
    }
    if (args.width < MIN_PNG_WIDTH) {
      throw fail("request.invalid", `width is under ${MIN_PNG_WIDTH} pixels.`, {
        limit: MIN_PNG_WIDTH,
      });
    }
  }
  await requireProjectAccess(op, project, "read");
  const renderers = renderersOf(op);
  const latest = await op.deps.rooms.read(project);
  if (!Object.hasOwn(latest.files, path) || !path.endsWith(".meltemi")) {
    throw fail("request.invalid", `The project has no .meltemi file ${path}.`);
  }
  const binaries = await drawingBinaries(op, latest);
  const outcome = await renderers.render(project, {
    revision: latest.revision,
    files: latest.files,
    binaries,
    file: path,
    format,
    ...(args.diagram !== undefined ? { diagram: args.diagram } : {}),
    ...(args.story !== undefined ? { story: args.story } : {}),
    ...(args.at !== undefined ? { at: args.at } : {}),
    ...(args.width !== undefined ? { width: args.width } : {}),
    ...(args.theme !== undefined ? { theme: args.theme } : {}),
  });
  if (!outcome.ok) {
    throw fail(
      outcome.code,
      outcome.message,
      outcome.diagnostics ? { diagnostics: outcome.diagnostics } : undefined,
    );
  }
  const report = {
    ...outcome.report,
    diagnostics: [...outcome.report.diagnostics],
    estimatedFonts: [...outcome.report.estimatedFonts],
    cached: outcome.cached,
  };
  return {
    structured: report,
    content:
      outcome.contentType === "image/png"
        ? [{ type: "image", data: toBase64(outcome.bytes), mimeType: "image/png" }]
        : [{ type: "text", text: TEXT.decode(outcome.bytes) }],
  };
});

const inspectStory = implement(TOOLS.inspect_story, async (session, { project, path, story }) => {
  const { op } = session;
  await requireProjectAccess(op, project, "read");
  const latest = await op.deps.rooms.read(project);
  if (!Object.hasOwn(latest.files, path) || !path.endsWith(".meltemi")) {
    throw fail("request.invalid", `The project has no .meltemi file ${path}.`);
  }
  const result = await renderersOf(op).inspectStory(project, {
    revision: latest.revision,
    files: latest.files,
    file: path,
    story,
  });
  if (!result.ok)
    throw fail(
      result.code,
      result.message,
      result.diagnostics ? { diagnostics: result.diagnostics } : undefined,
    );
  return { structured: result.inspection };
});

export const PREVIEW_TOOLS: readonly AnyImplementation[] = [preview, inspectStory];
