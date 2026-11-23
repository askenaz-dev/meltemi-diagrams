// The preview tool (`mcp-previews`): a diagram, still or with its effects at an instant, or a
// story's frame of the project as it is now, with a report beside it. The endpoint draws it in the
// project's renderer object, the local server in its own process, both with the engine of
// `../preview/`.

import * as z from "zod";
import { MAX_PNG_WIDTH, MIN_PNG_WIDTH } from "../preview/bounds.js";
import type { RenderReport } from "../preview/protocol.js";
import { define } from "../serve.js";
import { diagnosticSchema, pathArg, projectArg } from "../shapes.js";

/** One effect of a diagram in the frame drawn (`ReportEffect`). */
const effectSchema = z.object({
  target: z.string().describe("The id the effect runs on: the `data-id` of its group in the SVG."),
  role: z
    .enum(["relation", "element", "event"])
    .describe("What the target is: the `data-role` of its group."),
  effect: z.enum(["flow", "dash", "pulse", "trace"]),
  durationMs: z.number().describe("One cycle of the effect."),
  delayMs: z.number(),
  repeat: z.union([z.number(), z.literal("forever")]),
  direction: z.enum(["forward", "reverse"]),
  phase: z
    .number()
    .nullable()
    .describe(
      "How far the effect is through its cycle, 0 to 1; null before its delay or after its last repeat, when the target is drawn without it.",
    ),
  marks: z
    .array(
      z.object({
        x: z.number(),
        y: z.number(),
        along: z
          .number()
          .describe("The share of the line travelled, 0 to 1, in the effect's direction."),
      }),
    )
    .describe(
      "What moves along the line: each particle of a flow and the head of a trace, by its centre in the picture's coordinates (units of an SVG, pixels of a PNG). Empty for a dash and a pulse.",
    ),
});

/** Where a diagram's effects are in the frame drawn (`ReportMotion`). */
export const motionSchema = z.object({
  atMs: z.number().describe("The instant drawn."),
  loopMs: z
    .number()
    .nullable()
    .describe("One loop of every effect together; null when there is none under ten seconds."),
  effects: z
    .array(effectSchema)
    .describe("The effects whose targets are drawn, the first fifty; empty when nothing moves."),
  truncated: z.boolean(),
});

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
  motion: motionSchema
    .optional()
    .describe(
      "A diagram drawn with `at`: where the frame draws each of its effects. Two frames at different instants show a mark advancing along its arrow.",
    ),
  cached: z.boolean(),
});

/** A preview's report as the tools answer it: the renderer's, and whether it came from the cache. */
export type PreviewReport = z.infer<typeof reportSchema>;

/** The tools' answer for a renderer's report, with lists of its own. */
export function previewReport(report: RenderReport, cached: boolean): PreviewReport {
  const { motion, ...rest } = report;
  return {
    ...rest,
    diagnostics: [...report.diagnostics],
    estimatedFonts: [...report.estimatedFonts],
    ...(motion
      ? {
          motion: {
            ...motion,
            effects: motion.effects.map((effect) => ({
              ...effect,
              marks: effect.marks.map((mark) => ({ ...mark })),
            })),
          },
        }
      : {}),
    cached,
  };
}

/** What `preview` draws, for the descriptions of both catalogues. */
export const PREVIEW_SUBJECT =
  "A picture of a diagram (the file's first, or the one named), still or with `at` its effects (`animate`) at that instant, or of a story's frame (at `at`, its end by default)";

/** What the report says, for the descriptions of both catalogues. */
export const PREVIEW_MOTION =
  "For a diagram drawn with `at`, its `motion` gives each effect's phase and where its marks are, so two frames at different instants prove an arrow is animated; a story is not needed for that.";

/** The arguments of a picture that both catalogues share. */
export const pictureArgs = {
  diagram: z.string().optional().describe("The diagram's id; the file's first when left out."),
  story: z.string().optional().describe("A story's id: its frame at `at` is drawn instead."),
  at: z
    .string()
    .optional()
    .describe(
      "A time such as 2.4s or 1500ms. With `story`, the story's frame at that time (its end by default). Without `story`, the diagram with its effects (`animate`) at that time; left out, the diagram is drawn still.",
    ),
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
} as const;

/** The tools of this file, by name, in the catalogue's order. */
export const PREVIEW_TOOLS = {
  preview: define({
    name: "preview",
    title: "Preview",
    description: `${PREVIEW_SUBJECT}, drawn on the server from the project as it is now with the command line's engine: a PNG ${MIN_PNG_WIDTH} to ${MAX_PNG_WIDTH} pixels wide (1280 by default), or with format svg the SVG as text. A report beside it says the revision, the size, the elements and relations drawn, the warnings and the fonts that were estimated, so the drawing can be judged without seeing it. ${PREVIEW_MOTION}`,
    scope: "projects:read",
    preview: true,
    input: z.object({
      project: projectArg,
      path: pathArg.describe("The .meltemi file to draw."),
      ...pictureArgs,
    }),
    output: reportSchema,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
} as const;
