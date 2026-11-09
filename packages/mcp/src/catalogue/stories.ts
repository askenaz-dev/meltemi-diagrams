import * as z from "zod";
import type { InspectionAction } from "../preview/inspection.js";
import { define } from "../serve.js";
import { diagnosticSchema, pathArg, projectArg } from "../shapes.js";

const actionSchema: z.ZodType<InspectionAction> = z.lazy(() =>
  z.object({
    kind: z.string(),
    path: z.array(z.number().int()),
    targets: z.array(z.object({ id: z.string(), kind: z.string() })),
    all: z.boolean(),
    startMs: z.number(),
    endMs: z.number(),
    durationMs: z.number(),
    children: z.array(actionSchema),
    line: z.number(),
  }),
);

export const storyInspectionSchema = z.object({
  revision: z
    .number()
    .describe("Snapshot revision; folder mode uses a content-derived snapshot identity."),
  path: z.string(),
  id: z.string(),
  title: z.string().nullable(),
  durationMs: z.number().describe("Compiled total duration, including transitions and holds."),
  views: z.array(z.string()),
  scenes: z.array(
    z.object({
      id: z.string(),
      title: z.string().nullable(),
      view: z.string(),
      startMs: z.number(),
      endMs: z.number(),
      durationMs: z.number(),
      stillAtMs: z
        .number()
        .describe("Final-state preview instant, just before the next scene starts."),
      transition: z
        .object({
          kind: z.string(),
          startMs: z.number(),
          endMs: z.number(),
          durationMs: z.number(),
        })
        .nullable(),
      actions: z.array(actionSchema),
      line: z.number(),
    }),
  ),
  diagnostics: z.array(diagnosticSchema),
  truncated: z.boolean(),
});

export const INSPECT_STORY_INPUT = {
  path: pathArg.describe("The .meltemi file holding the story."),
  story: z.string().min(1).describe("The story id to inspect."),
};

export const STORY_TOOLS = {
  inspect_story: define({
    name: "inspect_story",
    title: "Inspect story timeline",
    description:
      "The named story's compiled timeline at the project's current revision: total duration, ordered scenes and their active views, start/end/duration, transitions, nested action intervals and final-state preview times, all in milliseconds. Read-only; use this before previewing scene boundaries. A later write or preview has its own revision, so compare snapshots. At most 10000 scenes/actions are reported; larger inspections are refused.",
    scope: "projects:read",
    input: z.object({ project: projectArg, ...INSPECT_STORY_INPUT }),
    output: storyInspectionSchema,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
} as const;
