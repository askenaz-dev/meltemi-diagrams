// The preview tool (`mcp-previews`): a diagram or a story's frame of the project as it is now, drawn by
// the project's renderer object with the command line's engine (`renderer.ts`, `renderer-core.ts`),
// never in the Worker's request path. The Worker reads the room's snapshot and the bytes of the
// images and fonts it uses, and hands them over; the object answers the picture and its report, or
// says why it drew nothing. An account asks for at most thirty previews a minute.

import * as z from "zod";
import { requireProjectAccess } from "../access.js";
import { fail } from "../errors.js";
import { MAX_PNG_WIDTH, MIN_PNG_WIDTH } from "../renderer-protocol.js";
import { diagnosticSchema, drawingBinaries, pathArg, projectArg, toBase64 } from "./shapes.js";
import { tool, type AnyTool } from "./tool.js";

const TEXT = new TextDecoder();

const reportSchema = z.object({
  revision: z.number().describe("The revision the picture was drawn at."),
  format: z.enum(["png", "svg"]),
  width: z.number().describe("Pixels of a PNG, units of an SVG."),
  height: z.number(),
  elements: z.number(),
  relations: z.number(),
  diagnostics: z.array(diagnosticSchema).describe("Warnings of the file and of its layout."),
  estimatedFonts: z
    .array(z.string())
    .describe("Families the server does not hold: measured and drawn with the bundled fallback."),
  truncated: z.boolean(),
  fitted: z
    .boolean()
    .optional()
    .describe("A PNG drawn narrower than asked, to stay within four megapixels."),
  cached: z.boolean(),
});

const preview = tool({
  name: "preview",
  title: "Preview",
  description: `A picture of a diagram (the file's first, or the one named) or of a story's frame (at \`at\`, its end by default), drawn on the server from the project as it is now with the command line's engine: a PNG ${MIN_PNG_WIDTH} to ${MAX_PNG_WIDTH} pixels wide (1280 by default), or with format svg the SVG as text. A report beside it says the revision, the size, the elements and relations drawn, the warnings and the fonts that were estimated, so the drawing can be judged without seeing it.`,
  scope: "projects:read",
  preview: true,
  input: z.object({
    project: projectArg,
    path: pathArg.describe("The .meltemi file to draw."),
    diagram: z.string().optional().describe("The diagram's id; the file's first when left out."),
    story: z.string().optional().describe("A story's id: its frame at `at` is drawn instead."),
    at: z
      .string()
      .optional()
      .describe("The story's time, such as 2.4s or 1500ms; its end by default."),
    format: z.enum(["png", "svg"]).optional(),
    width: z
      .number()
      .int()
      .optional()
      .describe(`A PNG's width in pixels, ${MIN_PNG_WIDTH} to ${MAX_PNG_WIDTH}.`),
    theme: z
      .string()
      .optional()
      .describe("A theme over the diagram's own, as the command line's --theme."),
  }),
  output: reportSchema,
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(session, args) {
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
    const renderers = op.deps.renderers;
    if (!renderers) throw fail("internal");
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
  },
});

export const PREVIEW_TOOLS: readonly AnyTool[] = [preview];
