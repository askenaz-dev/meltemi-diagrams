// The tools of a folder (`mcp-local-server`, "A folder with no account"): `mdg mcp --folder <dir>`
// checks and draws the `.meltemi` files of a folder on disk, with no account and no network, so an
// agent working in a repository gets the same pictures as tool results. Two tools, with the cloud
// tools' names, words and reports, without a project or a revision.

import * as z from "zod";
import { MAX_PNG_WIDTH, MIN_PNG_WIDTH } from "../preview/bounds.js";
import { define } from "../serve.js";
import { diagnosticSchema } from "../shapes.js";
import { reportSchema } from "./preview.js";

/** A file's path from the folder's root. */
const folderPathArg = z
  .string()
  .min(1)
  .max(1024)
  .describe("A file's path from the folder's root, such as `flows/checkout.meltemi`.");

/** The two tools of a folder, by name. */
export const FOLDER_TOOLS = {
  validate: define({
    name: "validate",
    title: "Validate",
    description:
      "The diagnostics of a file of the folder, or of the whole folder as a project, as `meltemi-diagrams validate` prints them (the layout's warnings included), read from disk now. Images and fonts are checked by preview.",
    scope: "projects:read",
    input: z.object({ path: folderPathArg.optional() }),
    output: z.object({
      errors: z.number(),
      warnings: z.number(),
      diagnostics: z.array(diagnosticSchema).describe("The first fifty."),
      truncated: z.boolean(),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
  preview: define({
    name: "preview",
    title: "Preview",
    description: `A picture of a diagram (the file's first, or the one named) or of a story's frame (at \`at\`, its end by default) of the folder as it is on disk now, drawn on this machine with the command line's engine: a PNG ${MIN_PNG_WIDTH} to ${MAX_PNG_WIDTH} pixels wide (1280 by default), or with format svg the SVG as text. A report beside it says the size, the elements and relations drawn, the warnings and the fonts that were estimated, so the drawing can be judged without seeing it.`,
    scope: "projects:read",
    preview: true,
    input: z.object({
      path: folderPathArg.describe("The .meltemi file to draw."),
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
    output: reportSchema.omit({ revision: true }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
} as const;

export type FolderToolName = keyof typeof FOLDER_TOOLS;

/** What `initialize` answers for a folder. */
export function folderInstructions(): string {
  return [
    "These tools check and draw the Meltemi Diagrams files of a folder on this machine, where diagrams are `.meltemi` text files: validate reports their diagnostics and preview answers a picture of a diagram or of a story's frame, read from disk at each call.",
    "Write the files with your own file tools, then validate and preview to judge the drawing.",
    "The language and its rules are taught by the Meltemi Diagrams skill (https://diagrams.meltemi.dev/agent-setup).",
  ].join(" ");
}
