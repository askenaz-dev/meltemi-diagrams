// The preview tool (`mcp-previews`): a diagram or a story's frame of the project as it is now, with
// a report beside it. The endpoint draws it in the project's renderer object, the local server in its
// own process, both with the engine of `../preview/`.

import * as z from "zod";
import { MAX_PNG_WIDTH, MIN_PNG_WIDTH } from "../preview/bounds.js";
import { define } from "../serve.js";
import { diagnosticSchema, pathArg, projectArg } from "../shapes.js";

/** The report beside a picture. */
export const reportSchema = z.object({
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

/** The tools of this file, by name, in the catalogue's order. */
export const PREVIEW_TOOLS = {
  preview: define({
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
  }),
} as const;
